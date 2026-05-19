#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, isPathInside, sanitizeLogLine } from "./helpers.mjs";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const DEFAULT_COMMIT_MESSAGE = "chore: version packages";
const PACKAGE_MANIFEST_PATH_RE = /^packages\/[^/]+\/package\.json$/;
const PACKAGE_CHANGELOG_PATH_RE = /^packages\/[^/]+\/CHANGELOG\.md$/;
const CHANGESET_PATH_RE = /^\.changeset\/[^/]+\.md$/;
const ALLOWED_PACKAGE_JSON_TOP_LEVEL_FIELDS = new Set(["version"]);
const ALLOWED_PACKAGE_JSON_DEPENDENCY_BLOCKS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const RELEASE_BRANCH_RE = /^changeset-release\/(?:main|next)$/;
const TEMP_BRANCH_RE = /^changeset-release\/(?:main|next)-api-commit-[^/]+$/;
const USER_AGENT = "morpho-sdks-release-version-commit";

/**
 * Returns whether a file is allowed to be changed by the release version commit.
 *
 * @param {string} path The repository-relative path to check.
 * @returns {boolean} Whether the path is part of the release allowlist.
 */
export function isAllowedVersionPath(path) {
  return (
    PACKAGE_MANIFEST_PATH_RE.test(path) ||
    PACKAGE_CHANGELOG_PATH_RE.test(path) ||
    CHANGESET_PATH_RE.test(path) ||
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
 * @param {{ cwd?: string, runGitImpl?: typeof runGit }} options Options for reading the git worktree.
 * @returns {{ additions: Array<{ path: string, contents: string }>, deletions: Array<{ path: string }>, disallowedPaths: string[], paths: string[] }} The planned file changes.
 */
export function collectVersionChanges(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runGitImpl = options.runGitImpl ?? runGit;
  const trackedPaths = readNullSeparatedGitOutput(
    runGitImpl(["diff", "--name-only", "-z", "HEAD", "--"], { cwd }),
  );
  const untrackedPaths = readNullSeparatedGitOutput(
    runGitImpl(["ls-files", "--others", "--exclude-standard", "-z"], { cwd }),
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
        if (PACKAGE_MANIFEST_PATH_RE.test(path)) {
          throw new Error(`Versioning deleted package manifest "${path}".`);
        }

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

    const contents = readFileSync(absolutePath);
    if (PACKAGE_MANIFEST_PATH_RE.test(path)) {
      assertSafePackageJsonChange({
        afterSource: contents.toString("utf8"),
        beforeSource: readBaseVersionFile({ cwd, path, runGitImpl }),
        path,
      });
    }

    additions.push({
      contents: contents.toString("base64"),
      path,
    });
  }

  return { additions, deletions, disallowedPaths, paths };
}

/**
 * Creates a GitHub-signed release commit through the GitHub App token.
 *
 * @param {{ apiBaseUrl?: string, baseSha: string, commitMessage?: string, cwd?: string, fetchImpl?: typeof fetch, fileChanges: { additions: Array<{ path: string, contents: string }>, deletions: Array<{ path: string }> }, gitRemoteUrl?: string, pushReleaseBranch?: (options: { commitOid: string, cwd: string, releaseBranch: string, remoteUrl?: string, repository: string, tempBranch: string, token: string }) => void, releaseBranch: string, repository: string, runAttempt?: string, runId?: string, tempBranch?: string, token: string, writeWarning?: (message: string) => void }} options Commit options.
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
  const writeWarning =
    options.writeWarning ?? ((message) => process.stderr.write(message));
  const tempBranch =
    options.tempBranch ??
    buildTempBranchName({
      releaseBranch: options.releaseBranch,
      runAttempt: options.runAttempt,
      runId: options.runId,
    });

  if (tempBranch === options.releaseBranch) {
    throw new Error("Temporary branch must differ from the release branch.");
  }
  assertTempBranch(tempBranch);

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
    const commitOid = data?.createCommitOnBranch?.commit?.oid;
    if (typeof commitOid !== "string" || commitOid === "") {
      throw new Error(
        `GitHub GraphQL createCommitOnBranch returned no commit oid: ${summarizeResponseBody(
          data,
        )}`,
      );
    }

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
      writeWarning(
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

    // Lease against the current release-branch tip when it exists, or against
    // an empty value (the branch must not exist yet) so a racing creation is
    // rejected rather than silently overwritten.
    let expectedSha = "";
    if (hasRemoteBranch({ branch: options.releaseBranch, cwd: options.cwd })) {
      runGit(["fetch", "origin", `+${remoteReleaseRef}:${localReleaseRef}`], {
        cwd: options.cwd,
      });
      expectedSha = runGit(["rev-parse", localReleaseRef], {
        cwd: options.cwd,
      })
        .toString("utf8")
        .trim();
    }

    runGit(
      [
        "push",
        `--force-with-lease=${remoteReleaseRef}:${expectedSha}`,
        "origin",
        `${options.commitOid}:${remoteReleaseRef}`,
      ],
      { cwd: options.cwd },
    );
  } finally {
    runGit(["remote", "set-url", "origin", originalOriginUrl], {
      cwd: options.cwd,
    });
  }
}

/**
 * Runs the release commit workflow step.
 *
 * @param {{ apiBaseUrl?: string, cwd?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, outputFile?: string, pushReleaseBranch?: (options: { commitOid: string, cwd: string, releaseBranch: string, remoteUrl?: string, repository: string, tempBranch: string, token: string }) => void, writeError?: (message: string) => void, writeWarning?: (message: string) => void }} options Runtime options.
 * @returns {Promise<null | { commitOid: string, tempBranch: string }>} The commit result when changes exist.
 */
export async function main(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const outputFile = options.outputFile ?? env.GITHUB_OUTPUT;
  const writeError =
    options.writeError ?? ((message) => process.stderr.write(message));
  const versionChanges = collectVersionChanges({ cwd });

  if (versionChanges.disallowedPaths.length > 0) {
    writeError("Versioning produced files outside the release allowlist:\n");
    writeError(`${formatIndentedList(versionChanges.disallowedPaths)}\n`);
    throw new Error("Versioning produced files outside the release allowlist.");
  }

  if (versionChanges.paths.length === 0) {
    process.stdout.write("No version changes to commit.\n");
    appendOutput(outputFile, getGitHubOutput({ hasVersionChanges: false }));
    return null;
  }

  const token = readRequiredEnv(env, "GH_TOKEN");
  const repository = readRequiredEnv(env, "GITHUB_REPOSITORY");
  const releaseBranch = readReleaseBranch(env);
  const baseSha = runGit(["rev-parse", "HEAD"], { cwd })
    .toString("utf8")
    .trim();
  const result = await createSignedVersionCommit({
    apiBaseUrl: options.apiBaseUrl,
    baseSha,
    cwd,
    fetchImpl: options.fetchImpl,
    fileChanges: {
      additions: versionChanges.additions,
      deletions: versionChanges.deletions,
    },
    releaseBranch,
    repository,
    pushReleaseBranch: options.pushReleaseBranch,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    runId: env.GITHUB_RUN_ID,
    token,
    writeWarning: options.writeWarning,
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

function readReleaseBranch(env) {
  const releaseBranch = readRequiredEnv(env, "RELEASE_BRANCH");
  if (!RELEASE_BRANCH_RE.test(releaseBranch)) {
    throw new Error(
      `Invalid RELEASE_BRANCH "${releaseBranch}". Expected "changeset-release/main" or "changeset-release/next".`,
    );
  }

  return releaseBranch;
}

function buildTempBranchName(options) {
  return [
    options.releaseBranch,
    "api-commit",
    options.runId ?? "local",
    options.runAttempt ?? "0",
  ].join("-");
}

function assertTempBranch(tempBranch) {
  if (!TEMP_BRANCH_RE.test(tempBranch)) {
    throw new Error(
      `Invalid temporary branch "${tempBranch}". Expected "changeset-release/main-api-commit-*" or "changeset-release/next-api-commit-*".`,
    );
  }
}

function readNullSeparatedGitOutput(output) {
  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "")
    .map(validateGitPath);
}

function validateGitPath(path) {
  if (hasControlCharacter(path) || path.split("/").includes("..")) {
    throw new Error(`Invalid git path "${sanitizeLogLine(path)}".`);
  }

  return path;
}

function readBaseVersionFile(options) {
  try {
    return options
      .runGitImpl(["show", `HEAD:${options.path}`], {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      })
      .toString("utf8");
  } catch (error) {
    if (hasExitStatus(error, 128)) {
      throw new Error(`Versioning added package manifest "${options.path}".`);
    }

    throw error;
  }
}

function assertSafePackageJsonChange(options) {
  const before = parsePackageJson(options.beforeSource, options.path);
  const after = parsePackageJson(options.afterSource, options.path);
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const field of fields) {
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) {
      continue;
    }

    if (ALLOWED_PACKAGE_JSON_TOP_LEVEL_FIELDS.has(field)) {
      continue;
    }

    if (ALLOWED_PACKAGE_JSON_DEPENDENCY_BLOCKS.has(field)) {
      const beforeNames = getDependencyNames({
        field,
        manifest: before,
        path: options.path,
      });
      const afterNames = getDependencyNames({
        field,
        manifest: after,
        path: options.path,
      });

      if (beforeNames.join(",") !== afterNames.join(",")) {
        throw new Error(
          `Disallowed dep-name change in ${field} of ${options.path}.`,
        );
      }

      continue;
    }

    throw new Error(
      `Disallowed package.json field change "${field}" in ${options.path}.`,
    );
  }
}

function parsePackageJson(source, path) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid package manifest JSON in "${path}".`, {
      cause: error,
    });
  }
}

function getDependencyNames(options) {
  const value = options.manifest[options.field];
  if (value == null) return [];

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Invalid dependency block "${options.field}" in ${options.path}.`,
    );
  }

  return Object.keys(value).sort();
}

function resolveWorktreePath(cwd, path) {
  const basePath = realpathSync(cwd);
  const absolutePath = resolve(basePath, path);
  assertPathInsideBase({ absolutePath, basePath, path });

  return { absolutePath, basePath };
}

function assertPathInsideBase(options) {
  if (!isPathInside(options.basePath, options.absolutePath)) {
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

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
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

function sanitizeAnnotation(message) {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
