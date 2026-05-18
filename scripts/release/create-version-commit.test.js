import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  collectVersionChanges,
  createSignedVersionCommit,
  getGitHubOutput,
  isAllowedVersionPath,
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
});

describe("createSignedVersionCommit", () => {
  test("default", async () => {
    const requests = [];
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
        return jsonResponse(
          { ref: "refs/heads/changeset-release/main" },
          { status: 200 },
        );
      }

      if (requests.length === 5) {
        return jsonResponse(
          { ref: "refs/heads/changeset-release/main" },
          { status: 200 },
        );
      }

      return jsonResponse(null, { status: 204 });
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
                refName: "tmp-release",
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
        method: "GET",
        url: "https://api.github.test/repos/morpho-org/sdks/git/ref/heads/changeset-release/main",
      },
      {
        body: {
          force: true,
          sha: "signed-commit",
        },
        method: "PATCH",
        url: "https://api.github.test/repos/morpho-org/sdks/git/refs/heads/changeset-release/main",
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

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd });
}

function jsonResponse(body, init = {}) {
  return new Response(body == null ? undefined : JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200,
  });
}
