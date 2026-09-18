import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  foldEntryPath,
  listTarballEntries,
  loadBundledTar,
  main,
  verifyTarballEntries,
} from "./verify-tarball-collisions.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "verify-tarball-collisions.ts",
);
const NPM_ROOT = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();

async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "tarball-collisions-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

interface TarballOptions {
  readonly entries: readonly string[];
  readonly symlinks?: Readonly<Record<string, string>>;
}

function buildTarball(dir: string, options: TarballOptions): string {
  const { entries, symlinks = {} } = options;
  for (const entry of entries) {
    const target = join(dir, entry);
    if (entry.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `{"entry":"${entry}"}`);
  }
  for (const [entry, target] of Object.entries(symlinks)) {
    const link = join(dir, entry);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link);
  }

  const tgz = join(dir, "out.tgz");
  execFileSync("tar", [
    "-czf",
    tgz,
    "-C",
    dir,
    "--format=ustar",
    "--no-recursion",
    ...entries,
    ...Object.keys(symlinks),
  ]);
  return tgz;
}

function buildFileDirectoryCollisionTarball(dir: string): string {
  const first = join(dir, "first");
  const second = join(dir, "second");
  mkdirSync(join(first, "package"), { recursive: true });
  writeFileSync(join(first, "package/package.json"), "{}");
  writeFileSync(join(first, "package/lib"), "file");
  mkdirSync(join(second, "package/lib"), { recursive: true });

  const archive = join(dir, "out.tar");
  execFileSync("tar", [
    "-cf",
    archive,
    "-C",
    first,
    "--format=ustar",
    "--no-recursion",
    "package/package.json",
    "package/lib",
  ]);
  execFileSync("tar", [
    "--append",
    "-f",
    archive,
    "-C",
    second,
    "--no-recursion",
    "package/lib",
  ]);
  const tgz = join(dir, "out.tgz");
  const compressed = execFileSync("gzip", ["-c", archive]);
  writeFileSync(tgz, compressed);
  return tgz;
}

function tarReader() {
  return loadBundledTar(NPM_ROOT);
}

describe("verifyTarballEntries", () => {
  test("default: accepts a normal package tarball", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json", "package/index.js"],
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).resolves.toBeUndefined();
    });
  });

  test("error: rejects case-colliding entries", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json", "package/Package.json"],
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/collide/);
    });
  });

  test("error: rejects dot-alias entries", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: [
          "package/",
          "package/package.json",
          "package/\\./package.json",
        ],
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/collide/);
    });
  });

  test("error: rejects file and directory collisions", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildFileDirectoryCollisionTarball(dir);

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/collide/);
    });
  });

  test("error: rejects entries outside package", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json", "zzz/package.json"],
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/outside package/);
    });
  });

  test("error: rejects symlink entries", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json"],
        symlinks: { "package/link": "package.json" },
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/unsupported type/);
    });
  });

  test("error: rejects a tarball without package.json", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/index.js"],
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/no package\/package\.json/);
    });
  });

  test("unit: folds separators, dot segments, and case", () => {
    expect(foldEntryPath("package/\\./Package.JSON")).toBe(
      "package/package.json",
    );
    expect(() => foldEntryPath("package/../x")).toThrow(
      /escapes the archive root/,
    );
  });

  test("error: missing tarball argument reports usage", async () => {
    await expect(main(undefined)).rejects.toThrow(/Usage/);
  });

  test("behavior: CLI reports accepted entry count", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json"],
      });
      const result = spawnSync(process.execPath, [SCRIPT, tgz], {
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("2 entries OK\n");
    });
  });

  test("error: wraps lister failures with their cause", async () => {
    await expect(
      listTarballEntries("missing.tgz", {
        list: async () => {
          throw new Error("broken");
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Unable to list tarball/),
      cause: expect.anything(),
    });
  });
});
