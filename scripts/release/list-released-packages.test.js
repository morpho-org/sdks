import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getGitHubOutput,
  listChangedManifests,
  listReleasedPackages,
  main,
  reportReleasedPackages,
} from "./list-released-packages.mjs";

const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("listChangedManifests", () => {
  test("default", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
      { name: "@morpho-org/beta", version: "2.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/alpha", version: "1.1.0" });
    commitAll(root, "version alpha");

    expect(listChangedManifests({ cwd: root })).toEqual([
      "packages/alpha/package.json",
    ]);
  });

  test("behavior: ignores non-manifest changes", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writeFileSync(join(root, "packages/alpha/README.md"), "# alpha\n");
    commitAll(root, "document alpha");

    expect(listChangedManifests({ cwd: root })).toEqual([]);
  });
});

describe("listReleasedPackages", () => {
  test("default", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
      { name: "@morpho-org/beta", version: "2.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/beta", version: "2.1.0" });
    writePackage(root, { name: "@morpho-org/alpha", version: "1.1.0" });
    commitAll(root, "version packages");

    expect(listReleasedPackages({ cwd: root })).toEqual([
      { name: "@morpho-org/alpha", version: "1.1.0" },
      { name: "@morpho-org/beta", version: "2.1.0" },
    ]);
  });

  test("behavior: skips manifests whose version did not change", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writePackage(root, {
      description: "Metadata-only manifest update",
      name: "@morpho-org/alpha",
      version: "1.0.0",
    });
    commitAll(root, "update alpha metadata");

    expect(listReleasedPackages({ cwd: root })).toEqual([]);
  });

  test("behavior: skips private packages", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", private: true, version: "1.0.0" },
    ]);
    writePackage(root, {
      name: "@morpho-org/alpha",
      private: true,
      version: "1.1.0",
    });
    commitAll(root, "version alpha");

    expect(listReleasedPackages({ cwd: root })).toEqual([]);
  });

  test("behavior: skips manifests without a version", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/alpha" });
    commitAll(root, "drop alpha version");

    expect(listReleasedPackages({ cwd: root })).toEqual([]);
  });

  test("behavior: treats a missing previous manifest as a new package", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/beta", version: "0.1.0" });
    commitAll(root, "add beta");

    expect(listReleasedPackages({ cwd: root })).toEqual([
      { name: "@morpho-org/beta", version: "0.1.0" },
    ]);
  });

  test("behavior: no base ref on an initial commit", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);

    expect(listReleasedPackages({ cwd: root })).toEqual([]);
  });

  test("behavior: diffs against the first parent of a merge commit", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    runGit(["checkout", "-b", "release"], root);
    writePackage(root, { name: "@morpho-org/alpha", version: "1.1.0" });
    commitAll(root, "version alpha");
    runGit(["checkout", "main"], root);
    runGit(
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "merge",
        "--no-ff",
        "-m",
        "merge release",
        "release",
      ],
      root,
    );

    expect(listReleasedPackages({ cwd: root })).toEqual([
      { name: "@morpho-org/alpha", version: "1.1.0" },
    ]);
  });

  test("error: rethrows unexpected git failures", () => {
    const root = createTempDir();

    expect(() => listReleasedPackages({ cwd: root })).toThrow(
      /not a git repository/,
    );
  });
});

describe("getGitHubOutput", () => {
  test("default", () => {
    expect(
      getGitHubOutput([{ name: "@morpho-org/alpha", version: "1.1.0" }]),
    ).toBe(
      'has_released_packages=true\nreleased_packages=[{"name":"@morpho-org/alpha","version":"1.1.0"}]\n',
    );
  });

  test("behavior: empty release set", () => {
    expect(getGitHubOutput([])).toBe(
      "has_released_packages=false\nreleased_packages=[]\n",
    );
  });
});

describe("reportReleasedPackages", () => {
  test("default", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/alpha", version: "1.1.0" });
    commitAll(root, "version alpha");
    const outputFile = join(createTempDir(), "github-output");
    writeFileSync(outputFile, "");
    const writeOutput = vi.fn();

    expect(
      reportReleasedPackages({ cwd: root, outputFile, writeOutput }),
    ).toEqual([{ name: "@morpho-org/alpha", version: "1.1.0" }]);
    expect(readFileSync(outputFile, "utf8")).toBe(
      'has_released_packages=true\nreleased_packages=[{"name":"@morpho-org/alpha","version":"1.1.0"}]\n',
    );
    expect(writeOutput).toHaveBeenCalledWith(
      `${JSON.stringify([{ name: "@morpho-org/alpha", version: "1.1.0" }], null, 2)}\n`,
    );
  });

  test("behavior: skips the output file when it is not configured", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    const writeOutput = vi.fn();

    expect(
      reportReleasedPackages({ cwd: root, outputFile: "", writeOutput }),
    ).toEqual([]);
    expect(writeOutput).toHaveBeenCalledWith("[]\n");
  });
});

describe("main", () => {
  test("default", () => {
    const root = createGitRepo([
      { name: "@morpho-org/alpha", version: "1.0.0" },
    ]);
    writePackage(root, { name: "@morpho-org/alpha", version: "1.1.0" });
    commitAll(root, "version alpha");
    const writeOutput = vi.fn();

    expect(main({ cwd: root, outputFile: "", writeOutput })).toEqual([
      { name: "@morpho-org/alpha", version: "1.1.0" },
    ]);
  });
});

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "released-packages-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function createGitRepo(manifests) {
  const root = createTempDir();
  for (const manifest of manifests) {
    writePackage(root, manifest);
  }
  runGit(["-c", "init.defaultBranch=main", "init"], root);
  commitAll(root, "initial");

  return root;
}

function writePackage(root, manifest) {
  const packageDir = join(root, "packages", basename(manifest.name));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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
  // `git checkout`/`git merge` report progress on stderr; keep it out of the
  // test reporter output.
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}
