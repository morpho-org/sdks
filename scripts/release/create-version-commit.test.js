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
import { afterAll, describe, expect, test, vi } from "vitest";

import {
  collectVersionChanges,
  createSignedVersionCommit,
  getGitHubOutput,
  isAllowedVersionPath,
  main,
  pushReleaseBranchWithLease,
} from "./create-version-commit.mjs";

const tempDirs = [];

afterAll(() => {
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

  test("error: rejects dependency value changes", () => {
    const root = createGitRepo({
      dependencies: {
        "@morpho-org/blue-sdk": "workspace:^",
      },
      devDependencies: {
        "@morpho-org/test": "workspace:^",
      },
      name: "@morpho-org/morpho-sdk",
      peerDependencies: {
        viem: "^2.0.0",
      },
      version: "1.0.0",
    });
    const manifest = {
      dependencies: {
        "@morpho-org/blue-sdk": "5.23.4",
      },
      devDependencies: {
        "@morpho-org/test": "2.7.4",
      },
      name: "@morpho-org/morpho-sdk",
      peerDependencies: {
        viem: "^2.50.0",
      },
      version: "1.1.0",
    };
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify(manifest)}\n`,
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      "Disallowed dependency value change in dependencies of packages/morpho-sdk/package.json.",
    );
  });

  test("error: rejects package manifest field changes", () => {
    const root = createGitRepo();
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({
        name: "@morpho-org/morpho-sdk",
        scripts: { prepublishOnly: "node payload.js" },
        version: "1.1.0",
      })}\n`,
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      'Disallowed package.json field change "scripts" in packages/morpho-sdk/package.json.',
    );
  });

  test("error: rejects dependency name changes", () => {
    const root = createGitRepo({
      dependencies: {
        "@morpho-org/blue-sdk": "workspace:^",
      },
      name: "@morpho-org/morpho-sdk",
      version: "1.0.0",
    });
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({
        dependencies: {
          "@morpho-org/blue-sdk-typosquat": "5.23.4",
        },
        name: "@morpho-org/morpho-sdk",
        version: "1.1.0",
      })}\n`,
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      "Disallowed dependency value change in dependencies of packages/morpho-sdk/package.json.",
    );
  });

  test("error: rejects added package manifests", () => {
    const root = createGitRepo();
    mkdirSync(join(root, "packages/blue-sdk"), { recursive: true });
    writeFileSync(
      join(root, "packages/blue-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/blue-sdk", version: "1.0.0" })}\n`,
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      'Versioning added package manifest "packages/blue-sdk/package.json".',
    );
  });

  test("error: rejects deleted package manifests", () => {
    const root = createGitRepo();
    rmSync(join(root, "packages/morpho-sdk/package.json"));

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      'Versioning deleted package manifest "packages/morpho-sdk/package.json".',
    );
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

  test("behavior: rejects in-repo symlinked version files", () => {
    const root = createGitRepo();
    mkdirSync(join(root, "packages/blue-sdk"), { recursive: true });
    writeFileSync(
      join(root, "packages/blue-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/blue-sdk", version: "1.0.0" })}\n`,
    );
    commitAll(root, "add blue package");
    rmSync(join(root, "packages/morpho-sdk/package.json"));
    symlinkSync(
      join(root, "packages/blue-sdk/package.json"),
      join(root, "packages/morpho-sdk/package.json"),
    );

    expect(() => collectVersionChanges({ cwd: root })).toThrow(
      'Versioning produced non-file path "packages/morpho-sdk/package.json".',
    );
  });

  test("error: control-character git path", () => {
    const root = createGitRepo();
    const runGitImpl = vi.fn((args) =>
      Buffer.from(args[0] === "diff" ? "packages/a/package.json\x01\0" : ""),
    );

    expect(() => collectVersionChanges({ cwd: root, runGitImpl })).toThrow(
      'Invalid git path "packages/a/package.json?".',
    );
  });

  test("error: lexical traversal git path", () => {
    const root = createGitRepo();
    const runGitImpl = vi.fn((args) =>
      Buffer.from(args[0] === "diff" ? "packages/../etc/passwd\0" : ""),
    );

    expect(() => collectVersionChanges({ cwd: root, runGitImpl })).toThrow(
      'Invalid git path "packages/../etc/passwd".',
    );
  });
});

describe("main", () => {
  test("default", async () => {
    const root = createGitRepo();
    const outputFile = join(root, "github-output.txt");
    const requests = [];
    const pushReleaseBranch = vi.fn();
    const writeOutput = vi.fn();
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
    );
    rmSync(join(root, ".changeset/alpha.md"));

    await expect(
      main({
        apiBaseUrl: "https://api.github.test",
        cwd: root,
        env: {
          GH_TOKEN: "token",
          GITHUB_REPOSITORY: "morpho-org/sdks",
          GITHUB_RUN_ATTEMPT: "2",
          GITHUB_RUN_ID: "100",
          RELEASE_BRANCH: "changeset-release/main",
        },
        fetchImpl: createSignedCommitFetch({ requests }),
        outputFile,
        pushReleaseBranch,
        writeOutput,
      }),
    ).resolves.toEqual({
      commitOid: "signed-commit",
      tempBranch: "changeset-release/main-api-commit-100-2",
    });

    expect(readFileSync(outputFile, "utf8")).toBe(
      "has_version_changes=true\ncommit_sha=signed-commit\n",
    );
    expect(requests[2].body.variables.input).toMatchObject({
      branch: {
        branchName: "changeset-release/main-api-commit-100-2",
        repositoryNameWithOwner: "morpho-org/sdks",
      },
      fileChanges: {
        additions: [
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
      },
    });
    expect(pushReleaseBranch).toHaveBeenCalledWith({
      commitOid: "signed-commit",
      cwd: root,
      releaseBranch: "changeset-release/main",
      remoteUrl: undefined,
      repository: "morpho-org/sdks",
      tempBranch: "changeset-release/main-api-commit-100-2",
      token: "token",
    });
    expect(writeOutput).toHaveBeenCalledWith(
      "Created signed version commit signed-commit on changeset-release/main.\n",
    );
  }, 60_000);

  test("behavior: no version changes", async () => {
    const root = createGitRepo();
    const outputFile = join(root, "github-output.txt");
    const writeOutput = vi.fn();

    await expect(
      main({ cwd: root, env: {}, outputFile, writeOutput }),
    ).resolves.toBeNull();
    expect(readFileSync(outputFile, "utf8")).toBe(
      "has_version_changes=false\n",
    );
    expect(writeOutput).toHaveBeenCalledWith("No version changes to commit.\n");
  });

  test("error: disallowed version path", async () => {
    const root = createGitRepo();
    const writeError = vi.fn();
    writeFileSync(join(root, "README.md"), "# Changed\n");

    await expect(main({ cwd: root, env: {}, writeError })).rejects.toThrow(
      "Versioning produced files outside the release allowlist.",
    );
    expect(writeError).toHaveBeenCalledWith(
      "Versioning produced files outside the release allowlist:\n",
    );
    expect(writeError).toHaveBeenCalledWith("  README.md\n");
  });

  test("error: invalid release branch environment", async () => {
    const root = createGitRepo();
    const fetchImpl = vi.fn();
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
    );

    await expect(
      main({
        cwd: root,
        env: {
          GH_TOKEN: "token",
          GITHUB_REPOSITORY: "morpho-org/sdks",
          RELEASE_BRANCH: "changeset-release/feature",
        },
        fetchImpl,
      }),
    ).rejects.toThrow(
      'Invalid RELEASE_BRANCH "changeset-release/feature". Expected "changeset-release/main" or "changeset-release/next".',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("error: missing required environment", async () => {
    const root = createGitRepo();
    const fetchImpl = vi.fn();
    writeFileSync(
      join(root, "packages/morpho-sdk/package.json"),
      `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
    );

    await expect(
      main({
        cwd: root,
        env: {
          GITHUB_REPOSITORY: "morpho-org/sdks",
          RELEASE_BRANCH: "changeset-release/main",
        },
        fetchImpl,
      }),
    ).rejects.toThrow("Missing required environment variable GH_TOKEN.");
    expect(fetchImpl).not.toHaveBeenCalled();
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
        return jsonResponse(
          { ref: "refs/heads/changeset-release/main-api-commit-100-2" },
          { status: 201 },
        );
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
        runAttempt: "2",
        runId: "100",
        token: "token",
      }),
    ).resolves.toEqual({
      commitOid: "signed-commit",
      tempBranch: "changeset-release/main-api-commit-100-2",
    });

    expect(requests).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://api.github.test/repos/morpho-org/sdks/git/ref/heads/changeset-release/main-api-commit-100-2",
      },
      {
        body: {
          ref: "refs/heads/changeset-release/main-api-commit-100-2",
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
                branchName: "changeset-release/main-api-commit-100-2",
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
        url: "https://api.github.test/repos/morpho-org/sdks/git/refs/heads/changeset-release/main-api-commit-100-2",
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
      tempBranch: "changeset-release/main-api-commit-100-2",
      token: "token",
    });
  });

  test("error: invalid repository", async () => {
    await expect(
      createSignedVersionCommit({
        baseSha: "base-sha",
        fetchImpl: vi.fn(),
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow('Invalid GitHub repository "morpho-org".');
  });

  test("error: temporary branch matches release branch", async () => {
    await expect(
      createSignedVersionCommit({
        baseSha: "base-sha",
        fetchImpl: vi.fn(),
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main",
        token: "token",
      }),
    ).rejects.toThrow("Temporary branch must differ from the release branch.");
  });

  test("error: temporary branch outside release staging namespace", async () => {
    const fetchImpl = vi.fn();

    await expect(
      createSignedVersionCommit({
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      'Invalid temporary branch "main-api-commit-test". Expected "changeset-release/main-api-commit-*" or "changeset-release/next-api-commit-*".',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("error: temporary branch outside ignored release staging branches", async () => {
    const fetchImpl = vi.fn();

    await expect(
      createSignedVersionCommit({
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/feature-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      'Invalid temporary branch "changeset-release/feature-api-commit-test". Expected "changeset-release/main-api-commit-*" or "changeset-release/next-api-commit-*".',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("error: GraphQL errors", async () => {
    const requests = [];
    const fetchImpl = createSignedCommitFetch({
      graphqlBody: { errors: [{ message: "bad mutation" }] },
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      'GitHub GraphQL request failed: [{"message":"bad mutation"}]',
    );
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "POST",
      "DELETE",
    ]);
  });

  test("error: missing commit oid in GraphQL response", async () => {
    const requests = [];
    const pushReleaseBranch = vi.fn();
    const fetchImpl = createSignedCommitFetch({
      graphqlBody: { data: { createCommitOnBranch: null } },
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        pushReleaseBranch,
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      'GitHub GraphQL createCommitOnBranch returned no commit oid: {"createCommitOnBranch":null}',
    );
    expect(pushReleaseBranch).not.toHaveBeenCalled();
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "POST",
      "DELETE",
    ]);
  });

  test("error: create ref lookup failure", async () => {
    const requests = [];
    const fetchImpl = createSignedCommitFetch({
      getRefResponse: jsonResponse(
        { message: "server unavailable" },
        { status: 503 },
      ),
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      "GitHub API GET /repos/morpho-org/sdks/git/ref/heads/changeset-release/main-api-commit-test failed with 503: server unavailable",
    );
    expect(requests).toHaveLength(1);
  });

  test("error: create temporary ref failure", async () => {
    const requests = [];
    const fetchImpl = createSignedCommitFetch({
      createRefResponse: new Response("server unavailable", { status: 503 }),
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      "GitHub API POST /repos/morpho-org/sdks/git/refs failed with 503: server unavailable",
    );
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
  });

  test("behavior: updates an existing temporary ref", async () => {
    const requests = [];
    const pushReleaseBranch = vi.fn();
    const fetchImpl = createSignedCommitFetch({
      getRefResponse: jsonResponse({
        ref: "refs/heads/changeset-release/main-api-commit-test",
      }),
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        commitMessage: "chore: custom version packages",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        pushReleaseBranch,
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).resolves.toEqual({
      commitOid: "signed-commit",
      tempBranch: "changeset-release/main-api-commit-test",
    });
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "PATCH",
      "POST",
      "DELETE",
    ]);
    expect(requests[1].body).toEqual({ force: true, sha: "base-sha" });
    expect(requests[2].body.variables.input.message).toEqual({
      headline: "chore: custom version packages",
    });
  });

  test("error: update existing ref failure", async () => {
    const requests = [];
    const fetchImpl = createSignedCommitFetch({
      getRefResponse: jsonResponse({
        ref: "refs/heads/changeset-release/main-api-commit-test",
      }),
      patchRefResponse: jsonResponse(
        { message: "patch failed" },
        { status: 500 },
      ),
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow(
      "GitHub API PATCH /repos/morpho-org/sdks/git/refs/heads/changeset-release/main-api-commit-test failed with 500: patch failed",
    );
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH"]);
  });

  test("error: push failure deletes temporary branch", async () => {
    const requests = [];
    const fetchImpl = createSignedCommitFetch({ requests });
    const pushReleaseBranch = vi.fn(() => {
      throw new Error("push failed");
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        pushReleaseBranch,
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
      }),
    ).rejects.toThrow("push failed");
    expect(requests.at(-1)).toMatchObject({
      method: "DELETE",
      url: "https://api.github.test/repos/morpho-org/sdks/git/refs/heads/changeset-release/main-api-commit-test",
    });
  });

  test("behavior: delete failure warns without failing", async () => {
    const requests = [];
    const writeWarning = vi.fn();
    const fetchImpl = createSignedCommitFetch({
      deleteRefResponse: jsonResponse(
        { message: "delete failed" },
        { status: 500 },
      ),
      requests,
    });

    await expect(
      createSignedVersionCommit({
        apiBaseUrl: "https://api.github.test",
        baseSha: "base-sha",
        fetchImpl,
        fileChanges: { additions: [], deletions: [] },
        pushReleaseBranch: vi.fn(),
        releaseBranch: "changeset-release/main",
        repository: "morpho-org/sdks",
        tempBranch: "changeset-release/main-api-commit-test",
        token: "token",
        writeWarning,
      }),
    ).resolves.toEqual({
      commitOid: "signed-commit",
      tempBranch: "changeset-release/main-api-commit-test",
    });
    expect(writeWarning).toHaveBeenCalledWith(
      'Warning: failed to delete temporary branch "changeset-release/main-api-commit-test": GitHub API DELETE /repos/morpho-org/sdks/git/refs/heads/changeset-release/main-api-commit-test failed with 500: delete failed\n',
    );
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
      tempBranch: "changeset-release/main-api-commit-test",
      token: "token",
    });

    expect(readRemoteBranchSha(fixture.remote, "changeset-release/main")).toBe(
      fixture.tempCommit,
    );
    expect(
      runGit(["remote", "get-url", "origin"], fixture.root).toString(),
    ).toBe(`${fixture.originalOriginUrl}\n`);
  });

  test("behavior: creates missing release branch with empty lease", () => {
    const fixture = createReleaseRemoteFixture({ createReleaseBranch: false });

    pushReleaseBranchWithLease({
      commitOid: fixture.tempCommit,
      cwd: fixture.root,
      releaseBranch: "changeset-release/main",
      remoteUrl: fixture.remote,
      repository: "morpho-org/sdks",
      tempBranch: "changeset-release/main-api-commit-test",
      token: "token",
    });

    expect(readRemoteBranchSha(fixture.remote, "changeset-release/main")).toBe(
      fixture.tempCommit,
    );
  });
});

function createGitRepo(
  manifest = { name: "@morpho-org/morpho-sdk", version: "1.0.0" },
) {
  const root = mkdtempSync(join(tmpdir(), "version-commit-"));
  tempDirs.push(root);
  mkdirSync(join(root, "packages/morpho-sdk"), { recursive: true });
  mkdirSync(join(root, ".changeset"), { recursive: true });
  writeFileSync(
    join(root, "packages/morpho-sdk/package.json"),
    `${JSON.stringify(manifest)}\n`,
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

function createReleaseRemoteFixture(options = {}) {
  const root = createGitRepo();
  const remote = mkdtempSync(join(tmpdir(), "version-remote-"));
  const originalOriginUrl = "https://github.com/morpho-org/sdks.git";
  tempDirs.push(remote);

  runGit(["init", "--bare"], remote);
  runGit(["remote", "add", "origin", remote], root);
  runGit(["push", "origin", "main"], root);

  if (options.createReleaseBranch !== false) {
    runGit(["checkout", "-b", "changeset-release/main"], root);
    writeFileSync(join(root, "packages/morpho-sdk/CHANGELOG.md"), "# 1.0.0\n");
    commitAll(root, "release branch");
    runGit(["push", "origin", "changeset-release/main"], root);
  }

  runGit(["checkout", "main"], root);
  runGit(["checkout", "-b", "changeset-release/main-api-commit-test"], root);
  writeFileSync(
    join(root, "packages/morpho-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/morpho-sdk", version: "1.1.0" })}\n`,
  );
  commitAll(root, "version packages");
  const tempCommit = runGit(["rev-parse", "HEAD"], root).toString().trim();
  runGit(["push", "origin", "changeset-release/main-api-commit-test"], root);

  runGit(["checkout", "main"], root);
  runGit(["remote", "set-url", "origin", originalOriginUrl], root);

  return { originalOriginUrl, remote, root, tempCommit };
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

function createSignedCommitFetch(options = {}) {
  const requests = options.requests ?? [];

  return vi.fn(async (url, init) => {
    requests.push({
      body: init.body == null ? null : JSON.parse(init.body),
      method: init.method,
      url: url.toString(),
    });

    const request = requests.at(-1);

    if (request.method === "GET") {
      return (
        options.getRefResponse ??
        jsonResponse({ message: "Not Found" }, { status: 404 })
      );
    }

    if (request.method === "POST" && request.url.endsWith("/git/refs")) {
      return (
        options.createRefResponse ??
        jsonResponse(
          { ref: "refs/heads/changeset-release/main-api-commit-test" },
          { status: 201 },
        )
      );
    }

    if (request.method === "PATCH") {
      return (
        options.patchRefResponse ??
        jsonResponse({
          ref: "refs/heads/changeset-release/main-api-commit-test",
        })
      );
    }

    if (request.method === "POST" && request.url.endsWith("/graphql")) {
      return jsonResponse(
        options.graphqlBody ?? {
          data: {
            createCommitOnBranch: {
              commit: {
                oid: "signed-commit",
              },
            },
          },
        },
      );
    }

    if (request.method === "DELETE") {
      return options.deleteRefResponse ?? jsonResponse(null, { status: 204 });
    }

    throw new Error(`Unexpected request ${requests.length}.`);
  });
}

function jsonResponse(body, init = {}) {
  return new Response(body == null ? undefined : JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200,
  });
}
