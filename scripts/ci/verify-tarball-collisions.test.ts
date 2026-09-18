import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
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
  readonly format?: "pax" | "ustar";
  readonly symlinks?: Readonly<Record<string, string>>;
}

function buildTarball(dir: string, options: TarballOptions): string {
  const { entries, format = "ustar", symlinks = {} } = options;
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
    `--format=${format}`,
    "--no-recursion",
    ...entries,
    ...Object.keys(symlinks),
  ]);
  return tgz;
}

interface FileAncestorOptions {
  readonly ancestor: string;
  readonly descendant: string;
  readonly dir: string;
  readonly fileFirst: boolean;
}

function buildFileAncestorTarball({
  ancestor,
  descendant,
  dir,
  fileFirst,
}: FileAncestorOptions): string {
  const fileRoot = join(dir, "file");
  const descendantRoot = join(dir, "descendant");
  mkdirSync(dirname(join(fileRoot, ancestor)), { recursive: true });
  writeFileSync(join(fileRoot, ancestor), "file");
  if (ancestor !== "package/package.json") {
    mkdirSync(join(fileRoot, "package"), { recursive: true });
    writeFileSync(join(fileRoot, "package/package.json"), "{}");
  }
  mkdirSync(dirname(join(descendantRoot, descendant)), { recursive: true });
  writeFileSync(join(descendantRoot, descendant), "child");

  const archive = join(dir, "out.tar");
  const archiveRoot = fileFirst ? fileRoot : descendantRoot;
  const archiveEntry = fileFirst ? ancestor : descendant;
  execFileSync("tar", [
    "-cf",
    archive,
    "-C",
    archiveRoot,
    "--format=ustar",
    "--no-recursion",
    ...(fileFirst && ancestor !== "package/package.json"
      ? ["package/package.json", archiveEntry]
      : [archiveEntry]),
  ]);

  const appendRoot = fileFirst ? descendantRoot : fileRoot;
  const appendEntries = fileFirst
    ? [descendant]
    : ancestor === "package/package.json"
      ? [ancestor]
      : ["package/package.json", ancestor];
  execFileSync("tar", [
    "--append",
    "-f",
    archive,
    "-C",
    appendRoot,
    "--no-recursion",
    ...appendEntries,
  ]);

  const tgz = join(dir, "out.tgz");
  writeFileSync(tgz, execFileSync("gzip", ["-c", archive]));
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

function corruptSecondHeaderChecksum(tgz: string): void {
  const tar = gunzipSync(readFileSync(tgz));
  tar.fill(0, 512 + 148, 512 + 156);
  writeFileSync(tgz, gzipSync(tar));
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

  test.each([true, false])(
    "error: rejects file ancestor collisions (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const tgz = buildFileAncestorTarball({
          ancestor: "package/lib",
          descendant: "package/lib/x.js",
          dir,
          fileFirst,
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/ancestor/);
      });
    },
  );

  test("error: rejects a manifest file ancestor", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildFileAncestorTarball({
        ancestor: "package/package.json",
        descendant: "package/package.json/x",
        dir,
        fileFirst: true,
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/ancestor/);
    });
  });

  test.each([true, false])(
    "error: rejects a gitignore rename ancestor collision (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const tgz = buildFileAncestorTarball({
          ancestor: "package/config/.gitignore",
          descendant: "package/config/.npmignore/child.js",
          dir,
          fileFirst,
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/ancestor/);
      });
    },
  );

  test.each([true, false])(
    "default: tolerates a literal npmignore sibling (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const ignoreEntries = fileFirst
          ? ["package/config/.gitignore", "package/config/.npmignore"]
          : ["package/config/.npmignore", "package/config/.gitignore"];
        const tgz = buildTarball(dir, {
          entries: ["package/", "package/package.json", ...ignoreEntries],
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).resolves.toBeUndefined();
      });
    },
  );

  test.each([true, false])(
    "error: rejects a case-mismatched npmignore sibling (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const ignoreEntries = fileFirst
          ? ["package/config/.gitignore", "package/config/.NPMIGNORE"]
          : ["package/config/.NPMIGNORE", "package/config/.gitignore"];
        const tgz = buildTarball(dir, {
          entries: ["package/", "package/package.json", ...ignoreEntries],
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/collide/);
      });
    },
  );

  test.each([true, false])(
    "error: rejects a backslash npmignore sibling (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const ignoreEntries = fileFirst
          ? ["package/config/.gitignore", "package/config\\.npmignore"]
          : ["package/config\\.npmignore", "package/config/.gitignore"];
        const tgz = buildTarball(dir, {
          entries: ["package/", "package/package.json", ...ignoreEntries],
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/collide/);
      });
    },
  );

  test.each([true, false])(
    "error: rejects a directory npmignore sibling (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const ignoreEntries = fileFirst
          ? ["package/config/.gitignore", "package/config/.npmignore/"]
          : ["package/config/.npmignore/", "package/config/.gitignore"];
        const tgz = buildTarball(dir, {
          entries: ["package/", "package/package.json", ...ignoreEntries],
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/collide/);
      });
    },
  );

  test.each([true, false])(
    "error: rejects a case-folded gitignore rename ancestor (%s order)",
    async (fileFirst) => {
      await withTempDir(async (dir) => {
        const tgz = buildFileAncestorTarball({
          ancestor: "package/.gitignore",
          descendant: "package/.NPMIGNORE/x",
          dir,
          fileFirst,
        });

        await expect(
          listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
        ).rejects.toThrow(/ancestor/);
      });
    },
  );

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

  test("error: rejects a trailing dot", () => {
    expect(() => foldEntryPath("package/package.json.")).toThrow(/trailing/);
    expect(() => foldEntryPath("package/index.js ")).toThrow(/trailing/);
  });

  test("error: rejects a Windows 8.3 alias", () => {
    expect(() => foldEntryPath("package/packag~1.jso")).toThrow(/8\.3/);
  });

  test("error: rejects non-ASCII path segments", () => {
    expect(() => foldEntryPath("package/ſcript.js")).toThrow(/non-ASCII/);
    expect(() => foldEntryPath("package/café.js")).toThrow(/non-ASCII/);
  });

  test("error: rejects reserved Windows device names", () => {
    expect(() => foldEntryPath("package/nul.js")).toThrow(/reserved/);
  });

  test("error: rejects characters Win32 rejects", () => {
    expect(() => foldEntryPath("package/a:b")).toThrow(/rejects/);
  });

  test("error: missing tarball argument reports usage", async () => {
    await expect(main("")).rejects.toThrow(/Usage/);
  });

  test("error: CLI exits nonzero with ::error:: on a missing tarball", async () => {
    await withTempDir(async (dir) => {
      const result = spawnSync(
        process.execPath,
        [SCRIPT, join(dir, "missing.tgz")],
        {
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/::error::.*Unable to list tarball/);
    });
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

  test("error: rejects a corrupted tar header checksum", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json"],
      });
      corruptSecondHeaderChecksum(tgz);

      await expect(listTarballEntries(tgz, tarReader())).rejects.toThrow(
        /Unable to list tarball/,
      );
    });
  });

  test("error: rejects a case collision resolved from a PAX archive", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/", "package/package.json", "package/PACKAGE.json"],
        format: "pax",
      });

      await expect(
        listTarballEntries(tgz, tarReader()).then(verifyTarballEntries),
      ).rejects.toThrow(/collide/);
    });
  });

  test("error: loadBundledTar rejects a module without list()", async () => {
    await withTempDir(async (dir) => {
      const npmDir = join(dir, "npm");
      const tarDir = join(npmDir, "node_modules", "tar");
      mkdirSync(tarDir, { recursive: true });
      writeFileSync(join(npmDir, "package.json"), '{"name":"npm"}');
      writeFileSync(
        join(tarDir, "package.json"),
        '{"name":"tar","main":"index.js"}',
      );
      writeFileSync(join(tarDir, "index.js"), "module.exports = {};");

      expect(() => loadBundledTar(dir)).toThrow(/does not expose list/);
    });
  });
});
