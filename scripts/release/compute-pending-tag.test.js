import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  computePendingTag,
  main,
  readPackageManifest,
  readPreviousPackageManifest,
} from "./compute-pending-tag.mjs";

const tempDirs = [];
const manifestPath = "packages/alpha/package.json";

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("readPackageManifest", () => {
  test("default", () => {
    const root = createTempDir();
    mkdirSync(join(root, "packages/alpha"), { recursive: true });
    writeManifest(join(root, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });

    expect(readPackageManifest({ cwd: root, manifestPath })).toEqual({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
  });

  test("behavior: rejects paths outside the worktree", () => {
    const root = createTempDir();
    const externalRoot = createTempDir();
    mkdirSync(join(externalRoot, "packages/alpha"), { recursive: true });
    writeManifest(join(externalRoot, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });

    expect(() =>
      readPackageManifest({
        cwd: root,
        manifestPath: join(externalRoot, manifestPath),
      }),
    ).toThrow(`Invalid manifest path "${join(externalRoot, manifestPath)}".`);
  });

  test("behavior: rejects non-package manifest paths", () => {
    const root = createTempDir();
    writeManifest(join(root, "package.json"), {
      name: "@morpho-org/root",
      version: "1.0.0",
    });

    expect(() =>
      readPackageManifest({ cwd: root, manifestPath: "package.json" }),
    ).toThrow('Invalid manifest path "package.json".');
  });

  test("behavior: rejects absolute manifest paths inside the worktree", () => {
    const root = createTempDir();
    mkdirSync(join(root, "packages/alpha"), { recursive: true });
    writeManifest(join(root, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });

    expect(() =>
      readPackageManifest({
        cwd: root,
        manifestPath: join(root, manifestPath),
      }),
    ).toThrow(`Invalid manifest path "${join(root, manifestPath)}".`);
  });

  test("behavior: rejects lexical traversal manifest paths", () => {
    const root = createTempDir();
    mkdirSync(join(root, "packages/beta"), { recursive: true });
    writeManifest(join(root, "packages/beta/package.json"), {
      name: "@morpho-org/beta",
      version: "1.0.0",
    });

    expect(() =>
      readPackageManifest({
        cwd: root,
        manifestPath: "packages/alpha/../beta/package.json",
      }),
    ).toThrow('Invalid manifest path "packages/alpha/../beta/package.json".');
  });

  test("behavior: rejects symlinked manifests", () => {
    const root = createTempDir();
    const externalRoot = createTempDir();
    mkdirSync(join(root, "packages/alpha"), { recursive: true });
    writeManifest(join(externalRoot, "package.json"), {
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    symlinkSync(join(externalRoot, "package.json"), join(root, manifestPath));

    expect(() => readPackageManifest({ cwd: root, manifestPath })).toThrow(
      `Invalid manifest path "${manifestPath}".`,
    );
  });
});

describe("readPreviousPackageManifest", () => {
  test("default", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    writeManifest(join(root, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.1.0",
    });
    commitAll(root, "version package");

    expect(readPreviousPackageManifest({ cwd: root, manifestPath })).toEqual({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
  });

  test("behavior: missing previous manifest", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });

    expect(readPreviousPackageManifest({ cwd: root, manifestPath })).toBe(
      undefined,
    );
  });
});

describe("computePendingTag", () => {
  test("default", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    writeManifest(join(root, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.1.0",
    });
    commitAll(root, "version package");

    expect(computePendingTag({ cwd: root, manifestPath })).toBe(
      "@morpho-org/alpha@1.1.0",
    );
  });

  test("behavior: skips unchanged versions", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    writeManifest(join(root, manifestPath), {
      description: "Metadata-only manifest update",
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    commitAll(root, "update manifest metadata");

    expect(computePendingTag({ cwd: root, manifestPath })).toBeUndefined();
  });

  test("behavior: treats a missing previous manifest as a new package", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });

    expect(computePendingTag({ cwd: root, manifestPath })).toBe(
      "@morpho-org/alpha@1.0.0",
    );
  });

  test("behavior: accepts injected manifests and previous manifest readers", () => {
    const readPreviousManifest = vi.fn(() => ({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    }));

    expect(
      computePendingTag({
        baseRef: "origin/main",
        cwd: "/repo",
        manifest: { name: "@morpho-org/alpha", version: "1.1.0" },
        manifestPath,
        readPreviousManifest,
      }),
    ).toBe("@morpho-org/alpha@1.1.0");
    expect(readPreviousManifest).toHaveBeenCalledWith({
      baseRef: "origin/main",
      cwd: "/repo",
      manifestPath,
    });
  });
});

describe("main", () => {
  test("default", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    writeManifest(join(root, manifestPath), {
      name: "@morpho-org/alpha",
      version: "1.1.0",
    });
    commitAll(root, "version package");
    const writeOutput = vi.fn();

    expect(main([manifestPath], { cwd: root, writeOutput })).toBe(
      "@morpho-org/alpha@1.1.0",
    );
    expect(writeOutput).toHaveBeenCalledWith("@morpho-org/alpha@1.1.0");
  });

  test("error: missing manifest path", () => {
    expect(() => main([])).toThrow(
      "Usage: node scripts/release/compute-pending-tag.mjs <manifest-path>",
    );
  });

  test("behavior: skips stdout when version is unchanged", () => {
    const root = createGitRepo({
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    writeManifest(join(root, manifestPath), {
      description: "metadata update",
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    commitAll(root, "metadata update");
    const writeOutput = vi.fn();

    expect(main([manifestPath], { cwd: root, writeOutput })).toBeUndefined();
    expect(writeOutput).not.toHaveBeenCalled();
  });
});

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "pending-tag-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function createGitRepo(manifest) {
  const root = createTempDir();
  mkdirSync(join(root, "packages/alpha"), { recursive: true });
  writeManifest(join(root, manifestPath), manifest);
  runGit(["-c", "init.defaultBranch=main", "init"], root);
  commitAll(root, "initial");

  return root;
}

function writeManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function commitAll(root, message) {
  runGit(["add", "."], root);
  runGit(
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      message,
    ],
    root,
  );
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd });
}
