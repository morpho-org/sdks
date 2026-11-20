import { execFileSync } from "node:child_process";
import {
  existsSync,
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

import {
  isPrerelease,
  listPublicPackages,
  packPackage,
  publicIdentity,
  publishManifest,
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
  test("matches bun pm pack for scoped and unscoped names", () => {
    expect(tarballName({ name: "@morpho-org/a", version: "1.0.0" })).toBe(
      "morpho-org-a-1.0.0.tgz",
    );
    expect(tarballName({ name: "b", version: "2.0.0" })).toBe("b-2.0.0.tgz");
  });
});

describe("publishManifest", () => {
  test.each(listPublicPackages(new URL("../../", import.meta.url).pathname))(
    "applies $name's real publishConfig without changing its input",
    ({ dir }) => {
      const pkg = JSON.parse(
        readFileSync(
          new URL(`../../${dir}/package.json`, import.meta.url),
          "utf8",
        ),
      );
      const before = JSON.stringify(pkg);
      const result = publishManifest(pkg);
      for (const [key, value] of Object.entries(pkg.publishConfig)) {
        if (key === "access" || key === "registry") {
          expect(result.publishConfig).toHaveProperty(key, value);
        } else {
          expect(result[key]).toEqual(value);
          expect(result.publishConfig ?? {}).not.toHaveProperty(key);
        }
      }
      expect(JSON.stringify(pkg)).toBe(before);
    },
  );

  test.each([
    "name",
    "bin",
    "engines",
    "type",
    "imports",
    "main",
    "module",
    "typings",
    "types",
    "exports",
    "browser",
    "esnext",
    "es2015",
    "unpkg",
    "umd:main",
    "os",
    "cpu",
    "libc",
    "typesVersions",
  ])("replaces %s using pnpm 11's whitelist", (key) => {
    const config = Object.freeze({ [key]: { published: true } });
    const pkg = Object.freeze({ [key]: "development", publishConfig: config });
    expect(publishManifest(pkg)).toEqual({ [key]: { published: true } });
  });

  test("preserves npm settings and other non-whitelisted publishConfig keys", () => {
    const settings = {
      access: "public",
      registry: "https://registry.npmjs.org/",
      tag: "next",
      provenance: true,
      directory: "dist",
      linkDirectory: false,
      executableFiles: ["cli.js"],
      custom: "unchanged",
    };
    expect(
      publishManifest({ publishConfig: { main: "lib/index.js", ...settings } }),
    ).toEqual({ main: "lib/index.js", publishConfig: settings });
  });

  test.each([{}, { publishConfig: {} }])("handles empty metadata %j", (pkg) => {
    expect(publishManifest(pkg)).toEqual({});
  });

  test("normalizes repository strings without changing repository objects", () => {
    expect(publishManifest({ repository: "github:morpho-org/sdks" })).toEqual({
      repository: { type: "git", url: "github:morpho-org/sdks" },
    });
    const repository = { type: "git", url: "url", directory: "packages/a" };
    expect(publishManifest({ repository })).toEqual({ repository });
  });
});

describe("packPackage", () => {
  test.each([false, true])(
    "restores metadata and inherited license after packing (failure=%s)",
    (fail) => {
      const root = repoWith({
        a: {
          name: "a",
          version: "1.0.0",
          main: "src/index.ts",
          publishConfig: { main: "lib/index.js" },
        },
      });
      const path = join(root, "packages/a/package.json");
      const original = readFileSync(path);
      const license = join(root, "packages/a/LICENSE");
      writeFileSync(join(root, "LICENSE"), "root license");
      const run = () =>
        packPackage({
          root,
          dir: "packages/a",
          out: root,
          run: (cwd, destination) => {
            expect(cwd).toBe(join(root, "packages/a"));
            expect(destination).toBe(root);
            expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
              name: "a",
              version: "1.0.0",
              main: "lib/index.js",
            });
            expect(readFileSync(license, "utf8")).toBe("root license");
            if (fail) throw new Error("packer failed");
          },
        });
      if (fail) expect(run).toThrow("packer failed");
      else run();
      expect(readFileSync(path)).toEqual(original);
      expect(existsSync(license)).toBe(false);
    },
  );

  test.each(["LICENSE", "LICENCE.txt", "license.md", "LICENSE-MIT"])(
    "does not overwrite an existing %s",
    (name) => {
      const root = repoWith({ a: { name: "a", version: "1.0.0" } });
      writeFileSync(join(root, "LICENSE"), "root license");
      const license = join(root, "packages/a", name);
      writeFileSync(license, "package license");
      packPackage({
        root,
        dir: "packages/a",
        out: root,
        run: () => {
          expect(readFileSync(license, "utf8")).toBe("package license");
          if (name !== "LICENSE")
            expect(existsSync(join(root, "packages/a/LICENSE"))).toBe(false);
        },
      });
      expect(readFileSync(license, "utf8")).toBe("package license");
    },
  );

  test("preserves a symlinked package license", () => {
    const root = repoWith({ a: { name: "a", version: "1.0.0" } });
    writeFileSync(join(root, "LICENSE"), "root license");
    symlinkSync("../../LICENSE", join(root, "packages/a/LICENSE"));
    packPackage({ root, dir: "packages/a", out: root, run: () => {} });
    expect(readFileSync(join(root, "LICENSE"), "utf8")).toBe("root license");
    expect(existsSync(join(root, "packages/a/LICENSE"))).toBe(true);
  });

  test("packs without a root license when none is available", () => {
    const root = repoWith({ a: { name: "a", version: "1.0.0" } });
    packPackage({
      root,
      dir: "packages/a",
      out: root,
      run: () => {
        expect(existsSync(join(root, "packages/a/LICENSE"))).toBe(false);
      },
    });
  });

  test("leaves malformed package metadata untouched", () => {
    const root = repoWith({ a: {} });
    const path = join(root, "packages/a/package.json");
    writeFileSync(path, "{");
    expect(() =>
      packPackage({
        root,
        dir: "packages/a",
        out: root,
        run: () => {
          throw new Error("must not run");
        },
      }),
    ).toThrow(SyntaxError);
    expect(readFileSync(path, "utf8")).toBe("{");
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
    commit("1.1.0", { extra: "edited later" });

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

  test("returns the commit that renamed the package at an unchanged version", () => {
    const { root, commit } = historyRepo();
    commit("1.0.0");
    const renamed = commit("1.0.0", { name: "b" });
    commit("1.0.0", { extra: "edited later", name: "b" });
    expect(
      releaseCommit(root, { dir: "packages/a", name: "b", version: "1.0.0" }),
    ).toBe(renamed);
  });

  test("follows a package moved to another directory at an unchanged version", () => {
    const { root, git, commit } = historyRepo();
    const introduced = commit("1.0.0");
    commit("1.0.0", { extra: "edited later" });
    git("mv", "packages/a", "packages/b");
    commit("1.0.0", { dir: "b", extra: "edited later" });

    expect(
      releaseCommit(root, {
        dir: "packages/b",
        name: "a",
        version: "1.0.0",
      }),
    ).toBe(introduced);
  });

  test("ignores a matching nested manifest deleted alongside the move", () => {
    const { root, git, commit } = historyRepo();
    const introduced = commit("1.0.0");
    commit("1.0.0", { dir: "z/fixture" });
    git("mv", "packages/a", "packages/b");
    git("rm", "packages/z/fixture/package.json");
    commit("1.0.0", { dir: "b", extra: "moved" });

    expect(
      releaseCommit(root, {
        dir: "packages/b",
        name: "a",
        version: "1.0.0",
      }),
    ).toBe(introduced);
  });

  test("returns the move commit when it also bumps the version", () => {
    const { root, git, commit } = historyRepo();
    commit("1.0.0");
    commit("1.0.0", { extra: "edited later" });
    git("mv", "packages/a", "packages/b");
    const moved = commit("1.1.0", { dir: "b" });

    expect(
      releaseCommit(root, {
        dir: "packages/b",
        name: "a",
        version: "1.1.0",
      }),
    ).toBe(moved);
  });

  test("follows two directory moves back to the original version commit", () => {
    const { root, git, commit } = historyRepo();
    const introduced = commit("1.0.0");
    git("mv", "packages/a", "packages/b");
    commit("1.0.0", { dir: "b", extra: "first move" });
    git("mv", "packages/b", "packages/c");
    commit("1.0.0", { dir: "c", extra: "second move" });

    expect(
      releaseCommit(root, {
        dir: "packages/c",
        name: "a",
        version: "1.0.0",
      }),
    ).toBe(introduced);
  });

  test("propagates a git read failure for the deleted manifest", () => {
    const { root, git, commit } = historyRepo();
    const introduced = commit("1.0.0");
    git("mv", "packages/a", "packages/b");
    commit("1.0.0", { dir: "b", extra: "moved" });
    const blob = git("rev-parse", `${introduced}:packages/a/package.json`);
    rmSync(join(root, ".git/objects", blob.slice(0, 2), blob.slice(2)));

    expect(() =>
      releaseCommit(root, {
        dir: "packages/b",
        name: "a",
        version: "1.0.0",
      }),
    ).toThrow("Command failed: git");
  });

  test("fails when two directories hold the moved package's identity", () => {
    const { root, git, commit } = historyRepo();
    commit("1.0.0");
    mkdirSync(join(root, "packages/c"), { recursive: true });
    writeFileSync(
      join(root, "packages/c/package.json"),
      JSON.stringify({ name: "a", version: "1.0.0" }),
    );
    git("add", "-A");
    git(...COMMITTER, "commit", "-qm", "duplicate package");

    git("mv", "packages/a", "packages/b");
    git("rm", "-r", "packages/c");
    git(...COMMITTER, "commit", "-qm", "move package");

    expect(() =>
      releaseCommit(root, {
        dir: "packages/b",
        name: "a",
        version: "1.0.0",
      }),
    ).toThrow("packages/a, packages/c");
  });

  test("ignores a malformed unrelated manifest when the package is created", () => {
    const { root, git, commit } = historyRepo();
    mkdirSync(join(root, "packages/z"), { recursive: true });
    writeFileSync(join(root, "packages/z/package.json"), "{");
    git("add", "-A");
    git(...COMMITTER, "commit", "-qm", "add malformed manifest");
    const added = commit("1.0.0");

    expect(releaseCommit(root, pkgAt("1.0.0"))).toBe(added);
  });

  test.each(["{", JSON.stringify({ name: "z" })])(
    "ignores a malformed manifest deleted alongside the move: %s",
    (manifest) => {
      const { root, git, commit } = historyRepo();
      const introduced = commit("1.0.0");
      mkdirSync(join(root, "packages/z"), { recursive: true });
      writeFileSync(join(root, "packages/z/package.json"), manifest);
      git("add", "-A");
      git(...COMMITTER, "commit", "-qm", "add malformed manifest");
      git("mv", "packages/a", "packages/b");
      git("rm", "-r", "packages/z");
      git(...COMMITTER, "commit", "-qm", "move package");

      expect(
        releaseCommit(root, {
          dir: "packages/b",
          name: "a",
          version: "1.0.0",
        }),
      ).toBe(introduced);
    },
  );

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

/** A repository whose commits each write `packages/<dir>/package.json` (`dir` defaults to `a`). */
function historyRepo() {
  const root = repoWith({});
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (
    version: string,
    { dir = "a", extra = "", name = "a" } = {},
  ) => {
    mkdirSync(join(root, "packages", dir), { recursive: true });
    writeFileSync(
      join(root, "packages", dir, "package.json"),
      version === "not json"
        ? "{"
        : JSON.stringify({ name, version, description: extra }),
    );
    git("add", "-A");
    git(...COMMITTER, "commit", "-qm", version);
    return git("rev-parse", "HEAD");
  };
  return { root, git, commit };
}

test.each([
  ["1.2.0", false],
  ["10.0.1", false],
  ["1.2.0-next.0", true],
  ["1.2.0-beta", true],
  ["1.2.3+build.1", false],
  ["1.2.3-next.0+build.1", false],
  ["1.2", false],
])("isPrerelease(%s) is %s", (version, expected) => {
  expect(isPrerelease(version)).toBe(expected);
});
