import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { loadBundledPacote } from "./read-tarball-identity.ts";
import {
  verifyChecksums,
  verifyReleaseMatch,
  verifyReleaseSet,
  verifyTarballStructure,
} from "./verify-release-set.ts";
import { loadBundledTar } from "./verify-tarball-collisions.ts";

const NPM_ROOT = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();
const tar = loadBundledTar(NPM_ROOT);
const pacote = loadBundledPacote(NPM_ROOT);

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "release-set-test-"));
  dirs.push(dir);
  return dir;
}

/** Packs `package/` trees with GNU tar and writes SHA256SUMS. */
function tarballs(packages: Record<string, Record<string, string>>): string {
  const out = tempDir();
  for (const [file, files] of Object.entries(packages)) {
    const src = tempDir();
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(src, path, ".."), { recursive: true });
      if (content.startsWith("->"))
        symlinkSync(content.slice(2), join(src, path));
      else writeFileSync(join(src, path), content);
    }
    execFileSync("tar", ["-czf", join(out, file), "-C", src, "package"]);
  }
  execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], { cwd: out });
  return out;
}

const manifest = (extra: object = {}) =>
  JSON.stringify({ name: "@x/a", version: "1.0.0", ...extra });

describe("verifyTarballStructure", () => {
  const ok = [
    { path: "package/", type: "Directory" },
    { path: "package/package.json", type: "File" },
    { path: "package/lib/index.js", type: "File" },
  ];

  test("accepts an npm layout", () => {
    expect(() => verifyTarballStructure("a.tgz", ok)).not.toThrow();
  });

  test.each([
    { name: "a second root", entry: { path: "other/x", type: "File" } },
    { name: "a dot segment", entry: { path: "package/./x", type: "File" } },
    { name: "a parent segment", entry: { path: "package/../x", type: "File" } },
    { name: "an empty segment", entry: { path: "package//x", type: "File" } },
    { name: "a symlink", entry: { path: "package/l", type: "SymbolicLink" } },
    { name: "a hard link", entry: { path: "package/l", type: "Link" } },
    {
      name: "an entry below package.json",
      entry: { path: "package/package.json/x", type: "File" },
    },
    {
      name: "a package.json directory",
      entry: { path: "package/package.json/", type: "Directory" },
    },
    {
      name: "a second package.json",
      entry: { path: "package/package.json", type: "File" },
    },
  ])("rejects $name", ({ entry }) => {
    expect(() => verifyTarballStructure("a.tgz", [...ok, entry])).toThrow();
  });

  test("rejects a missing package.json", () => {
    expect(() =>
      verifyTarballStructure("a.tgz", [{ path: "package/x", type: "File" }]),
    ).toThrow("exactly one package/package.json");
  });
});

describe("verifyReleaseMatch", () => {
  const a = { file: "a.tgz", name: "@x/a", version: "1.0.0" };
  const expected = [{ name: "@x/a", version: "1.0.0" }];

  test("accepts exactly the declared packages", () => {
    expect(() => verifyReleaseMatch(expected, [a])).not.toThrow();
  });

  test.each([
    { name: "a missing tarball", received: [] },
    { name: "a wrong version", received: [{ ...a, version: "2.0.0" }] },
    { name: "a duplicate", received: [a, a] },
    { name: "an extra package", received: [a, { ...a, name: "@x/b" }] },
  ])("rejects $name", ({ received }) => {
    expect(() => verifyReleaseMatch(expected, received)).toThrow();
  });
});

test("rejects a prerelease, which would publish under latest", () => {
  const pre = { file: "a.tgz", name: "@x/a", version: "1.0.0-next.0" };
  expect(() => verifyReleaseMatch([pre], [pre])).toThrow("not a stable");
});

describe("verifyChecksums", () => {
  test("rejects a missing SHA256SUMS", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    rmSync(join(dir, "SHA256SUMS"));
    expect(() => verifyChecksums(dir)).toThrow("Missing");
  });

  test("rejects an edited tarball", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(join(dir, "a.tgz"), "x");
    expect(() => verifyChecksums(dir)).toThrow("doesn't match");
  });

  test("rejects a listed tarball that is missing", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(join(dir, "SHA256SUMS"), `${"0".repeat(64)}  ./b.tgz\n`, {
      flag: "a",
    });
    expect(() => verifyChecksums(dir)).toThrow("missing tarballs");
  });

  test.each([
    { name: "a malformed line", line: "not a checksum" },
    { name: "a duplicate line", line: null },
  ])("rejects $name", ({ line }) => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    const sums = join(dir, "SHA256SUMS");
    writeFileSync(sums, `${line ?? readFileSync(sums, "utf8").trim()}\n`, {
      flag: "a",
    });
    expect(() => verifyChecksums(dir)).toThrow("Invalid SHA256SUMS line");
  });

  test("rejects an empty directory", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "SHA256SUMS"), "");
    expect(() => verifyChecksums(dir)).toThrow("No tarballs");
  });
});

describe("verifyReleaseSet", () => {
  const expected = [{ name: "@x/a", version: "1.0.0" }];
  const run = (dir: string) => verifyReleaseSet({ dir, expected, tar, pacote });

  test("returns the tarballs to publish", async () => {
    const dir = tarballs({
      "a.tgz": { "package/package.json": manifest(), "package/index.js": "" },
    });
    await expect(run(dir)).resolves.toEqual([
      { file: join(dir, "a.tgz"), name: "@x/a", version: "1.0.0" },
    ]);
  });

  test("rejects a checksummed file that is not a tarball", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(
      join(dir, "a.tgz"),
      readFileSync(join(dir, "a.tgz")).subarray(0, 20),
    );
    execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], { cwd: dir });
    await expect(run(dir)).rejects.toThrow("Unable to list tarball");
  });

  test("rejects a package.json that isn't a JSON object", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": "null" } });
    await expect(run(dir)).rejects.toThrow(
      'Manifest at "a.tgz:package/package.json" is not a JSON object.',
    );
  });

  test("rejects a disallowed publishConfig", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest({
          publishConfig: { registry: "https://evil.example" },
        }),
      },
    });
    await expect(run(dir)).rejects.toThrow("publishConfig");
  });

  test("rejects a symlink", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest(),
        "package/leak": "->../../.npmrc",
      },
    });
    await expect(run(dir)).rejects.toThrow("SymbolicLink");
  });

  test("rejects paths that collide on a case-insensitive file system", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest(),
        "package/README.md": "",
        "package/readme.md": "",
      },
    });
    await expect(run(dir)).rejects.toThrow();
  });

  test("rejects a package.json that differs from what npm reads", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    const otherPacote = {
      manifest: async () => ({ name: "@x/a", version: "2.0.0" }),
    };
    await expect(
      verifyReleaseSet({ dir, expected, tar, pacote: otherPacote }),
    ).rejects.toThrow("npm would publish @x/a@2.0.0");
  });

  test("rejects a version the source doesn't declare", async () => {
    const dir = tarballs({
      "a.tgz": { "package/package.json": manifest({ version: "9.9.9" }) },
    });
    await expect(run(dir)).rejects.toThrow("Expected a tarball");
  });
});
