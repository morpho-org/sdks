import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { afterEach, describe, expect, test, vi } from "vitest";
import { isolateForkCache } from "./forkCache.js";

const { readErrors, readPaths } = vi.hoisted(() => ({
  readErrors: new Map<string, string>(),
  readPaths: new Set<string>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readdir: (...args: Parameters<typeof original.readdir>) => {
      const path = String(args[0]);
      readPaths.add(path);
      const code = readErrors.get(path);
      if (code)
        return Promise.reject(
          Object.assign(new Error("Unreadable cache directory"), { code }),
        );
      return original.readdir(...args);
    },
  };
});

const roots: string[] = [];
const path = `mainnet/123/storage-${"a".repeat(64)}.json`;
const snapshot = (storage: Record<string, Record<string, string>> = {}) => ({
  meta: {
    block_env: { number: "0x7b" },
    fork_hash: "hash",
    source_id: "source",
    account_fetch_policy: "auto",
    hosts: ["rpc.invalid"],
  },
  accounts: { account: { balance: "0x1", nonce: 0 } },
  storage,
  block_hashes: { "122": "block-hash" },
  block_hash_cache_version: 1,
});
const write = async (root: string, value: unknown) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), zstdCompressSync(JSON.stringify(value)));
};
const read = async (root: string) =>
  JSON.parse(zstdDecompressSync(await readFile(join(root, path))).toString());
const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "fork-cache-test-"));
  roots.push(root);
  return root;
};
const isolate = async (root: string) => {
  const cache = await isolateForkCache(root);
  if (!cache) throw new Error("Expected private cache");
  roots.push(cache.home);
  return { ...cache, rpc: join(cache.home, ".foundry/cache/rpc") };
};
afterEach(async () => {
  readErrors.clear();
  readPaths.clear();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.sequential("isolateForkCache", () => {
  test.each(["EACCES", "EPERM", "ENOENT"])(
    "behavior: seeds pinned blocks despite unrelated directory %s",
    async (code) => {
      const shared = await setup();
      await write(shared, snapshot());
      const unrelated = join(shared, "mainnet/456");
      const unavailableChainBlock = join(shared, "base/123");
      await mkdir(unrelated, { recursive: true });
      await mkdir(unavailableChainBlock, { recursive: true });
      readErrors.set(unrelated, code);
      readErrors.set(unavailableChainBlock, code);
      const cache = await isolateForkCache(shared, 123);
      expect(cache).toBeDefined();
      if (!cache) return;
      roots.push(cache.home);
      expect(await read(join(cache.home, ".foundry/cache/rpc"))).toEqual(
        snapshot(),
      );
      expect(readPaths.has(unrelated)).toBe(false);
      expect(readPaths.has(unavailableChainBlock)).toBe(true);
      await cache.close();
    },
  );

  test.each(["storage.json", "future-cache.bin"])(
    "behavior: preserves unrecognised %s unchanged",
    async (name) => {
      const shared = await setup();
      const cache = await isolate(shared);
      const relative = join("mainnet/123", name);
      await mkdir(join(cache.rpc, "mainnet/123"), { recursive: true });
      await writeFile(join(cache.rpc, relative), "opaque snapshot");
      await cache.close();
      expect(await readFile(join(shared, relative), "utf8")).toBe(
        "opaque snapshot",
      );
    },
  );

  test("behavior: seeds relative blocks and ignores merge artifacts", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    await mkdir(`${join(shared, path)}.lock`);
    await writeFile(`${join(shared, path)}.temporary.tmp`, "temporary");
    const cache = await isolateForkCache(shared, -10);
    expect(cache).toBeDefined();
    if (!cache) return;
    roots.push(cache.home);
    const rpc = join(cache.home, ".foundry/cache/rpc");
    expect(await read(rpc)).toEqual(snapshot());
    await expect(stat(`${join(rpc, path)}.lock`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(`${join(rpc, path)}.temporary.tmp`),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await cache.close();
  });
  test("behavior: waits for a fresh lock instead of taking it over", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const cache = await isolate(shared);
    await write(cache.rpc, snapshot({ account: { "0x2": "0x22" } }));
    const lock = `${join(shared, path)}.lock`;
    await mkdir(lock);
    const closing = cache.close();
    try {
      await setTimeout(50);
      expect((await read(shared)).storage).toEqual({});
    } finally {
      await rm(lock, { recursive: true, force: true });
      await closing;
    }
    expect((await read(shared)).storage.account).toEqual({ "0x2": "0x22" });
  });

  test("behavior: recovers a lock abandoned more than thirty seconds ago", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const cache = await isolate(shared);
    await write(cache.rpc, snapshot({ account: { "0x2": "0x22" } }));
    const lock = `${join(shared, path)}.lock`;
    await mkdir(lock);
    await writeFile(join(lock, `owner-${"a".repeat(36)}`), "");
    const old = new Date(Date.now() - 31_000);
    await utimes(lock, old, old);
    await cache.close();
    expect((await read(shared)).storage.account).toEqual({ "0x2": "0x22" });
    await expect(stat(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("behavior: coordinates concurrent recovery of an abandoned lock", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const caches = await Promise.all([
      isolate(shared),
      isolate(shared),
      isolate(shared),
    ]);
    await Promise.all(
      caches.map((cache, index) =>
        write(cache.rpc, snapshot({ account: { [String(index)]: "0x1" } })),
      ),
    );
    const lock = `${join(shared, path)}.lock`;
    await mkdir(lock);
    const old = new Date(Date.now() - 31_000);
    await utimes(lock, old, old);
    await Promise.all(caches.map((cache) => cache.close()));
    expect((await read(shared)).storage.account).toEqual({
      "0": "0x1",
      "1": "0x1",
      "2": "0x1",
    });
  });

  test("behavior: seeds only pinned block directories without assuming a source chain", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    await mkdir(join(shared, "mainnet/456"));
    await writeFile(join(shared, "mainnet/456/unrelated"), "other block");
    await mkdir(join(shared, "base/123"), { recursive: true });
    await writeFile(join(shared, "base/123/source"), "other chain");
    const cache = await isolateForkCache(shared, 123n);
    expect(cache).toBeDefined();
    if (!cache) return;
    roots.push(cache.home);
    const rpc = join(cache.home, ".foundry/cache/rpc");
    expect(await read(rpc)).toEqual(snapshot());
    expect(await readFile(join(rpc, "base/123/source"), "utf8")).toBe(
      "other chain",
    );
    await expect(stat(join(rpc, "mainnet/456"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await cache.close();
  });

  test("behavior: starts empty if the pinned block is absent", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const cache = await isolateForkCache(shared, 456);
    expect(cache).toBeDefined();
    if (!cache) return;
    roots.push(cache.home);
    await expect(
      stat(join(cache.home, ".foundry/cache/rpc", path)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await cache.close();
    expect(await read(shared)).toEqual(snapshot());
  });

  test("behavior: does not rewrite snapshots the isolated instance never touched", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const before = await stat(join(shared, path), { bigint: true });
    const cache = await isolate(shared);
    await cache.close();
    const after = await stat(join(shared, path), { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeNs).toBe(before.mtimeNs);
  });

  test("behavior: isolates seeded caches and unions concurrent disjoint slots, accounts and blocks", async () => {
    const shared = await setup();
    await write(shared, snapshot({ account: { "0x1": "0x11" } }));
    const a = await isolate(shared);
    const b = await isolate(shared);
    expect(a.home).not.toBe(b.home);
    expect(await read(a.rpc)).toEqual(await read(shared));
    await write(a.rpc, snapshot({ account: { "0x1": "0x11", "0x2": "0x22" } }));
    await write(b.rpc, {
      ...snapshot({ other: { "0x3": "0x33" } }),
      accounts: { other: { balance: "0x2" } },
      block_hashes: { "121": "another-hash" },
    });
    await Promise.all([a.close(), b.close(), a.close()]);
    const merged = await read(shared);
    expect(merged.storage).toEqual({
      account: { "0x1": "0x11", "0x2": "0x22" },
      other: { "0x3": "0x33" },
    });
    expect(Object.keys(merged.accounts).sort()).toEqual(["account", "other"]);
    expect(Object.keys(merged.block_hashes).sort()).toEqual(["121", "122"]);
    expect(merged.meta).toEqual(snapshot().meta);
  });

  test("behavior: accepts missing destination and missing source without rejecting cleanup", async () => {
    const shared = join(await setup(), "missing");
    const cache = await isolate(shared);
    await write(cache.rpc, snapshot({ account: { "0x1": "0x11" } }));
    await cache.close();
    expect((await read(shared)).storage.account).toEqual({ "0x1": "0x11" });
    const empty = await isolate(join(await setup(), "absent"));
    await expect(empty.close()).resolves.toBeUndefined();
  });

  test("behavior: replaces a corrupt destination with the valid incoming file", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const cache = await isolate(shared);
    await write(cache.rpc, snapshot({ account: { "0x2": "0x22" } }));
    const incoming = await readFile(join(cache.rpc, path));
    await writeFile(join(shared, path), "not zstd");
    await expect(cache.close()).resolves.toBeUndefined();
    expect(await readFile(join(shared, path))).toEqual(incoming);
  });

  test.each([false, true])(
    "behavior: preserves rejected incoming files with existing target=%s",
    async (existing) => {
      for (const value of [
        Buffer.from("not zstd"),
        zstdCompressSync(
          JSON.stringify({ ...snapshot(), block_hash_cache_version: 99 }),
        ),
        zstdCompressSync(JSON.stringify({ ...snapshot(), storage: [] })),
        zstdCompressSync(
          JSON.stringify({
            ...snapshot(),
            accounts: { account: { nonce: 1e30 } },
          }),
        ),
      ]) {
        const shared = await setup();
        if (existing) await write(shared, snapshot());
        const cache = await isolate(shared);
        await mkdir(dirname(join(cache.rpc, path)), { recursive: true });
        await writeFile(join(cache.rpc, path), value);
        await expect(cache.close()).resolves.toBeUndefined();
        expect(await readFile(join(shared, path))).toEqual(value);
        await expect(stat(cache.home)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    },
  );

  test.each(["block_env", "fork_hash", "source_id", "account_fetch_policy"])(
    "behavior: replaces a destination with incompatible %s metadata",
    async (field) => {
      const shared = await setup();
      await write(shared, snapshot());
      const cache = await isolate(shared);
      const incoming = snapshot({ account: { "0x2": "0x22" } });
      await write(cache.rpc, {
        ...incoming,
        meta: {
          ...incoming.meta,
          [field]: field === "block_env" ? { number: "0x7c" } : "different",
        },
      });
      const bytes = await readFile(join(cache.rpc, path));
      await cache.close();
      expect(await readFile(join(shared, path))).toEqual(bytes);
    },
  );

  test("behavior: keeps shared conflicting slots and merges the rest", async () => {
    const shared = await setup();
    await write(
      shared,
      snapshot({ account: { "0x1": "0x11", "0x3": "0x33" } }),
    );
    const cache = await isolate(shared);
    await write(
      cache.rpc,
      snapshot({ account: { "0x1": "0x22", "0x2": "0x22" } }),
    );
    await expect(cache.close()).resolves.toBeUndefined();
    expect((await read(shared)).storage).toEqual({
      account: { "0x1": "0x11", "0x2": "0x22", "0x3": "0x33" },
    });
  });

  test("behavior: keeps shared conflicting accounts and merges the rest", async () => {
    const shared = await setup();
    await write(shared, snapshot());
    const cache = await isolate(shared);
    await write(cache.rpc, {
      ...snapshot({ account: { "0x2": "0x22" } }),
      accounts: {
        account: { balance: "0x2", nonce: 0 },
        other: { balance: "0x3", nonce: 0 },
      },
    });
    await expect(cache.close()).resolves.toBeUndefined();
    const merged = await read(shared);
    expect(merged.accounts).toEqual({
      account: { balance: "0x1", nonce: 0 },
      other: { balance: "0x3", nonce: 0 },
    });
    expect(merged.storage).toEqual({ account: { "0x2": "0x22" } });
  });

  test("behavior: fails open when the shared destination is not a directory", async () => {
    const file = join(await setup(), "file");
    await writeFile(file, "not a directory");
    const cache = await isolate(file);
    await expect(cache.close()).resolves.toBeUndefined();
  });
});
