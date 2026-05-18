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
  collectVersionChanges,
  createSignedVersionCommit,
  getGitHubOutput,
  isAllowedVersionPath,
  pushReleaseBranchWithLease,
} from "./create-version-commit.mjs";

const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("isAllowedVersionPath", () => {
  test("default", () => {
    expect(isAllowedVersionPath("packages/morpho-sdk/package.json")).toBe(true);
    expect(isAllowedVersionPath("packages/morpho-sdk/CHANGELOG.md")).toBe(true);
    expect(isAllowedVersionPath(".changeset/alpha.md")).toBe(true);
    expect(isAllowedVersionPath(".changeset/pre.json")).toBe(true);
  });

  test("behavior: rejects non-version paths", () => {
    expect(isAllowedVersionPath("package.json")).toBe(false);
    expect(isAllowedVersionPath("packages/morpho-sdk/src/index.ts")).toBe(
      false,
    );
    expect(isAllowedVersionPath(".github/workflows/version-pr.yml")).toBe(
      false,
    );
  });
});

describe("getGitHubOutput", () => {
  test("default", () => {
    expect(
      getGitHubOutput({
        commitOid: "abc123",
        hasVersionChanges: true,
      }),
    ).toBe("has_version_changes=true\ncommit_sha=abc123\n");
  });

  test("behavior: no version changes", () => {
    expect(getGitHubOutput({ hasVersionChanges: false })).toBe(
      "has_version_changes=false\n",
    );
  });
});

describe("collectVersionChanges", () => {
  test("default", () => {
    const root = createGitRepo();
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
    );
    writeFileSync(join(root, ".changeset/pre.json"), '{"mode":"pre"}\n');
    rmSync(join(root, ".changeset/alpha.md"));

    expect(collectVersionChanges({ cwd: root })).toEqual({
      additions: [
        {
          contents: Buffer.from('{"mode":"pre"}\n').toString("base64"),
          path: ".changeset/pre.json",
        },
        {
          contents: Buffer.from(
            `${JSON.stringify({
              name: "@morpho-org/morpho-sdk",
              version: "1.1.0",
            })}\n`,
          ).toString("base64"),
          path: "packages/morpho-sdk/package.json",
        },
      ],
      deletions: [{ path: ".changeset/alpha.md" }],
      disallowedPaths: [],
      paths: [
        ".changeset/alpha.md",
        ".changeset/pre.json",
        "packages/morpho-sdk/package.json",
      ],
    });
  });

  test("behavior: reports disallowed paths", () => {
    const root = createGitRepo();
    writeFileSync(join(root, "README.md"), "# Changed\n");

    expect(collectVersionChanges({ cwd: root })).toMatchObject({
      additions: [],
      deletions: [],
      disallowedPaths: ["README.md"],
      paths: ["README.md"],
    });
  });

  test("behavior: rejects symlinked version files", () => {
    const root = createGitRepo();
    const externalRoot = mkdtempSync(join(tmpdir(), "version-external-"));
    tempDirs.push(externalRoot);
    writeFileSync(join(externalRoot, "package.json"), '{"private":true}\n');
    rmSync(join(root, "packages/morpho-sdk/package.json"));
    symlinkSync(
      join(externalRoot, "package.json"),
      join(root, "packages/morpho-sdk/package.json"),
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      'Versioning produced non-file path "packages/morpho-sdk/package.json".',
    );
  });
});

describe("createSignedVersionCommit", () => {
  test("default", async () => {
    const requests = [];
    const pushReleaseBranch = vi.fn();
    const fetchImpl = vi.fn(async (url, init) => {
      requests.push({
        body: init.body == null ? null : JSON.parse(init.body),
        method: init.method,
        url: url.toString(),
      });

      if (requests.length === 1) {
        return jsonResponse({ message: "Not Found" }, { status: 404 });
      }

      if (requests.length === 2) {
        return jsonResponse({ ref: "refs/heads/tmp-release" }, { status: 201 });
      }

      if (requests.length === 3) {
        return jsonResponse({
          data: {
            createCommitOnBranch: {
              commit: {
                oid: "signed-commit",
              },
            },
          },
        });
      }

      if (requests.length === 4) {
        return jsonResponse(null, { status: 204 });
      }

      throw new Error(`Unexpected request ${requests.length}.`);
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: {
          additions: [
            { contents: "Y29udGVudA==", path: "packages/a/package.json" },
          ],
          deletions: [{ path: ".changeset/alpha.md" }],
        },
        pushReleaseBranch,
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "tmp-release",
        token: "token",
      }),
    ).resolves.toEqual({
      commitOid: "signed-commit",
      tempBranch: "tmp-release",
    });

    expect(requests).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://api.github.test/repos/morpho-org/sdks/git/ref/heads/tmp-release",
      },
      {
        body: {
          ref: "refs/heads/tmp-release",
          sha: "base-sha",
        },
        method: "POST",
        url: "https://api.github.test/repos/morpho-org/sdks/git/refs",
      },
      {
        body: {
          query: expect.stringContaining("createCommitOnBranch"),
          variables: {
            input: {
              branch: {
                branchName: "tmp-release",
                repositoryNameWithOwner: "morpho-org/sdks",
              },
              expectedHeadOid: "base-sha",
              fileChanges: {
                additions: [
                  {
                    contents: "Y29udGVudA==",
                    path: "packages/a/package.json",
                  },
                ],
                deletions: [{ path: ".changeset/alpha.md" }],
              },
              message: {
                headline: "chore: version packages",
              },
            },
          },
        },
        method: "POST",
        url: "https://api.github.test/graphql",
      },
      {
        body: null,
        method: "DELETE",
        url: "https://api.github.test/repos/morpho-org/sdks/git/refs/heads/tmp-release",
      },
    ]);
    expect(JSON.stringify(requests[2].body.variables.input)).not.toContain(
      "author",
    );
    expect(JSON.stringify(requests[2].body.variables.input)).not.toContain(
      "committer",
    );
    expect(pushReleaseBranch).toHaveBeenCalledWith({
      commitOid: "signed-commit",
      cwd: process.cwd(),
      releaseBranch: "changeset-release/main",
      remoteUrl: undefined,
      repository: "morpho-org/sdks",
      tempBranch: "tmp-release",
      token: "token",
    });
  });
});

describe("pushReleaseBranchWithLease", () => {
  test("default", () => {
    const fixture = createReleaseRemoteFixture();

    pushReleaseBranchWithLease({
      commitOid: fixture.tempCommit,
      cwd: fixture.root,
      releaseBranch: "changeset-release/main",
      remoteUrl: fixture.remote,
      repository: "morpho-org/sdks",
      tempBranch: "tmp-release",
      token: "token",
    });

    expect(readRemoteBranchSha(fixture.remote, "changeset-release/main")).toBe(
      fixture.tempCommit,
    );
    expect(
      runGit(["remote", "get-url", "origin"], fixture.root).toString(),
    ).toBe(`${fixture.originalOriginUrl}\n`);
  });

  test("behavior: refuses stale release branch lease", () => {
    const fixture = createReleaseRemoteFixture();
    const raceCommit = createRemoteRaceCommit(fixture);

    writeFileSync(
      join(fixture.root, ".git/hooks/pre-push"),
      `#!/bin/sh\ngit --git-dir="${fixture.remote}" update-ref refs/heads/changeset-release/main "${raceCommit}"\n`,
      { mode: 0o755 },
    );

    expect(() =>
      pushReleaseBranchWithLease({
        commitOid: fixture.tempCommit,
        cwd: fixture.root,
        releaseBranch: "changeset-release/main",
        remoteUrl: fixture.remote,
        repository: "morpho-org/sdks",
        tempBranch: "tmp-release",
        token: "token",
      }),
    ).toThrow();
    expect(readRemoteBranchSha(fixture.remote, "changeset-release/main")).toBe(
      raceCommit,
    );
    expect(
      runGit(["remote", "get-url", "origin"], fixture.root).toString(),
    ).toBe(`${fixture.originalOriginUrl}\n`);
  });
});

function createGitRepo() {
  const root = mkdtempSync(join(tmpdir(), "version-commit-"));
  tempDirs.push(root);
  mkdirSync(join(root, "packages/morpho-sdk"), { recursive: true });
  mkdirSync(join(root, ".changeset"), { recursive: true });
  writeFileSync(
    join(root, "packages/morpho-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.0.0" })}\n`,
  );
  writeFileSync(join(root, ".changeset/alpha.md"), "---\n");
  runGit(["-c", "init.defaultBranch=main", "init"], root);
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
      "initial",
    ],
    root,
  );

  return root;
}

function createReleaseRemoteFixture() {
  const root = createGitRepo();
  const remote = mkdtempSync(join(tmpdir(), "version-remote-"));
  const originalOriginUrl = "https://github.com/morpho-org/sdks.git";
  tempDirs.push(remote);

  runGit(["init", "--bare"], remote);
  runGit(["remote", "add", "origin", remote], root);
  runGit(["push", "origin", "main"], root);

  runGit(["checkout", "-b", "changeset-release/main"], root);
  writeFileSync(join(root, "packages/morpho-sdk/CHANGELOG.md"), "# 1.0.0\n");
  commitAll(root, "release branch");
  runGit(["push", "origin", "changeset-release/main"], root);

  runGit(["checkout", "main"], root);
  runGit(["checkout", "-b", "tmp-release"], root);
  writeFileSync(
    join(root, "packages/morpho-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
  );
  commitAll(root, "version packages");
  const tempCommit = runGit(["rev-parse", "HEAD"], root).toString().trim();
  runGit(["push", "origin", "tmp-release"], root);

  runGit(["checkout", "main"], root);
  runGit(["remote", "set-url", "origin", originalOriginUrl], root);

  return { originalOriginUrl, remote, root, tempCommit };
}

function createRemoteRaceCommit(fixture) {
  runGit(["checkout", "-b", "race-release", "main"], fixture.root);
  writeFileSync(join(fixture.root, "README.md"), "# Race\n");
  commitAll(fixture.root, "race release");
  const raceCommit = runGit(["rev-parse", "HEAD"], fixture.root)
    .toString()
    .trim();
  runGit(
    ["push", fixture.remote, `${raceCommit}:refs/heads/race-release`],
    fixture.root,
  );
  runGit(["checkout", "main"], fixture.root);

  return raceCommit;
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

function readRemoteBranchSha(remote, branch) {
  return runGit(["--git-dir", remote, "rev-parse", `refs/heads/${branch}`])
    .toString()
    .trim();
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd });
}

function jsonResponse(body, init = {}) {
  return new Response(body == null ? undefined : JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200,
  });
}
