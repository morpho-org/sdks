import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { applyVersionArtifact, main } from "./apply-version-artifact.mjs";
import { writeVersionArtifact } from "./write-version-artifact.mjs";

const tempDirs = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("writeVersionArtifact", () => {
  test("default", () => {
    const root = createGitRepo();
    const manifest = { name: "@morpho-org/morpho-sdk", version: "1.1.0" };
    const artifactPath = join(
      mkTempDir("version-artifact-output-"),
      "version-changes.json",
    );

    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify(manifest)}\n`,
    );
    writeFileSync(join(root, ".changeset/pre.json"), '{"mode":"pre"}\n');
    rmSync(join(root, ".changeset/alpha.md"));

    expect(writeVersionArtifact({ artifactPath, cwd: root })).toEqual({
      additions: [
        {
          contents: Buffer.from('{"mode":"pre"}\n').toString("base64"),
          path: ".changeset/pre.json",
        },
        {
          contents: Buffer.from(`${JSON.stringify(manifest)}\n`).toString(
            "base64",
          ),
          path: "packages/morpho-sdk/package.json",
        },
      ],
      deletions: [{ path: ".changeset/alpha.md" }],
      schemaVersion: 1,
    });

    expect(JSON.parse(readFileSync(artifactPath, "utf8"))).toEqual(
      writeVersionArtifact({ artifactPath, cwd: root }),
    );
  });

  test("error: rejects disallowed version output paths", () => {
    const root = createGitRepo();
    const artifactPath = join(
      mkTempDir("version-artifact-output-"),
      "version-changes.json",
    );

    writeFileSync(join(root, "README.md"), "# Changed\n");

    expect(() => writeVersionArtifact({ artifactPath, cwd: root })).toThrow(
      "Versioning produced files outside the release allowlist:",
    );
  });
});

describe("applyVersionArtifact", () => {
  test("default", () => {
    const root = createGitRepo();
    const manifest = { name: "@morpho-org/morpho-sdk", version: "1.1.0" };
    const artifactSource = serializeArtifact({
      additions: [
        {
          contents: Buffer.from(`${JSON.stringify(manifest)}\n`).toString(
            "base64",
          ),
          path: "packages/morpho-sdk/package.json",
        },
        {
          contents: Buffer.from('{"mode":"pre"}\n').toString("base64"),
          path: ".changeset/pre.json",
        },
      ],
      deletions: [{ path: ".changeset/alpha.md" }],
      schemaVersion: 1,
    });

    applyVersionArtifact({
      artifactSource,
      cwd: root,
    });

    expect(
      readFileSync(join(root, "packages/morpho-sdk/package.json"), "utf8"),
    ).toBe(`${JSON.stringify(manifest)}\n`);
    expect(readFileSync(join(root, ".changeset/pre.json"), "utf8")).toBe(
      '{"mode":"pre"}\n',
    );
    expect(existsSync(join(root, ".changeset/alpha.md"))).toBe(false);
  });

  test("error: rejects disallowed artifact paths", () => {
    const root = createGitRepo();
    const artifactSource = serializeArtifact({
      additions: [
        {
          contents: Buffer.from("# Changed\n").toString("base64"),
          path: "README.md",
        },
      ],
      deletions: [],
      schemaVersion: 1,
    });

    expect(() =>
      applyVersionArtifact({
        artifactSource,
        cwd: root,
      }),
    ).toThrow('Invalid version artifact path "README.md".');
  });

  test("error: rejects duplicate artifact paths", () => {
    const root = createGitRepo();
    const artifactSource = serializeArtifact({
      additions: [
        {
          contents: Buffer.from("{}\n").toString("base64"),
          path: ".changeset/pre.json",
        },
      ],
      deletions: [{ path: ".changeset/pre.json" }],
      schemaVersion: 1,
    });

    expect(() =>
      applyVersionArtifact({
        artifactSource,
        cwd: root,
      }),
    ).toThrow('Duplicate version artifact path ".changeset/pre.json".');
  });

  test("error: rejects non-canonical base64 contents", () => {
    const root = createGitRepo();
    const artifactSource = serializeArtifact({
      additions: [{ contents: "abc", path: ".changeset/pre.json" }],
      deletions: [],
      schemaVersion: 1,
    });

    expect(() =>
      applyVersionArtifact({
        artifactSource,
        cwd: root,
      }),
    ).toThrow(
      'Version artifact addition ".changeset/pre.json" is not canonical base64.',
    );
  });

  test("error: rejects unsafe package manifest contents before write token", () => {
    const root = createGitRepo();
    const artifactSource = serializeArtifact({
      additions: [
        {
          contents: Buffer.from(
            `${JSON.stringify({
              name: "@morpho-org/morpho-sdk",
              scripts: { prepublishOnly: "node payload.js" },
              version: "1.1.0",
            })}\n`,
          ).toString("base64"),
          path: "packages/morpho-sdk/package.json",
        },
      ],
      deletions: [],
      schemaVersion: 1,
    });

    expect(() =>
      applyVersionArtifact({
        artifactSource,
        cwd: root,
      }),
    ).toThrow(
      'Disallowed package.json field change "scripts" in packages/morpho-sdk/package.json.',
    );
  });

  test("error: rejects missing artifact source", () => {
    const root = createGitRepo();

    expect(() => applyVersionArtifact({ cwd: root })).toThrow(
      "Version artifact source is required.",
    );
  });

  test("error: rejects artifact path arguments", () => {
    const root = createGitRepo();
    const artifactSource = serializeArtifact({
      additions: [],
      deletions: [],
      schemaVersion: 1,
    });

    expect(() =>
      main(["version-changes.json"], {
        artifactSource,
        cwd: root,
      }),
    ).toThrow("Version artifact path arguments are not supported.");
  });
});

function createGitRepo() {
  const root = mkTempDir("version-artifact-");
  mkdirSync(join(root, "packages/morpho-sdk"), { recursive: true });
  mkdirSync(join(root, ".changeset"), { recursive: true });
  writeFileSync(
    join(root, "packages/morpho-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.0.0" })}\n`,
  );
  writeFileSync(join(root, ".changeset/alpha.md"), "---\n");
  runGit(["-c", "init.defaultBranch=main", "init"], root);
  runGit(["config", "user.email", "test@example.com"], root);
  runGit(["config", "user.name", "Test User"], root);
  runGit(["add", "."], root);
  runGit(["commit", "-m", "initial"], root);

  return root;
}

function serializeArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function mkTempDir(prefix) {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(tempDir);

  return tempDir;
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: "ignore" });
}
