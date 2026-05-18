#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const DEFAULT_COMMIT_MESSAGE = "chore: version packages";
const USER_AGENT = "morpho-sdks-release-version-commit";

/**
 * Returns whether a file is allowed to be changed by the release version commit.
 *
 * @param {string} path The repository-relative path to check.
 * @returns {boolean} Whether the path is part of the release allowlist.
 */
export function isAllowedVersionPath(path) {
  return (
    /^packages\/[^/]+\/package\.json$/.test(path) ||
    /^packages\/[^/]+\/CHANGELOG\.md$/.test(path) ||
    /^\.changeset\/[^/]+\.md$/.test(path) ||
    path === ".changeset/pre.json"
  );
}

/**
 * Formats the GitHub Actions outputs produced by the release commit step.
 *
 * @param {{ commitOid?: string, hasVersionChanges: boolean }} result The commit result.
 * @returns {string} GitHub Actions output lines.
 */
export function getGitHubOutput(result) {
  const output = [
    `has_version_changes=${result.hasVersionChanges ? "true" : "false"}`,
  ];

  if (result.commitOid != null) {
    output.push(`commit_sha=${result.commitOid}`);
  }

  return `${output.join("\n")}\n`;
}

/**
 * Collects local version changes and converts them into GitHub GraphQL file changes.
 *
 * @param {{ cwd?: string }} options Options for reading the git worktree.
 * @returns {{ additions: Array<{ path: string, contents: string }>, deletions: Array<{ path: string }>, disallowedPaths: string[], paths: string[] }} The planned file changes.
 */
export function collectVersionChanges(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const trackedPaths = readNullSeparatedGitOutput(
    runGit(["diff", "--name-only", "-z", "HEAD", "--"], { cwd }),
  );
  const untrackedPaths = readNullSeparatedGitOutput(
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], { cwd }),
  );
  const paths = [...new Set([...trackedPaths, ...untrackedPaths])].sort();
  const disallowedPaths = paths.filter((path) => !isAllowedVersionPath(path));

  if (disallowedPaths.length > 0) {
    return { additions: [], deletions: [], disallowedPaths, paths };
  }

  const additions = [];
  const deletions = [];

  for (const path of paths) {
    const { absolutePath, basePath } = resolveWorktreePath(cwd, path);
    let stats;

    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        deletions.push({ path });
        continue;
      }

      throw error;
    }

    if (!stats.isFile()) {
      throw new Error(`Versioning produced non-file path "${path}".`);
    }

    assertPathInsideBase({
      absolutePath: realpathSync(absolutePath),
      basePath,
      path,
    });

    additions.push({
      contents: readFileSync(absolutePath).toString("base64"),
      path,
    });
  }

  return { additions, deletions, disallowedPaths, paths };
}

/**
 * Creates a GitHub-signed release commit through the GitHub App token.
 *
 * @param {{ apiBaseUrl?: string, baseSha: string, commitMessage?: string, cwd?: string, fetchImpl?: typeof fetch, fileChanges: { additions: Array<{ path: string, contents: string }>, deletions: Array<{ path: string }> }, gitRemoteUrl?: string, pushReleaseBranch?: (options: { commitOid: string, cwd: string, releaseBranch: string, remoteUrl?: string, repository: string, tempBranch: string, token: string }) => void, releaseBranch: string, repository: string, tempBranch?: string, token: string }} options Commit options.
 * @returns {Promise<{ commitOid: string, tempBranch: string }>} The created commit metadata.
 */
export async function createSignedVersionCommit(options) {
  const [owner, repo] = options.repository.split("/");
  if (owner == null || owner === "" || repo == null || repo === "") {
    throw new Error(`Invalid GitHub repository "${options.repository}".`);
  }

  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const commitMessage = options.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const cwd = options.cwd ?? process.cwd();
  const fetchImpl = options.fetchImpl ?? fetch;
  const pushReleaseBranch =
    options.pushReleaseBranch ?? pushReleaseBranchWithLease;
  const tempBranch =
    options.tempBranch ??
    `${options.releaseBranch}-api-commit-${randomUUID().slice(0, 8)}`;

  if (tempBranch === options.releaseBranch) {
    throw new Error("Temporary branch must differ from the release branch.");
  }

  await createOrUpdateBranchRef({
    apiBaseUrl,
    branch: tempBranch,
    fetchImpl,
    owner,
    repo,
    sha: options.baseSha,
    token: options.token,
  });

  try {
    const data = await graphqlRequest({
      apiBaseUrl,
      fetchImpl,
      query: `mutation CreateVersionCommit($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit {
            oid
          }
        }
      }`,
      token: options.token,
      variables: {
        input: {
          branch: {
            branchName: tempBranch,
            repositoryNameWithOwner: options.repository,
          },
          expectedHeadOid: options.baseSha,
          fileChanges: options.fileChanges,
          message: {
            headline: commitMessage,
          },
        },
      },
    });
    const commitOid = data.createCommitOnBranch.commit.oid;

    pushReleaseBranch({
      commitOid,
      cwd,
      releaseBranch: options.releaseBranch,
      remoteUrl: options.gitRemoteUrl,
      repository: options.repository,
      tempBranch,
      token: options.token,
    });

    return { commitOid, tempBranch };
  } finally {
    await deleteBranchRef({
      apiBaseUrl,
      branch: tempBranch,
      fetchImpl,
      owner,
      repo,
      token: options.token,
    }).catch((error) => {
      process.stderr.write(
        `Warning: failed to delete temporary branch "${tempBranch}": ${getErrorMessage(error)}\n`,
      );
    });
  }
}

/**
 * Pushes the signed temporary-branch commit to the release branch with lease protection.
 *
 * @param {{ commitOid: string, cwd: string, releaseBranch: string, remoteUrl?: string, repository: string, tempBranch: string, token: string }} options Push options.
 * @returns {void}
 */
export function pushReleaseBranchWithLease(options) {
  const originalOriginUrl = runGit(["remote", "get-url", "origin"], {
    cwd: options.cwd,
  })
    .toString("utf8")
    .trim();
  const authenticatedOriginUrl =
    options.remoteUrl ??
    `https://x-access-token:${encodeURIComponent(
      options.token,
    )}@github.com/${options.repository}.git`;
  const remoteReleaseRef = `refs/heads/${options.releaseBranch}`;
  const localReleaseRef = `refs/remotes/origin/${options.releaseBranch}`;
  const localTempRef = `refs/remotes/origin/${options.tempBranch}`;

  runGit(["remote", "set-url", "origin", authenticatedOriginUrl], {
    cwd: options.cwd,
  });

  try {
    runGit(
      ["fetch", "origin", `+refs/heads/${options.tempBranch}:${localTempRef}`],
      { cwd: options.cwd },
    );

    if (hasRemoteBranch({ branch: options.releaseBranch, cwd: options.cwd })) {
      runGit(["fetch", "origin", `+${remoteReleaseRef}:${localReleaseRef}`], {
        cwd: options.cwd,
      });
      const expectedSha = runGit(["rev-parse", localReleaseRef], {
        cwd: options.cwd,
      })
        .toString("utf8")
        .trim();

      runGit(
        [
          "push",
          `--force-with-lease=${remoteReleaseRef}:${expectedSha}`,
          "origin",
          `${options.commitOid}:${remoteReleaseRef}`,
        ],
        { cwd: options.cwd },
      );
      return;
    }

    runGit(["push", "origin", `${options.commitOid}:${remoteReleaseRef}`], {
      cwd: options.cwd,
    });
  } finally {
    runGit(["remote", "set-url", "origin", originalOriginUrl], {
      cwd: options.cwd,
    });
  }
}

/**
 * Runs the release commit workflow step.
 *
 * @param {{ apiBaseUrl?: string, cwd?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, outputFile?: string }} options Runtime options.
 * @returns {Promise<null | { commitOid: string, tempBranch: string }>} The commit result when changes exist.
 */
export async function main(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const outputFile = options.outputFile ?? env.GITHUB_OUTPUT;
  const versionChanges = collectVersionChanges({ cwd });

  if (versionChanges.disallowedPaths.length > 0) {
    process.stderr.write(
      "Versioning produced files outside the release allowlist:\n",
    );
    process.stderr.write(
      `${formatIndentedList(versionChanges.disallowedPaths)}\n`,
    );
    throw new Error("Versioning produced files outside the release allowlist.");
  }

  if (versionChanges.paths.length === 0) {
    process.stdout.write("No version changes to commit.\n");
    appendOutput(outputFile, getGitHubOutput({ hasVersionChanges: false }));
    return null;
  }

  const token = readRequiredEnv(env, "GH_TOKEN");
  const repository = readRequiredEnv(env, "GITHUB_REPOSITORY");
  const releaseBranch = readRequiredEnv(env, "RELEASE_BRANCH");
  const baseSha = runGit(["rev-parse", "HEAD"], { cwd })
    .toString("utf8")
    .trim();
  const tempBranch = [
    releaseBranch,
    "api-commit",
    env.GITHUB_RUN_ID ?? "local",
    env.GITHUB_RUN_ATTEMPT ?? "0",
  ].join("-");
  const result = await createSignedVersionCommit({
    apiBaseUrl: options.apiBaseUrl,
    baseSha,
    fetchImpl: options.fetchImpl,
    fileChanges: {
      additions: versionChanges.additions,
      deletions: versionChanges.deletions,
    },
    releaseBranch,
    repository,
    tempBranch,
    token,
  });

  appendOutput(
    outputFile,
    getGitHubOutput({
      commitOid: result.commitOid,
      hasVersionChanges: true,
    }),
  );
  process.stdout.write(
    `Created signed version commit ${result.commitOid} on ${releaseBranch}.\n`,
  );

  return result;
}

async function createOrUpdateBranchRef(options) {
  const existingRef = await githubRequest({
    allowNotFound: true,
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    method: "GET",
    path: `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(
      options.repo,
    )}/git/ref/${encodeGitRefPath(`heads/${options.branch}`)}`,
    token: options.token,
  });

  if (existingRef == null) {
    await githubRequest({
      apiBaseUrl: options.apiBaseUrl,
      body: {
        ref: `refs/heads/${options.branch}`,
        sha: options.sha,
      },
      fetchImpl: options.fetchImpl,
      method: "POST",
      path: `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(
        options.repo,
      )}/git/refs`,
      token: options.token,
    });
    return;
  }

  await githubRequest({
    apiBaseUrl: options.apiBaseUrl,
    body: {
      force: true,
      sha: options.sha,
    },
    fetchImpl: options.fetchImpl,
    method: "PATCH",
    path: `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(
      options.repo,
    )}/git/refs/${encodeGitRefPath(`heads/${options.branch}`)}`,
    token: options.token,
  });
}

async function deleteBranchRef(options) {
  await githubRequest({
    allowNotFound: true,
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    method: "DELETE",
    path: `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(
      options.repo,
    )}/git/refs/${encodeGitRefPath(`heads/${options.branch}`)}`,
    token: options.token,
  });
}

async function githubRequest(options) {
  const response = await options.fetchImpl(
    new URL(options.path, options.apiBaseUrl),
    {
      body: options.body == null ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: options.method,
    },
  );
  const responseBody = await readResponseBody(response);

  if (options.allowNotFound === true && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API ${options.method} ${options.path} failed with ${response.status}: ${summarizeResponseBody(
        responseBody,
      )}`,
    );
  }

  return responseBody;
}

async function graphqlRequest(options) {
  const response = await githubRequest({
    apiBaseUrl: options.apiBaseUrl,
    body: {
      query: options.query,
      variables: options.variables,
    },
    fetchImpl: options.fetchImpl,
    method: "POST",
    path: "/graphql",
    token: options.token,
  });

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new Error(
      `GitHub GraphQL request failed: ${summarizeResponseBody(response.errors)}`,
    );
  }

  return response.data;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (text === "") return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarizeResponseBody(body) {
  if (body == null) return "empty response body";
  if (typeof body === "string") return body.slice(0, 1_000);
  if (typeof body.message === "string") return body.message;

  return JSON.stringify(body).slice(0, 1_000);
}

function encodeGitRefPath(ref) {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function appendOutput(outputFile, output) {
  if (outputFile != null && outputFile !== "") {
    appendFileSync(outputFile, output);
  }
}

function readRequiredEnv(env, name) {
  const value = env[name];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function readNullSeparatedGitOutput(output) {
  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "");
}

function resolveWorktreePath(cwd, path) {
  const basePath = realpathSync(cwd);
  const absolutePath = resolve(basePath, path);
  assertPathInsideBase({ absolutePath, basePath, path });

  return { absolutePath, basePath };
}

function assertPathInsideBase(options) {
  const relativePath = relative(options.basePath, options.absolutePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Invalid path "${options.path}".`);
  }
}

function isNotFoundError(error) {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function hasRemoteBranch(options) {
  try {
    runGit(["ls-remote", "--exit-code", "--heads", "origin", options.branch], {
      cwd: options.cwd,
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    if (hasExitStatus(error, 2)) return false;
    throw error;
  }
}

function hasExitStatus(error, status) {
  return (
    typeof error === "object" &&
    error != null &&
    "status" in error &&
    error.status === status
  );
}

function runGit(args, options) {
  return execFileSync("git", args, {
    cwd: options.cwd,
    stdio: options.stdio,
  });
}

function formatIndentedList(paths) {
  return paths.map((path) => `  ${sanitizeLogLine(path)}`).join("\n");
}

function sanitizeLogLine(value) {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    sanitized +=
      codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)
        ? "?"
        : character;
  }

  return sanitized;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `::error::${sanitizeAnnotation(getErrorMessage(error))}\n`,
    );
    process.exitCode = 1;
  });
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeAnnotation(message) {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
