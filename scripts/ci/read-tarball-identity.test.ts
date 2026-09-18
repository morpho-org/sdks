import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  formatIdentity,
  loadBundledPacote,
  main,
  readTarballIdentity,
} from "./read-tarball-identity.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "read-tarball-identity.ts",
);
const NPM_ROOT = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();

async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "tarball-identity-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

interface TarballOptions {
  readonly entries: readonly string[];
  readonly manifests?: Readonly<
    Record<string, { name?: unknown; version?: unknown }>
  >;
}

function buildTarball(
  dir: string,
  { entries, manifests = {} }: TarballOptions,
): string {
  for (const entry of entries) {
    const target = join(dir, entry);
    if (entry.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    const manifest = manifests[entry];
    writeFileSync(
      target,
      manifest == null ? `{"entry":"${entry}"}` : JSON.stringify(manifest),
    );
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
  ]);
  return tgz;
}

function pacoteReader() {
  return loadBundledPacote(NPM_ROOT);
}

describe("readTarballIdentity", () => {
  test("behavior: reads a pnpm pack-shaped package manifest", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/package.json", "package/README.md"],
        manifests: {
          "package/package.json": {
            name: "@morpho/example",
            version: "1.2.3",
          },
        },
      });

      await expect(readTarballIdentity(tgz, pacoteReader())).resolves.toEqual({
        name: "@morpho/example",
        version: "1.2.3",
      });
    });
  });

  test("behavior: follows package/./package.json aliases", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/package.json", "package/\\./package.json"],
        manifests: {
          "package/package.json": {
            name: "benign",
            version: "1.0.0",
          },
          "package/\\./package.json": {
            name: "evil",
            version: "9.9.9",
          },
        },
      });

      await expect(readTarballIdentity(tgz, pacoteReader())).resolves.toEqual({
        name: "evil",
        version: "9.9.9",
      });
    });
  });

  test("behavior: follows package.json entries under another root", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/package.json", "zzz/package.json"],
        manifests: {
          "package/package.json": {
            name: "benign",
            version: "1.0.0",
          },
          "zzz/package.json": {
            name: "evil",
            version: "9.9.9",
          },
        },
      });

      await expect(readTarballIdentity(tgz, pacoteReader())).resolves.toEqual({
        name: "evil",
        version: "9.9.9",
      });
    });
  });

  test("error: rejects a manifest missing name", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/package.json"],
        manifests: {
          "package/package.json": { version: "1.0.0" },
        },
      });

      await expect(readTarballIdentity(tgz, pacoteReader())).rejects.toThrow(
        /manifest name must be a non-empty string/,
      );
    });
  });

  test("error: rejects a manifest missing version", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package" }),
      }),
    ).rejects.toThrow(/version must be a non-empty string/);
  });

  test("error: rejects a name containing a tab", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package\tname", version: "1.0.0" }),
      }),
    ).rejects.toThrow(/name must be a non-empty string/);
  });

  test("error: rejects a name containing a newline", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package\nname", version: "1.0.0" }),
      }),
    ).rejects.toThrow(/name must be a non-empty string/);
  });

  test("error: rejects a version containing a tab", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package", version: "1.0\t0" }),
      }),
    ).rejects.toThrow(/version must be a non-empty string/);
  });

  test("error: rejects an empty name", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "", version: "1.0.0" }),
      }),
    ).rejects.toThrow(/name must be a non-empty string/);
  });

  test("error: rejects an empty version", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package", version: "" }),
      }),
    ).rejects.toThrow(/version must be a non-empty string/);
  });

  test("error: rejects a version containing a newline", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: "package", version: "1.0.0\n" }),
      }),
    ).rejects.toThrow(/version must be a non-empty string/);
  });

  test("error: wraps pacote failures with their cause", async () => {
    await withTempDir(async (dir) => {
      await expect(
        readTarballIdentity(join(dir, "missing.tgz"), pacoteReader()),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/Unable to read tarball manifest/),
        cause: expect.anything(),
      });
    });
  });

  test("error: missing tarball argument reports usage", async () => {
    await expect(main("")).rejects.toThrow(/Usage/);
  });

  test("behavior: formatIdentity emits tab-separated name/version", () => {
    expect(formatIdentity({ name: "@morpho/example", version: "1.2.3" })).toBe(
      "@morpho/example\t1.2.3\n",
    );
  });

  test("behavior: CLI prints the package identity", async () => {
    await withTempDir(async (dir) => {
      const tgz = buildTarball(dir, {
        entries: ["package/package.json", "package/README.md"],
        manifests: {
          "package/package.json": {
            name: "@morpho/example",
            version: "1.2.3",
          },
        },
      });
      const result = spawnSync(process.execPath, [SCRIPT, tgz], {
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("@morpho/example\t1.2.3\n");
    });
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
      expect(result.stderr).toMatch(
        /::error::.*Unable to read tarball manifest/,
      );
    });
  });

  test("error: rejects a manifest with a non-string name", async () => {
    await expect(
      readTarballIdentity("ignored.tgz", {
        manifest: async () => ({ name: 1 }),
      }),
    ).rejects.toThrow(/manifest name must be a non-empty string/);
  });

  test("error: loadBundledPacote rejects a module without manifest()", async () => {
    await withTempDir(async (dir) => {
      const npmDir = join(dir, "npm");
      const pacoteDir = join(npmDir, "node_modules", "pacote");
      mkdirSync(pacoteDir, { recursive: true });
      writeFileSync(join(npmDir, "package.json"), '{"name":"npm"}');
      writeFileSync(
        join(pacoteDir, "package.json"),
        '{"name":"pacote","main":"index.js"}',
      );
      writeFileSync(join(pacoteDir, "index.js"), "module.exports = {};");

      expect(() => loadBundledPacote(dir)).toThrow(/does not expose manifest/);
    });
  });
});
