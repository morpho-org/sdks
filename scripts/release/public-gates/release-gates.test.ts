import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { listReleasedPackages } from "./detect-release.ts";
import { verifyArtifact } from "./verify-artifact.ts";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "public-gates-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

describe("listReleasedPackages", () => {
  function repoWith(versions: Record<string, object>[]) {
    const repo = tempDir();
    execFileSync("git", ["init", "-q", repo]);
    for (const commit of versions) {
      for (const [dir, manifest] of Object.entries(commit)) {
        write(repo, {
          [`packages/${dir}/package.json`]: JSON.stringify(manifest),
        });
      }
      execFileSync("git", ["-C", repo, "add", "-A"]);
      execFileSync("git", [
        "-C",
        repo,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "c",
      ]);
    }
    return repo;
  }

  test("lists public packages whose version changed", () => {
    const repo = repoWith([
      {
        a: { name: "@x/a", version: "1.0.0" },
        b: { name: "@x/b", version: "1.0.0" },
        p: { name: "@x/p", version: "1.0.0", private: true },
      },
      {
        a: { name: "@x/a", version: "1.1.0" },
        b: { name: "@x/b", version: "1.0.0", description: "edit" },
        p: { name: "@x/p", version: "2.0.0", private: true },
        c: { name: "@x/c", version: "0.1.0" },
      },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([
      { name: "@x/a", version: "1.1.0" },
      { name: "@x/c", version: "0.1.0" },
    ]);
  });

  test("returns nothing for a commit that changes no version", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/a", version: "1.0.0", description: "edit" } },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([]);
  });
});

describe("verifyArtifact", () => {
  function artifact() {
    const repo = tempDir();
    execFileSync("git", ["init", "-q", repo]);
    write(repo, {
      "scripts/release/public-snapshot/allowlist.json": JSON.stringify({
        include: ["README.md", "link.md"],
      }),
      "README.md": "hello\n",
    });
    symlinkSync("README.md", join(repo, "link.md"));
    execFileSync("git", ["-C", repo, "add", "-A"]);
    execFileSync("git", [
      "-C",
      repo,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "c",
    ]);
    const out = join(tempDir(), "artifact");
    execFileSync("node", [
      join(import.meta.dirname, "../public-snapshot/generate.ts"),
      "--repo",
      repo,
      "--sha",
      "HEAD",
      "--out",
      out,
    ]);
    write(out, { "tarballs/a-1.0.0.tgz": "tgz" });
    execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], {
      cwd: join(out, "tarballs"),
    });
    return out;
  }

  test("accepts an untouched artifact", () => {
    expect(verifyArtifact(artifact()).files).toHaveLength(2);
  });

  test.each([
    ["an edited file", (dir: string) => write(dir, { "tree/README.md": "x" })],
    ["an extra file", (dir: string) => write(dir, { "tree/extra.md": "x" })],
    ["a missing file", (dir: string) => rmSync(join(dir, "tree/README.md"))],
    [
      "an edited tarball",
      (dir: string) => write(dir, { "tarballs/a-1.0.0.tgz": "other" }),
    ],
    [
      "an unlisted tarball",
      (dir: string) => write(dir, { "tarballs/b-1.0.0.tgz": "tgz" }),
    ],
    [
      "missing checksums",
      (dir: string) => rmSync(join(dir, "tarballs/SHA256SUMS")),
    ],
  ])("rejects %s", (_, tamper) => {
    const dir = artifact();
    tamper(dir);
    expect(() => verifyArtifact(dir)).toThrow();
  });
});
