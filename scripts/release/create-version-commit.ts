#!/usr/bin/env node

import { execFileSync, type StdioOptions } from "node:child_process";
import {
  appendFileSync,
  lstatSync,
  readFileSync,
  realpathSync,
  type Stats,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getMidnightPackageVersionSource,
  MIDNIGHT_PACKAGE_MANIFEST_PATH,
  MIDNIGHT_VERSION_SOURCE_PATH,
} from "./generate-midnight-package-version.ts";
import { getErrorMessage, isPathInside, sanitizeLogLine } from "./helpers.ts";

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

/** A file to create or overwrite in the version commit. */
export interface VersionFileAddition {
  readonly contents: string;
  readonly path: string;
}

/** A file to delete in the version commit. */
export interface VersionFileDeletion {
  readonly path: string;
}

/** File additions and deletions staged for the version commit. */
export interface VersionFileChanges {
  readonly additions: readonly VersionFileAddition[];
  readonly deletions: readonly VersionFileDeletion[];
}

/** File changes plus the validated path list and any rejected paths. */
export interface VersionChanges extends VersionFileChanges {
  readonly disallowedPaths: readonly string[];
  readonly paths: readonly string[];
}

/** Inputs for pushing the signed version commit onto the release branch. */
export interface PushReleaseBranchOptions {
  readonly commitOid: string;
  readonly cwd: string;
  readonly releaseBranch: string;
  readonly remoteUrl?: string;
  readonly repository: string;
  readonly tempBranch: string;
  readonly token: string;
}

/** Injectable push implementation (overridden in tests). */
export type PushReleaseBranch = (options: PushReleaseBranchOptions) => void;

interface RunGitOptions {
  cwd: string;
  stdio?: StdioOptions;
}

type RunGit = (args: string[], options: RunGitOptions) => Buffer;

interface GitHubRequestOptions {
  allowNotFound?: boolean;
  apiBaseUrl: string;
  body?: unknown;
  fetchImpl: typeof fetch;
  method: string;
  path: string;
  token: string;
}

interface CreateSignedVersionCommitOptions {
  apiBaseUrl?: string;
  baseSha: string;
  commitMessage?: string;
  cwd?: string;
  fetchImpl?: typeof fetch;
  fileChanges: VersionFileChanges;
  gitRemoteUrl?: string;
  pushReleaseBranch?: PushReleaseBranch;
  releaseBranch: string;
  repository: string;
  runAttempt?: string;
  runId?: string;
  tempBranch?: string;
  token: string;
  writeWarning?: (message: string) => void;
}

interface CreateVersionCommitMainOptions {
  apiBaseUrl?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  outputFile?: string;
  pushReleaseBranch?: PushReleaseBranch;
  writeError?: (message: string) => void;
  writeOutput?: (message: string) => void;
  writeWarning?: (message: string) => void;
}

interface GraphqlResponse {
  data?: unknown;
  errors?: unknown;
}

interface CreateCommitOnBranchResponse {
  createCommitOnBranch?: {
    commit?: {
      oid?: string;
    } | null;
  } | null;
}

/**
 * Returns whether a file is allowed to be changed by the release version commit.
 *
 * @param path The repository-relative path to check.
 * @returns Whether the path is part of the release allowlist.
 */
export function isAllowedVersionPath(path: string): boolean {
  return (
    PACKAGE_MANIFEST_PATH_RE.test(path) ||
    PACKAGE_CHANGELOG_PATH_RE.test(path) ||
    CHANGESET_PATH_RE.test(path) ||
    path === MIDNIGHT_VERSION_SOURCE_PATH ||
    path === ".changeset/pre.json"
  );
}

/**
 * Formats the GitHub Actions outputs produced by the release commit step.
 *
 * @param result The commit result.
 * @returns GitHub Actions output lines.
 */
export function getGitHubOutput(result: {
  commitOid?: string;
  hasVersionChanges: boolean;
}): string {
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
 * @param options Options for reading the git worktree.
 * @returns The planned file changes.
 */
export function collectVersionChanges(
  options: { cwd?: string; runGitImpl?: RunGit } = {},
): VersionChanges {
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

  const additions: VersionFileAddition[] = [];
  const deletions: VersionFileDeletion[] = [];

  for (const path of paths) {
    const { absolutePath, basePath } = resolveWorktreePath(cwd, path);
    let stats: Stats;

    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        if (PACKAGE_MANIFEST_PATH_RE.test(path)) {
          throw new Error(`Versioning deleted package manifest "${path}".`);
        }
        if (path === MIDNIGHT_VERSION_SOURCE_PATH) {
          throw new Error(
            `Versioning deleted generated package version source "${path}".`,
          );
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

  if (
    paths.includes(MIDNIGHT_PACKAGE_MANIFEST_PATH) ||
    paths.includes(MIDNIGHT_VERSION_SOURCE_PATH)
  ) {
    assertMidnightPackageVersionSource({ cwd });
  }

  return { additions, deletions, disallowedPaths, paths };
}

function assertMidnightPackageVersionSource(options: { cwd: string }): void {
  const { absolutePath, basePath } = resolveWorktreePath(
    options.cwd,
    MIDNIGHT_VERSION_SOURCE_PATH,
  );
  let stats: Stats;

  try {
    stats = lstatSync(absolutePath);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(
        `Generated package version source "${MIDNIGHT_VERSION_SOURCE_PATH}" does not match the Midnight SDK package manifest.`,
      );
    }

    throw error;
  }

  if (!stats.isFile()) {
    throw new Error(
      `Versioning produced non-file path "${MIDNIGHT_VERSION_SOURCE_PATH}".`,
    );
  }

  assertPathInsideBase({
    absolutePath: realpathSync(absolutePath),
    basePath,
    path: MIDNIGHT_VERSION_SOURCE_PATH,
  });

  if (
    readFileSync(absolutePath, "utf8") !==
    getMidnightPackageVersionSource({ cwd: options.cwd })
  ) {
    throw new Error(
      `Generated package version source "${MIDNIGHT_VERSION_SOURCE_PATH}" does not match the Midnight SDK package manifest.`,
    );
  }
}

/**
 * Creates a GitHub-signed release commit through the GitHub App token.
 *
 * @param options Commit options.
 * @returns The created commit metadata.
 */
export async function createSignedVersionCommit(
  options: CreateSignedVersionCommitOptions,
): Promise<{ commitOid: string; tempBranch: string }> {
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
    const data = (await graphqlRequest({
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
    })) as CreateCommitOnBranchResponse | null;
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
 * @param options Push options.
 */
export function pushReleaseBranchWithLease(
  options: PushReleaseBranchOptions,
): void {
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
 * @param options Runtime options.
 * @returns The commit result when changes exist.
 */
export async function main(
  options: CreateVersionCommitMainOptions = {},
): Promise<{ commitOid: string; tempBranch: string } | null> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const outputFile = options.outputFile ?? env.GITHUB_OUTPUT;
  const writeError =
    options.writeError ?? ((message) => process.stderr.write(message));
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));
  const versionChanges = collectVersionChanges({ cwd });

  if (versionChanges.disallowedPaths.length > 0) {
    writeError("Versioning produced files outside the release allowlist:\n");
    writeError(`${formatIndentedList(versionChanges.disallowedPaths)}\n`);
    throw new Error("Versioning produced files outside the release allowlist.");
  }

  if (versionChanges.paths.length === 0) {
    writeOutput("No version changes to commit.\n");
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
  writeOutput(
    `Created signed version commit ${result.commitOid} on ${releaseBranch}.\n`,
  );

  return result;
}

async function createOrUpdateBranchRef(options: {
  apiBaseUrl: string;
  branch: string;
  fetchImpl: typeof fetch;
  owner: string;
  repo: string;
  sha: string;
  token: string;
}): Promise<void> {
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

async function deleteBranchRef(options: {
  apiBaseUrl: string;
  branch: string;
  fetchImpl: typeof fetch;
  owner: string;
  repo: string;
  token: string;
}): Promise<void> {
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

async function githubRequest(options: GitHubRequestOptions): Promise<unknown> {
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

async function graphqlRequest(options: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  query: string;
  token: string;
  variables: unknown;
}): Promise<unknown> {
  const response = (await githubRequest({
    apiBaseUrl: options.apiBaseUrl,
    body: {
      query: options.query,
      variables: options.variables,
    },
    fetchImpl: options.fetchImpl,
    method: "POST",
    path: "/graphql",
    token: options.token,
  })) as GraphqlResponse;

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new Error(
      `GitHub GraphQL request failed: ${summarizeResponseBody(response.errors)}`,
    );
  }

  return response.data;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarizeResponseBody(body: unknown): string {
  if (body == null) return "empty response body";
  if (typeof body === "string") return body.slice(0, 1_000);
  if (typeof (body as { message?: unknown }).message === "string") {
    return (body as { message: string }).message;
  }

  return JSON.stringify(body).slice(0, 1_000);
}

function encodeGitRefPath(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function appendOutput(outputFile: string | undefined, output: string): void {
  if (outputFile != null && outputFile !== "") {
    appendFileSync(outputFile, output);
  }
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function readReleaseBranch(env: NodeJS.ProcessEnv): string {
  const releaseBranch = readRequiredEnv(env, "RELEASE_BRANCH");
  if (!RELEASE_BRANCH_RE.test(releaseBranch)) {
    throw new Error(
      `Invalid RELEASE_BRANCH "${releaseBranch}". Expected "changeset-release/main" or "changeset-release/next".`,
    );
  }

  return releaseBranch;
}

function buildTempBranchName(options: {
  releaseBranch: string;
  runAttempt?: string;
  runId?: string;
}): string {
  return [
    options.releaseBranch,
    "api-commit",
    options.runId ?? "local",
    options.runAttempt ?? "0",
  ].join("-");
}

function assertTempBranch(tempBranch: string): void {
  if (!TEMP_BRANCH_RE.test(tempBranch)) {
    throw new Error(
      `Invalid temporary branch "${tempBranch}". Expected "changeset-release/main-api-commit-*" or "changeset-release/next-api-commit-*".`,
    );
  }
}

function readNullSeparatedGitOutput(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "")
    .map(validateGitPath);
}

function validateGitPath(path: string): string {
  if (hasControlCharacter(path) || path.split("/").includes("..")) {
    throw new Error(`Invalid git path "${sanitizeLogLine(path)}".`);
  }

  return path;
}

function readBaseVersionFile(options: {
  cwd: string;
  path: string;
  runGitImpl: RunGit;
}): string {
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

function assertSafePackageJsonChange(options: {
  afterSource: string;
  beforeSource: string;
  path: string;
}): void {
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
      throw new Error(
        `Disallowed dependency value change in ${field} of ${options.path}.`,
      );
    }

    throw new Error(
      `Disallowed package.json field change "${field}" in ${options.path}.`,
    );
  }
}

function parsePackageJson(
  source: string,
  path: string,
): Record<string, unknown> {
  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid package manifest JSON in "${path}".`, {
      cause: error,
    });
  }
}

function resolveWorktreePath(
  cwd: string,
  path: string,
): { absolutePath: string; basePath: string } {
  const basePath = realpathSync(cwd);
  const absolutePath = resolve(basePath, path);
  assertPathInsideBase({ absolutePath, basePath, path });

  return { absolutePath, basePath };
}

function assertPathInsideBase(options: {
  absolutePath: string;
  basePath: string;
  path: string;
}): void {
  if (!isPathInside(options.basePath, options.absolutePath)) {
    throw new Error(`Invalid path "${options.path}".`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function hasRemoteBranch(options: { branch: string; cwd: string }): boolean {
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

function hasExitStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "status" in error &&
    error.status === status
  );
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

function runGit(args: string[], options: RunGitOptions): Buffer {
  return execFileSync("git", args, {
    cwd: options.cwd,
    encoding: "buffer",
    stdio: options.stdio,
  });
}

function formatIndentedList(paths: readonly string[]): string {
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

function sanitizeAnnotation(message: string): string {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
