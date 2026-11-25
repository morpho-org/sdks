import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import * as zlib from "node:zlib";

const supportsZstd = () => {
  try {
    if (
      typeof zlib.zstdCompressSync !== "function" ||
      typeof zlib.zstdDecompressSync !== "function"
    ) {
      return false;
    }
    zlib.zstdDecompressSync(zlib.zstdCompressSync("{}"));
    return true;
  } catch {
    return false;
  }
};

type Cache = {
  meta: Record<string, unknown>;
  accounts: Record<string, unknown>;
  storage: Record<string, Record<string, unknown>>;
  block_hashes: Record<string, unknown>;
  block_hash_cache_version: number;
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readCache = async (path: string): Promise<Cache> => {
  const value: unknown = JSON.parse(
    zlib.zstdDecompressSync(await readFile(path)).toString(),
    (_key, entry: unknown) => {
      if (typeof entry === "number" && !Number.isSafeInteger(entry)) {
        throw new RangeError("Unsupported cache number");
      }
      return entry;
    },
  );
  if (
    !record(value) ||
    !record(value.meta) ||
    !record(value.accounts) ||
    !record(value.storage) ||
    !Object.values(value.storage).every(record) ||
    !record(value.block_hashes) ||
    value.block_hash_cache_version !== 1 ||
    !record(value.meta.block_env) ||
    typeof value.meta.fork_hash !== "string" ||
    typeof value.meta.source_id !== "string" ||
    typeof value.meta.account_fetch_policy !== "string"
  ) {
    throw new TypeError("Unsupported fork cache");
  }
  return value as Cache;
};

const compatibleMeta = (left: Cache, right: Cache) =>
  ["block_env", "fork_hash", "source_id", "account_fetch_policy"].every((key) =>
    isDeepStrictEqual(left.meta[key], right.meta[key]),
  );

// Snapshots of one pinned block can disagree on a key Anvil wrote locally (such as an EIP-4788
// beacon root). Keep the shared value for that key and still merge the snapshot's other keys.
const union = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) => ({
  ...right,
  ...left,
});

function mergeCache(existing: Cache, incoming: Cache): Cache {
  const storage = { ...existing.storage };
  for (const [address, slots] of Object.entries(incoming.storage)) {
    storage[address] = union(storage[address] ?? {}, slots);
  }
  return {
    ...existing,
    accounts: union(existing.accounts, incoming.accounts),
    storage,
    block_hashes: union(existing.block_hashes, incoming.block_hashes),
  };
}

const directoryEntries = (root: string) =>
  readdir(root, { withFileTypes: true }).catch((error) => {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) {
      return [];
    }
    throw error;
  });

const files = async (root: string): Promise<string[]> => {
  const entries = await directoryEntries(root);
  return (
    await Promise.all(
      entries.map(async (entry) => {
        if (/\.lock(?:\.|$)|\.tmp$/.test(entry.name)) {
          return [];
        }
        if (entry.isDirectory()) {
          return (await files(join(root, entry.name))).map((path) =>
            join(entry.name, path),
          );
        }
        return entry.isFile() ? [entry.name] : [];
      }),
    )
  ).flat();
};

const digest = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const acquireLock = async (lock: string) => {
  const owner = `owner-${randomUUID()}`;
  const pending = `${lock}.${owner}`;
  await mkdir(pending);
  try {
    await writeFile(join(pending, owner), "");
    for (let attempt = 0; attempt < 500; attempt++) {
      const owners = await readdir(lock).catch(() => undefined);
      if (owners === undefined) {
        try {
          await rename(pending, lock);
          return async () => {
            await rm(join(lock, owner), { force: true }).catch(() => {});
            await rmdir(lock).catch(() => {});
          };
        } catch {}
      } else {
        const locked = await stat(lock).catch(() => undefined);
        if (locked && Date.now() - locked.mtimeMs > 30_000) {
          // Remove only observed owners; a successor's nonempty lock cannot be removed.
          for (const name of owners) {
            if (/^owner-[a-f0-9-]{36}$/.test(name)) {
              await rm(join(lock, name), { force: true }).catch(() => {});
            }
          }
          await rmdir(lock).catch(() => {});
        }
      }
      await setTimeout(10);
    }
    return undefined;
  } finally {
    await rm(pending, { recursive: true, force: true }).catch(() => {});
  }
};

/**
 * Seeds a private Anvil home and merges compatible RPC cache snapshots after exit.
 * @internal
 * Cache failures are best-effort and never reject launcher cleanup.
 * @param shared Shared Foundry RPC cache directory.
 * @param block Pinned fork block; unknown blocks seed the full cache. All chain directories are considered because the source chain can differ from the local chain ID.
 * @returns Private home and an idempotent merge/cleanup operation, or undefined on setup failure.
 * @example
 * ```ts
 * const cache = await isolateForkCache();
 * // Spawn Anvil with HOME=cache?.home, then wait for its close event.
 * await cache?.close();
 * ```
 */
export const isolateForkCache = async (
  shared = join(homedir(), ".foundry/cache/rpc"),
  block?: number | bigint,
) => {
  if (!supportsZstd()) {
    return undefined;
  }
  let home: string | undefined;
  try {
    home = await mkdtemp(join(tmpdir(), "anvil-cache-"));
    const privateHome = home;
    const isolated = join(privateHome, ".foundry/cache/rpc");
    await mkdir(isolated, { recursive: true });
    const seeded = new Map<string, string>();
    const directories =
      block !== undefined && block >= 0
        ? (await directoryEntries(shared))
            .filter(
              (entry) =>
                entry.isDirectory() && !/\.lock(?:\.|$)/.test(entry.name),
            )
            .map((entry) => join(entry.name, String(block)))
        : [""];
    for (const directory of directories) {
      for (const file of await files(join(shared, directory))) {
        const path = join(directory, file);
        try {
          await mkdir(join(isolated, path, ".."), { recursive: true });
          await cp(join(shared, path), join(isolated, path));
          seeded.set(path, await digest(join(isolated, path)));
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              ["ENOENT", "EACCES", "EPERM"].includes(String(error.code))
            )
          ) {
            throw error;
          }
        }
      }
    }
    let closed: Promise<void> | undefined;
    return {
      home,
      close: () =>
        (closed ??= (async () => {
          try {
            await mkdir(shared, { recursive: true });
            for (const path of await files(isolated)) {
              if (seeded.get(path) === (await digest(join(isolated, path)))) {
                continue;
              }
              const target = join(shared, path);
              const lock = `${target}.lock`;
              let release: (() => Promise<void>) | undefined;
              let temporary: string | undefined;
              try {
                await mkdir(join(target, ".."), { recursive: true });
                release = await acquireLock(lock);
                if (!release) {
                  continue;
                }
                let incoming: Cache;
                try {
                  if (!/storage-[a-f0-9]{64}\.json$/.test(path)) {
                    throw new TypeError("Unsupported cache filename");
                  }
                  incoming = await readCache(join(isolated, path));
                } catch {
                  temporary = `${target}.${randomUUID()}.tmp`;
                  await cp(join(isolated, path), temporary);
                  await rename(temporary, target);
                  continue;
                }
                let existing: Cache | undefined;
                try {
                  existing = await readCache(target);
                } catch {}
                if (!existing || !compatibleMeta(existing, incoming)) {
                  temporary = `${target}.${randomUUID()}.tmp`;
                  await cp(join(isolated, path), temporary);
                  await rename(temporary, target);
                  continue;
                }
                const merged = mergeCache(existing, incoming);
                temporary = `${target}.${randomUUID()}.tmp`;
                await writeFile(
                  temporary,
                  zlib.zstdCompressSync(JSON.stringify(merged)),
                );
                await rename(temporary, target);
              } catch {
              } finally {
                if (temporary) {
                  await rm(temporary, { force: true }).catch(() => {});
                }
                await release?.();
              }
            }
          } catch {
          } finally {
            await rm(privateHome, { recursive: true, force: true }).catch(
              () => {},
            );
          }
        })()),
    };
  } catch {
    if (home) {
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
    return undefined;
  }
};
