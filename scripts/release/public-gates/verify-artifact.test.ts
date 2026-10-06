import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { verifyArtifact } from "./verify-artifact.ts";

// Tests run concurrently, so directories are removed once the file is done.
const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "public-gates-test-"));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function commitAll(repo: string) {
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

describe("verifyArtifact", () => {
  const sources = new Map<string, string>();
  function artifact() {
    const repo = tempDir();
    execFileSync("git", ["init", "-q", repo]);
    write(repo, {
      "scripts/release/public-snapshot/allowlist.json": JSON.stringify({
        include: ["README.md", "link.md", "packages/*/package.json"],
      }),
      "README.md": "hello\n",
      "packages/a/package.json": JSON.stringify({
        name: "a",
        version: "1.0.0",
      }),
      "packages/internal/package.json": JSON.stringify({
        name: "internal",
        version: "1.0.0",
        private: true,
      }),
    });
    symlinkSync("README.md", join(repo, "link.md"));
    commitAll(repo);
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
    sources.set(out, repo);
    return out;
  }

  test("accepts an untouched artifact", () => {
    expect(verifyArtifact(artifact()).files).toHaveLength(4);
  });

  test("accepts an artifact generated from the given commit", () => {
    const dir = artifact();
    const repo = sources.get(dir) ?? "";
    expect(verifyArtifact(dir, { repo, sha: "HEAD" }).files).toHaveLength(4);
  });

  test("rejects an artifact that another commit doesn't produce", () => {
    const dir = artifact();
    const repo = sources.get(dir) ?? "";
    write(repo, { "README.md": "changed\n" });
    commitAll(repo);
    expect(() => verifyArtifact(dir, { repo, sha: "HEAD" })).toThrow(
      "doesn't match the tree generated",
    );
  });

  test.each([
    [
      "an edited file",
      '"README.md" differs from the manifest.',
      (dir: string) => write(dir, { "tree/README.md": "x" }),
    ],
    [
      "an extra file",
      '"extra.md" is in the tree but not in the manifest.',
      (dir: string) => write(dir, { "tree/extra.md": "x" }),
    ],
    [
      "a missing file",
      '"README.md" is in the manifest but not in the tree.',
      (dir: string) => rmSync(join(dir, "tree/README.md")),
    ],
    [
      "an edited tarball",
      `Tarball "a-1.0.0.tgz" doesn't match SHA256SUMS.`,
      (dir: string) => write(dir, { "tarballs/a-1.0.0.tgz": "other" }),
    ],
    [
      "an unlisted tarball",
      'Tarball "b-1.0.0.tgz" doesn\'t match SHA256SUMS.',
      (dir: string) => write(dir, { "tarballs/b-1.0.0.tgz": "tgz" }),
    ],
    [
      "a public package's tarball dropped, with checksums rewritten",
      "Tarballs [internal-1.0.0.tgz] don't match the public packages",
      (dir: string) => {
        rmSync(join(dir, "tarballs/a-1.0.0.tgz"));
        write(dir, { "tarballs/internal-1.0.0.tgz": "tgz" });
        execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], {
          cwd: join(dir, "tarballs"),
        });
      },
    ],
    [
      "no tarballs",
      "No tarballs in",
      (dir: string) => {
        rmSync(join(dir, "tarballs/a-1.0.0.tgz"));
        write(dir, { "tarballs/SHA256SUMS": "" });
      },
    ],
    [
      "a malformed checksum line",
      'Invalid SHA256SUMS line "nope".',
      (dir: string) => write(dir, { "tarballs/SHA256SUMS": "nope\n" }),
    ],
    [
      "a non-tarball file next to the tarballs",
      'Unexpected "postinstall.sh" next to the tarballs.',
      (dir: string) => write(dir, { "tarballs/postinstall.sh": "x" }),
    ],
    [
      "missing checksums",
      'tarballs/SHA256SUMS".',
      (dir: string) => rmSync(join(dir, "tarballs/SHA256SUMS")),
    ],
    [
      "a retargeted symlink",
      '"link.md" differs from the manifest.',
      (dir: string) => {
        rmSync(join(dir, "tree/link.md"));
        symlinkSync("../../.env", join(dir, "tree/link.md"));
      },
    ],
    [
      "a symlink replaced by a file",
      '"link.md" has mode 100644, but the manifest says 120000.',
      (dir: string) => {
        rmSync(join(dir, "tree/link.md"));
        write(dir, { "tree/link.md": "README.md" });
      },
    ],
    [
      "an extra symlink",
      '"leak" is in the tree but not in the manifest.',
      (dir: string) => symlinkSync("README.md", join(dir, "tree/leak")),
    ],
    [
      "a changed executable bit",
      '"README.md" has mode 100755, but the manifest says 100644.',
      (dir: string) => chmodSync(join(dir, "tree/README.md"), 0o755),
    ],
    [
      "a manifest path outside the tree",
      "Invalid manifest entry",
      (dir: string) =>
        write(dir, {
          "public-tree.json": JSON.stringify({
            sourceCommit: "x",
            treeHash: "y",
            files: [{ path: "../x", mode: "100644", sha256: "z" }],
          }),
        }),
    ],
    [
      "a manifest without files",
      'public-tree.json needs "sourceCommit", "treeHash" and "files".',
      (dir: string) => write(dir, { "public-tree.json": "{}" }),
    ],
  ])("rejects %s", (...[, expected, tamper]) => {
    const dir = artifact();
    tamper(dir);
    expect(() => verifyArtifact(dir)).toThrow(expected);
  });

  test("rejects a checksum for a tarball that isn't there", () => {
    const dir = artifact();
    write(dir, {
      "tarballs/SHA256SUMS": `${readFileSync(join(dir, "tarballs/SHA256SUMS"), "utf8")}${"0".repeat(64)}  ./b-1.0.0.tgz\n`,
    });
    expect(() => verifyArtifact(dir)).toThrow(
      "SHA256SUMS lists missing tarballs: b-1.0.0.tgz.",
    );
  });
});
