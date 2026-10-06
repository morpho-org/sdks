#!/usr/bin/env node
/**
 * sync.ts — opens or updates the sync PR on public morpho-org/sdks from a verified public
 * tree artifact. Run by the `sync` job of `.github/workflows/public-snapshot.yml`:
 *
 *   node scripts/release/public-sync/sync.ts --dir <artifact> --sha <RELEASE_SHA> [--base <push before SHA>]
 *
 * `--base` picks the same release range as `detect-release.ts` (default `RELEASE_SHA^`).
 *
 * Reads the installation token from `GH_TOKEN` and writes `outcome` and `pr` to
 * `GITHUB_OUTPUT` when set. Imports Node built-ins and repository scripts only: the job
 * that runs it installs no dependencies.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import type { TarballIdentity } from "../../publish/read-tarball-identity.ts";
import { isMain, readRequiredEnv, reportCliError } from "../../workflow.ts";
import type {
  VersionFileAddition,
  VersionFileChanges,
} from "../create-version-commit.ts";
import { listReleasedPackages } from "../public-gates/detect-release.ts";
import { verifyArtifact } from "../public-gates/verify-artifact.ts";
import type { PublicTreeManifest } from "../public-snapshot/generate.ts";
import { createGitHub, type GitHub, GitHubApiError } from "./github.ts";

/** Public repository the sync writes to. */
export const PUBLIC_REPO = "morpho-org/sdks";
/** Head branch of the sync PR. */
export const SYNC_BRANCH = "sync/main";
/** Scratch branch the commits are built on, so the PR never shows a partial tree. */
export const BUILD_BRANCH = "sync/build";
/**
 * Upper bound on the base64 contents of one `createCommitOnBranch` call. GitHub caps a
 * request body at 45 MB (decoded blobs ~33 MB); the margin leaves room for paths and JSON.
 */
export const MAX_BATCH_BYTES = 25 * 1024 * 1024;

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Squash commit (and PR title) of a release. */
export interface ReleaseMessage {
  readonly headline: string;
  readonly body: string;
}

/**
 * Builds the squash commit message of a release:
 * `Release <pkg@ver, ...>` then `Source-Commit:` and `Public-Tree:` trailers.
 *
 * @param release.packages - Released packages, in display order.
 * @param release.sourceCommit - Internal release commit.
 * @param release.treeHash - Git tree hash of the public tree.
 * @returns The headline and body.
 * @throws If no package is released or a hash is not a full SHA-1.
 */
export function buildReleaseMessage(release: {
  readonly packages: readonly TarballIdentity[];
  readonly sourceCommit: string;
  readonly treeHash: string;
}): ReleaseMessage {
  const { packages, sourceCommit, treeHash } = release;
  if (packages.length === 0) {
    throw new Error("A release message needs at least one package.");
  }
  for (const hash of [sourceCommit, treeHash]) {
    if (!SHA_PATTERN.test(hash)) {
      throw new Error(`Expected a full SHA-1, got "${hash}".`);
    }
  }
  return {
    headline: `Release ${packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`,
    body: `Source-Commit: ${sourceCommit}\nPublic-Tree: ${treeHash}`,
  };
}

/**
 * Reads the `Source-Commit` trailer of a public commit message.
 *
 * @param message - Full commit message.
 * @returns The internal commit, or `undefined` when the message has none.
 * @throws If the message carries several different `Source-Commit` lines.
 */
export function parseSourceCommit(message: string): string | undefined {
  const found = new Set(
    [...message.matchAll(/^Source-Commit: ([0-9a-f]{40})$/gm)].map(
      (match) => match[1],
    ),
  );
  if (found.size > 1) {
    throw new Error(
      `Commit message has ${found.size} different Source-Commit trailers. Fix public main by hand before syncing.`,
    );
  }
  return [...found][0];
}

/**
 * Diffs the public tree against the current public `main` tree by git blob hash.
 *
 * @param files - Paths of the public tree, with their contents.
 * @param remote - Blob hash of every file on public `main`, by path.
 * @returns Files to add or overwrite (base64) and paths to delete.
 */
export function planFileChanges(
  files: readonly { readonly path: string; readonly content: Buffer }[],
  remote: ReadonlyMap<string, string>,
): VersionFileChanges {
  const local = new Set<string>();
  const additions: VersionFileAddition[] = [];
  for (const { path, content } of files) {
    local.add(path);
    const blob = createHash("sha1")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex");
    if (remote.get(path) !== blob) {
      additions.push({ path, contents: content.toString("base64") });
    }
  }
  const deletions = [...remote.keys()]
    .filter((path) => !local.has(path))
    .sort()
    .map((path) => ({ path }));
  return { additions, deletions };
}

/**
 * Splits changes into `createCommitOnBranch` payloads of at most `maxBytes` of contents.
 * Deletions ride in the first batch. Always returns at least one batch.
 *
 * @param changes - Output of {@link planFileChanges}.
 * @param maxBytes - Content budget per batch.
 * @returns Batches, in commit order.
 * @throws If a single file is larger than `maxBytes`.
 */
export function batchFileChanges(
  changes: VersionFileChanges,
  maxBytes: number = MAX_BATCH_BYTES,
): VersionFileChanges[] {
  const batches: { additions: VersionFileAddition[]; size: number }[] = [
    { additions: [], size: 0 },
  ];
  for (const addition of changes.additions) {
    const size = addition.contents.length + addition.path.length;
    if (size > maxBytes) {
      throw new Error(
        `"${addition.path}" is ${size} bytes encoded, over the ${maxBytes}-byte batch limit. Keep it out of the public tree.`,
      );
    }
    let last = batches[batches.length - 1];
    if (last === undefined || last.size + size > maxBytes) {
      last = { additions: [], size: 0 };
      batches.push(last);
    }
    last.additions.push(addition);
    last.size += size;
  }
  return batches.map((batch, index) => ({
    additions: batch.additions,
    deletions: index === 0 ? changes.deletions : [],
  }));
}

/** Result of {@link syncPublic}. */
export type SyncOutcome =
  /** Public `main` already has this tree. */
  | { readonly type: "up-to-date" }
  /** The open sync PR already carries this tree on the current `main`. */
  | { readonly type: "pr-current"; readonly pr: number }
  /** The open sync PR carried this tree with its checks already passed, so it was merged. */
  | { readonly type: "merged"; readonly pr: number }
  /** The sync PR was opened, or updated to this release. */
  | { readonly type: "opened" | "updated"; readonly pr: number };

/** Inputs of {@link syncPublic}. */
export interface SyncOptions {
  readonly github: GitHub;
  readonly manifest: PublicTreeManifest;
  /** Reads a file of the public tree by its public path. */
  readonly readFile: (path: string) => Buffer;
  readonly packages: readonly TarballIdentity[];
  /** Whether `ancestor` is an ancestor of (or equal to) `descendant` in internal history. */
  readonly isAncestor: (ancestor: string, descendant: string) => boolean;
  readonly log?: (message: string) => void;
  readonly maxBatchBytes?: number;
}

interface GitCommit {
  readonly sha: string;
  readonly message: string;
  readonly tree: { readonly sha: string };
  readonly parents: readonly { readonly sha: string }[];
  readonly verification: {
    readonly verified: boolean;
    readonly reason: string;
  };
}

interface PullRequest {
  readonly number: number;
  readonly node_id: string;
  readonly head: { readonly sha: string };
  readonly auto_merge: {
    readonly merge_method: string;
    readonly commit_title: string | null;
    readonly commit_message: string | null;
  } | null;
}

const repoPath = `repos/${PUBLIC_REPO}`;

async function readRef(github: GitHub, branch: string) {
  try {
    const ref = (await github.rest(`${repoPath}/git/ref/heads/${branch}`)) as {
      object: { sha: string };
    };
    return ref.object.sha;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

async function readCommit(github: GitHub, sha: string) {
  return (await github.rest(`${repoPath}/git/commits/${sha}`)) as GitCommit;
}

/**
 * Brings the public sync PR to the release in `manifest`.
 *
 * Refuses a release that isn't a descendant of the one public `main` (or an open sync PR)
 * came from, so an older release can never overwrite a newer one; an empty `main` with no
 * `Source-Commit` is accepted only as the root commit. Does nothing when `main` or the open
 * sync PR already carries the tree. Otherwise rebuilds `sync/main` on top of `main` with
 * GitHub-signed `createCommitOnBranch` commits, checks every one is verified and that the
 * final tree hash matches, opens or retitles the single sync PR, and enables squash
 * auto-merge with the release message. When the open sync PR already carries the tree and
 * its checks are green (`mergeStateStatus` `CLEAN`), auto-merge can't be armed, so it is
 * merged directly (`mergePullRequest`, squash, same message).
 *
 * @param options - See {@link SyncOptions}.
 * @returns What changed.
 * @throws On an ordering violation, a moved `main`, an unverified commit, a tree mismatch,
 *   several open sync PRs, or any API failure.
 */
export async function syncPublic(options: SyncOptions): Promise<SyncOutcome> {
  const { github, manifest, isAncestor } = options;
  const log = options.log ?? (() => {});
  const message = buildReleaseMessage({
    packages: options.packages,
    sourceCommit: manifest.sourceCommit,
    treeHash: manifest.treeHash,
  });
  // Everything that can fail without writing runs before the first write.
  for (const file of manifest.files) {
    // createCommitOnBranch writes every file as 100644.
    if (file.mode !== "100644") {
      throw new Error(
        `"${file.path}" has mode ${file.mode}; the sync can only write regular non-executable files.`,
      );
    }
  }

  const mainSha = await readRef(github, "main");
  if (mainSha === undefined) {
    throw new Error(
      `${PUBLIC_REPO} has no main branch. Push an initial commit to it before the first sync.`,
    );
  }
  const main = await readCommit(github, mainSha);
  const mainSource = parseSourceCommit(main.message);
  if (mainSource === undefined) {
    if (main.parents.length > 0) {
      throw new Error(
        `Public main ${mainSha} has no Source-Commit trailer but isn't the root commit. Only the root commit may skip the ordering check.`,
      );
    }
    log(`Public main ${mainSha} is the root commit: first sync.`);
  } else if (!isAncestor(mainSource, manifest.sourceCommit)) {
    throw new Error(
      `Release ${manifest.sourceCommit} doesn't descend from ${mainSource}, the source of public main. Only a newer release can be synced.`,
    );
  }
  if (
    mainSource === manifest.sourceCommit &&
    main.tree.sha !== manifest.treeHash
  ) {
    throw new Error(
      `Public main already carries release ${mainSource} with tree ${main.tree.sha}, not ${manifest.treeHash}. A release can't be synced twice with different trees.`,
    );
  }
  if (main.tree.sha === manifest.treeHash) {
    log(`Public main already has tree ${manifest.treeHash}.`);
    return { type: "up-to-date" };
  }

  const tree = (await github.rest(
    `${repoPath}/git/trees/${main.tree.sha}?recursive=1`,
  )) as {
    truncated: boolean;
    tree: { path: string; type: string; sha: string; mode: string }[];
  };
  if (tree.truncated) {
    throw new Error(
      `Public main tree ${main.tree.sha} is too large to list in one call.`,
    );
  }
  const remote = new Map<string, string>();
  for (const entry of tree.tree) {
    if (entry.type === "blob") remote.set(entry.path, entry.sha);
  }
  const batches = batchFileChanges(
    planFileChanges(
      manifest.files.map((file) => ({
        path: file.path,
        content: options.readFile(file.path),
      })),
      remote,
    ),
    options.maxBatchBytes,
  );

  const open = (await github.rest(
    `${repoPath}/pulls?state=open&base=main&head=${PUBLIC_REPO.split("/")[0]}:${SYNC_BRANCH}`,
  )) as PullRequest[];
  if (open.length > 1) {
    throw new Error(
      `${open.length} sync PRs are open on ${PUBLIC_REPO}. Close all but one.`,
    );
  }
  const pr = open[0];
  if (pr !== undefined) {
    const head = await readCommit(github, pr.head.sha);
    const prSource = parseSourceCommit(head.message);
    if (prSource === undefined) {
      throw new Error(
        `Open sync PR #${pr.number} has no Source-Commit trailer on its head, so the release order can't be checked. Close it by hand before syncing.`,
      );
    }
    if (!isAncestor(prSource, manifest.sourceCommit)) {
      throw new Error(
        `Release ${manifest.sourceCommit} doesn't descend from ${prSource}, the release of open sync PR #${pr.number}. Only a newer release can supersede it.`,
      );
    }
    // A multi-batch head sits several commits above main.
    const onMain =
      head.tree.sha === manifest.treeHash &&
      (
        (await github.rest(
          `${repoPath}/compare/${mainSha}...${pr.head.sha}`,
        )) as { readonly behind_by: number }
      ).behind_by === 0;
    if (onMain) {
      const merge = pr.auto_merge;
      if (
        merge?.merge_method !== "squash" ||
        merge.commit_title !== message.headline ||
        merge.commit_message !== message.body
      ) {
        const input = {
          pullRequestId: pr.node_id,
          mergeMethod: "SQUASH",
          commitHeadline: message.headline,
          commitBody: message.body,
          expectedHeadOid: pr.head.sha,
        };
        const state = (await github.graphql(MERGE_STATE, {
          id: pr.node_id,
        })) as {
          node: { mergeStateStatus: string };
        };
        // GitHub refuses auto-merge on a PR whose checks already passed.
        if (state.node.mergeStateStatus === "CLEAN") {
          await github.graphql(MERGE_PULL_REQUEST, { input });
          log(`Sync PR #${pr.number} was already green: merged it.`);
          return { type: "merged", pr: pr.number };
        }
        await github.graphql(ENABLE_AUTO_MERGE, { input });
      }
      log(`Sync PR #${pr.number} already carries tree ${manifest.treeHash}.`);
      return { type: "pr-current", pr: pr.number };
    }
    // An armed auto-merge would merge a half-pushed head.
    if (pr.auto_merge !== null) {
      await github.graphql(DISABLE_AUTO_MERGE, {
        input: { pullRequestId: pr.node_id },
      });
    }
  }

  if ((await readRef(github, BUILD_BRANCH)) === undefined) {
    await github.rest(`${repoPath}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${BUILD_BRANCH}`, sha: mainSha },
    });
  } else {
    await github.rest(`${repoPath}/git/refs/heads/${BUILD_BRANCH}`, {
      method: "PATCH",
      body: { sha: mainSha, force: true },
    });
  }
  let headSha = mainSha;
  for (const [index, batch] of batches.entries()) {
    const part =
      batches.length === 1 ? "" : ` (part ${index + 1}/${batches.length})`;
    const result = (await github.graphql(CREATE_COMMIT, {
      input: {
        branch: {
          repositoryNameWithOwner: PUBLIC_REPO,
          branchName: BUILD_BRANCH,
        },
        expectedHeadOid: headSha,
        message: { headline: `${message.headline}${part}`, body: message.body },
        fileChanges: batch,
      },
    })) as { createCommitOnBranch: { commit: { oid: string } } };
    headSha = result.createCommitOnBranch.commit.oid;
    const commit = await readCommit(github, headSha);
    if (!commit.verification.verified) {
      throw new Error(
        `Commit ${headSha} on ${BUILD_BRANCH} isn't verified (${commit.verification.reason}). Check the App's commit signing.`,
      );
    }
    if (index === batches.length - 1 && commit.tree.sha !== manifest.treeHash) {
      throw new Error(
        `Commit ${headSha} has tree ${commit.tree.sha}, expected ${manifest.treeHash}. Nothing was published; check the public tree's file modes and paths.`,
      );
    }
  }
  log(`Built ${batches.length} verified commit(s) ending at ${headSha}.`);

  if ((await readRef(github, "main")) !== mainSha) {
    throw new Error("Public main moved during the sync. Rerun the job.");
  }
  if ((await readRef(github, SYNC_BRANCH)) === undefined) {
    await github.rest(`${repoPath}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${SYNC_BRANCH}`, sha: headSha },
    });
  } else {
    await github.rest(`${repoPath}/git/refs/heads/${SYNC_BRANCH}`, {
      method: "PATCH",
      body: { sha: headSha, force: true },
    });
  }
  await github.rest(`${repoPath}/git/refs/heads/${BUILD_BRANCH}`, {
    method: "DELETE",
  });

  const prBody = [
    "Release snapshot of the internal repository. Merging it publishes every package below that isn't on npm yet.",
    "",
    ...options.packages.map((pkg) => `- \`${pkg.name}@${pkg.version}\``),
    "",
    message.body.replace("\n", "  \n"),
    "",
    "Opened by the public sync App, which merges it once CI passes. A newer release replaces it.",
  ].join("\n");
  let number: number;
  let nodeId: string;
  if (pr === undefined) {
    const created = (await github.rest(`${repoPath}/pulls`, {
      method: "POST",
      body: {
        title: message.headline,
        head: SYNC_BRANCH,
        base: "main",
        body: prBody,
      },
    })) as PullRequest;
    number = created.number;
    nodeId = created.node_id;
  } else {
    await github.rest(`${repoPath}/pulls/${pr.number}`, {
      method: "PATCH",
      body: { title: message.headline, body: prBody },
    });
    number = pr.number;
    nodeId = pr.node_id;
  }
  await github.graphql(ENABLE_AUTO_MERGE, {
    input: {
      pullRequestId: nodeId,
      mergeMethod: "SQUASH",
      commitHeadline: message.headline,
      commitBody: message.body,
      expectedHeadOid: headSha,
    },
  });
  log(`Sync PR #${number} carries ${manifest.sourceCommit}, auto-merge on.`);
  return { type: pr === undefined ? "opened" : "updated", pr: number };
}

const CREATE_COMMIT = `mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;
const ENABLE_AUTO_MERGE = `mutation($input: EnablePullRequestAutoMergeInput!) {
  enablePullRequestAutoMerge(input: $input) { clientMutationId }
}`;
const MERGE_STATE = `query($id: ID!) {
  node(id: $id) { ... on PullRequest { mergeStateStatus } }
}`;
const MERGE_PULL_REQUEST = `mutation($input: MergePullRequestInput!) {
  mergePullRequest(input: $input) { clientMutationId }
}`;
const DISABLE_AUTO_MERGE = `mutation($input: DisablePullRequestAutoMergeInput!) {
  disablePullRequestAutoMerge(input: $input) { clientMutationId }
}`;

/**
 * Asks git whether `ancestor` is an ancestor of (or equal to) `descendant`, with hooks off.
 *
 * @param commits.ancestor - Commit expected to be older.
 * @param commits.descendant - Commit expected to be newer.
 * @param commits.repo - Repository to ask (full history), `.` by default.
 * @returns Whether `ancestor` is reachable from `descendant`.
 * @throws When git fails for another reason, such as an unknown commit.
 */
export function gitIsAncestor(commits: {
  readonly ancestor: string;
  readonly descendant: string;
  readonly repo?: string;
}): boolean {
  const { ancestor, descendant, repo = "." } = commits;
  try {
    execFileSync(
      "git",
      [
        "-C",
        repo,
        "-c",
        "core.hooksPath=/dev/null",
        "merge-base",
        "--is-ancestor",
        ancestor,
        descendant,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    return true;
  } catch (error) {
    // Exit 1 means "not an ancestor"; anything else (e.g. unknown commit) is fatal.
    if ((error as { status?: number }).status === 1) return false;
    throw new Error(
      `git merge-base --is-ancestor ${ancestor} ${descendant} failed. Is the checkout full-history?`,
      { cause: error },
    );
  }
}

async function run() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      sha: { type: "string" },
      base: { type: "string" },
    },
  });
  if (!values.dir || !values.sha) {
    throw new Error(
      "Usage: sync.ts --dir <artifact> --sha <RELEASE_SHA> [--base <push before SHA>]",
    );
  }
  const { dir, sha } = values;
  const token = readRequiredEnv(process.env, "GH_TOKEN");
  // Trusted code re-derives the tree from git before anything is written.
  const manifest = verifyArtifact(dir, { repo: ".", sha });
  // Same range as detect-release.ts, so both see the same released packages.
  const packages = listReleasedPackages({ repo: ".", sha, base: values.base });
  if (packages.length === 0) {
    throw new Error(`${sha} changes no public package version: not a release.`);
  }
  const outcome = await syncPublic({
    github: createGitHub({ token }),
    manifest,
    packages,
    readFile: (path) => readFileSync(join(dir, "tree", path)),
    isAncestor: (ancestor, descendant) =>
      gitIsAncestor({ ancestor, descendant }),
    log: (line) => console.log(line),
  });
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(
      output,
      `outcome=${outcome.type}\npr=${"pr" in outcome ? outcome.pr : ""}\n`,
    );
  }
}

if (isMain(import.meta.url)) {
  run().catch(reportCliError);
}
