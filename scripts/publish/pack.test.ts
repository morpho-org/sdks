import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import {
  listPublicPackages,
  publicIdentity,
  releaseCommit,
  releaseTag,
  tarballName,
} from "./pack.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repoWith(manifests: Record<string, object>): string {
  const root = mkdtempSync(join(tmpdir(), "pack-test-"));
  dirs.push(root);
  mkdirSync(join(root, "packages/empty"), { recursive: true });
  for (const [dir, manifest] of Object.entries(manifests)) {
    mkdirSync(join(root, "packages", dir), { recursive: true });
    writeFileSync(
      join(root, "packages", dir, "package.json"),
      JSON.stringify(manifest),
    );
  }
  return root;
}

describe("publicIdentity", () => {
  test("returns the name and version of a public package", () => {
    expect(publicIdentity({ name: "@x/a", version: "1.0.0" }, "m")).toEqual({
      name: "@x/a",
      version: "1.0.0",
    });
  });

  test("skips private packages", () => {
    expect(
      publicIdentity({ name: "@x/a", private: true }, "m"),
    ).toBeUndefined();
  });

  test("returns a package marked private: false", () => {
    expect(
      publicIdentity({ name: "@x/a", version: "1.0.0", private: false }, "m"),
    ).toEqual({ name: "@x/a", version: "1.0.0" });
  });

  test.each([
    { name: "no version", manifest: { name: "@x/a" } },
    { name: "a non-string name", manifest: { name: 1, version: "1.0.0" } },
    { name: "a non-object", manifest: "x" },
  ])("rejects $name", ({ manifest }) => {
    expect(() => publicIdentity(manifest, '"x/package.json" at HEAD')).toThrow(
      '"x/package.json" at HEAD',
    );
  });
});

describe("listPublicPackages", () => {
  test("lists public packages by directory and skips the rest", () => {
    const root = repoWith({
      b: { name: "@x/b", version: "2.0.0" },
      a: { name: "@x/a", version: "1.0.0" },
      p: { name: "@x/p", version: "1.0.0", private: true },
    });
    expect(listPublicPackages(root)).toEqual([
      { dir: "packages/a", name: "@x/a", version: "1.0.0" },
      { dir: "packages/b", name: "@x/b", version: "2.0.0" },
    ]);
  });
});

describe("tarballName", () => {
  test("matches pnpm pack for scoped and unscoped names", () => {
    expect(tarballName({ name: "@morpho-org/a", version: "1.0.0" })).toBe(
      "morpho-org-a-1.0.0.tgz",
    );
    expect(tarballName({ name: "b", version: "2.0.0" })).toBe("b-2.0.0.tgz");
  });
});

describe("releaseTag", () => {
  test("joins the name and version with -v", () => {
    expect(releaseTag({ name: "@x/a", version: "1.2.3" })).toBe("@x/a-v1.2.3");
  });
});

describe("releaseCommit", () => {
  test("returns the commit that set the current version, not a later one", () => {
    const { root, commit } = historyRepo();
    commit("1.0.0");
    const release = commit("1.1.0");
    commit("1.1.0", "edited later");

    expect(releaseCommit(root, pkgAt("1.1.0"))).toBe(release);
    expect(() => releaseCommit(root, pkgAt("9.0.0"))).toThrow(
      "No commit sets a to 9.0.0.",
    );
  });

  test("returns the root commit when it sets the version", () => {
    const { root, commit } = historyRepo();
    const first = commit("1.0.0");
    expect(releaseCommit(root, pkgAt("1.0.0"))).toBe(first);
  });

  test("returns the commit that added the package after the root commit", () => {
    const { root, git, commit } = historyRepo();
    git(...COMMITTER, "commit", "-q", "--allow-empty", "-m", "root");
    const added = commit("1.0.0");
    expect(releaseCommit(root, pkgAt("1.0.0"))).toBe(added);
  });

  test("returns the merge commit for a version set on a side branch", () => {
    const { root, git, commit } = historyRepo();
    commit("1.0.0");
    git("checkout", "-qb", "side");
    commit("1.1.0");
    git("checkout", "-q", "main");
    git(...COMMITTER, "commit", "-q", "--allow-empty", "-m", "unrelated");
    git(...COMMITTER, "merge", "-q", "--no-ff", "-m", "merge", "side");
    expect(releaseCommit(root, pkgAt("1.1.0"))).toBe(git("rev-parse", "HEAD"));
  });

  test("fails on a malformed manifest in history", () => {
    const { root, commit } = historyRepo();
    commit("not json");
    expect(() => releaseCommit(root, pkgAt("1.0.0"))).toThrow(SyntaxError);
  });
});

const COMMITTER = [
  "-c",
  "user.name=t",
  "-c",
  "user.email=t@t",
  "-c",
  "commit.gpgsign=false",
];

function pkgAt(version: string) {
  return { dir: "packages/a", name: "a", version };
}

/** A repository whose commits each write `packages/a/package.json`. */
function historyRepo() {
  const root = repoWith({});
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (version: string, extra = "") => {
    mkdirSync(join(root, "packages/a"), { recursive: true });
    writeFileSync(
      join(root, "packages/a/package.json"),
      version === "not json"
        ? "{"
        : JSON.stringify({ name: "a", version, description: extra }),
    );
    git("add", "-A");
    git(...COMMITTER, "commit", "-qm", version);
    return git("rev-parse", "HEAD");
  };
  return { root, git, commit };
}
