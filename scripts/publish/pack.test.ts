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
    expect(publicIdentity({ name: "@x/a", version: "1.0.0" })).toEqual({
      name: "@x/a",
      version: "1.0.0",
    });
  });

  test("skips private packages", () => {
    expect(publicIdentity({ name: "@x/a", private: true })).toBeUndefined();
  });

  test.each([
    { name: "no version", manifest: { name: "@x/a" } },
    { name: "a non-string name", manifest: { name: 1, version: "1.0.0" } },
    { name: "a non-object", manifest: "x" },
  ])("rejects $name", ({ manifest }) => {
    expect(() => publicIdentity(manifest)).toThrow();
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
    const root = repoWith({});
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    const commit = (version: string, extra: string) => {
      mkdirSync(join(root, "packages/a"), { recursive: true });
      writeFileSync(
        join(root, "packages/a/package.json"),
        JSON.stringify({ name: "a", version, description: extra }),
      );
      git("add", "-A");
      git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        version,
      );
      return git("rev-parse", "HEAD");
    };
    git("init", "-q");
    commit("1.0.0", "");
    const release = commit("1.1.0", "");
    commit("1.1.0", "edited later");
    const pkg = { dir: "packages/a", name: "a", version: "1.1.0" };

    expect(releaseCommit(root, pkg)).toBe(release);
    expect(() => releaseCommit(root, { ...pkg, version: "9.0.0" })).toThrow(
      "No commit sets a to 9.0.0.",
    );
  });
});
