#!/usr/bin/env node
/**
 * claude-review-gate.ts — the "did Claude actually post its review?" gate of
 * `.github/workflows/claude.yml`. Run with Node's native TypeScript support:
 *
 *   node scripts/ci/claude-review-gate.ts snapshot   # before Claude runs
 *   node scripts/ci/claude-review-gate.ts verify     # after Claude runs
 *   node scripts/ci/claude-review-gate.ts cleanup    # after Claude was cancelled
 *
 * Reads `GH_TOKEN`, `GITHUB_REPOSITORY` and `PR_NUMBER`, plus `GITHUB_OUTPUT` for `snapshot`,
 * `HEAD_SHA`, `MAX_ID_BEFORE` and `GITHUB_RUN_ID` for `verify`, and `GITHUB_RUN_ID` for `cleanup`.
 * Every missing variable and every GitHub API failure is an error, never a silent 0, so the gate
 * can only pass on a real review.
 */

import { appendFileSync } from "node:fs";

import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const USER_AGENT = "morpho-sdks-claude-review-gate";
/** Login of the identity the workflow's job token posts reviews as. */
export const REVIEW_AUTHOR = "github-actions[bot]";
/** Marker the review engine embeds in the body of every completed review. */
export const REVIEW_MARKER = "CLAUDE_REVIEW_COMPLETE";
/** Prefix of the per-run marker (`<!-- CLAUDE_REVIEW_RUN:<GITHUB_RUN_ID> -->`) that binds a review to the job that posted it. */
export const RUN_MARKER_PREFIX = "CLAUDE_REVIEW_RUN:";

/** Builds the body marker the workflow prompt asks Claude to include for a given run. */
export function runMarker(runId: string): string {
  return `<!-- ${RUN_MARKER_PREFIX}${runId} -->`;
}

/** Subset of a GitHub issue comment the cleanup inspects. */
export interface IssueComment {
  readonly body: string | null;
  readonly id: number;
  readonly user: { readonly login: string } | null;
}

/** Subset of a GitHub pull-request review the gate inspects. */
export interface Review {
  readonly body: string | null;
  readonly commit_id: string | null;
  readonly id: number;
  readonly state: string;
  readonly user: { readonly login: string } | null;
}

/** Injectable `fetch` boundary so the GitHub API can be stubbed in tests. */
export type FetchLike = (
  url: URL,
  init: { headers: Record<string, string>; method: string },
) => Promise<{
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

/** Inputs of {@link listReviews}. */
export interface ListReviewsOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly prNumber: string;
  readonly repository: string;
  readonly token: string;
}

/** Injectable argv/env/fetch/output boundaries of the CLI modes. */
export interface RunOptions {
  readonly apiBaseUrl?: string;
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: FetchLike;
  readonly outputFile?: string;
  readonly writeOutput?: (message: string) => void;
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

interface PaginatedResource<T> {
  readonly isItem: (value: unknown) => value is T;
  readonly itemName: string;
  readonly path: string;
}

async function listPaginated<T>(
  options: ListReviewsOptions,
  resource: PaginatedResource<T>,
): Promise<T[]> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const items: T[] = [];
  let url: URL | null = new URL(
    `repos/${options.repository}/${resource.path}?per_page=100`,
    options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );

  while (url != null) {
    const response = await fetchImpl(url, {
      headers: apiHeaders(options.token),
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API GET ${url.pathname} failed with ${response.status}.`,
      );
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(
        `GitHub API GET ${url.pathname} returned a non-array payload.`,
      );
    }

    for (const item of page) {
      if (!resource.isItem(item)) {
        throw new Error(
          `GitHub API GET ${url.pathname} returned a malformed ${resource.itemName} entry.`,
        );
      }
      items.push(item);
    }
    url = parseNextLink(response.headers.get("link"));
  }

  return items;
}

/** Lists every formal review on a pull request, following GitHub's `Link` pagination. */
export async function listReviews(
  options: ListReviewsOptions,
): Promise<Review[]> {
  return listPaginated(options, {
    isItem: isReview,
    itemName: "review",
    path: `pulls/${options.prNumber}/reviews`,
  });
}

/** Lists every issue comment on a pull request, following GitHub's `Link` pagination. */
export async function listIssueComments(
  options: ListReviewsOptions,
): Promise<IssueComment[]> {
  return listPaginated(options, {
    isItem: isIssueComment,
    itemName: "comment",
    path: `issues/${options.prNumber}/comments`,
  });
}

/** Deletes one issue comment. */
export async function deleteIssueComment(
  options: ListReviewsOptions,
  commentId: number,
): Promise<void> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const url = new URL(
    `repos/${options.repository}/issues/comments/${commentId}`,
    options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );
  const response = await fetchImpl(url, {
    headers: apiHeaders(options.token),
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API DELETE ${url.pathname} failed with ${response.status}.`,
    );
  }
}

function isLogin(user: unknown): user is { login: string } | null {
  return (
    user === null ||
    (typeof user === "object" &&
      user != null &&
      typeof (user as { login?: unknown }).login === "string")
  );
}

function isIssueComment(value: unknown): value is IssueComment {
  if (typeof value !== "object" || value == null) return false;
  const { body, id, user } = value as Record<keyof IssueComment, unknown>;

  return (
    (body === null || typeof body === "string") &&
    typeof id === "number" &&
    Number.isInteger(id) &&
    isLogin(user)
  );
}

function isReview(value: unknown): value is Review {
  if (typeof value !== "object" || value == null) return false;
  const { body, commit_id, id, state, user } = value as Record<
    keyof Review,
    unknown
  >;

  return (
    (body === null || typeof body === "string") &&
    (commit_id === null || typeof commit_id === "string") &&
    typeof id === "number" &&
    Number.isInteger(id) &&
    typeof state === "string" &&
    isLogin(user)
  );
}

/** Parses the `rel="next"` target of a GitHub `Link` response header. */
export function parseNextLink(linkHeader: string | null): URL | null {
  if (linkHeader == null) return null;

  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (match?.[1] != null) return new URL(match[1]);
  }

  return null;
}

/**
 * Keeps only the reviews posted by the review workflow itself: authored by the job token,
 * submitted (a `PENDING` draft is invisible to humans, and the API returns the caller's own
 * drafts), and carrying the completion marker. Reviews by other users, or bot reviews without
 * the marker (e.g. the "Claude Code is working…" placeholders), never count.
 */
export function selectClaudeReviews(reviews: readonly Review[]): Review[] {
  return reviews.filter(
    (review) =>
      review.user?.login === REVIEW_AUTHOR &&
      review.state !== "PENDING" &&
      typeof review.body === "string" &&
      review.body.includes(REVIEW_MARKER),
  );
}

/** Returns the highest id among the workflow's reviews, or 0 when there is none. */
export function getMaxReviewId(reviews: readonly Review[]): number {
  return selectClaudeReviews(reviews).reduce(
    (max, review) => Math.max(max, review.id),
    0,
  );
}

/**
 * Counts the workflow's reviews created after the snapshot, attached to the expected head and
 * carrying this run's marker. The run marker is what distinguishes this job's review from one an
 * overlapping `@claude` run (separate concurrency group, same bot identity, same head) posted.
 */
export function countNewReviews(
  reviews: readonly Review[],
  options: {
    readonly headSha: string;
    readonly maxIdBefore: number;
    readonly runId: string;
  },
): number {
  const marker = runMarker(options.runId);

  return selectClaudeReviews(reviews).filter(
    (review) =>
      review.id > options.maxIdBefore &&
      review.commit_id === options.headSha &&
      review.body?.includes(marker) === true,
  ).length;
}

/**
 * Keeps only the tracking comments the Claude action posted from a given run: authored by the job
 * token and ending with the action's `[View job run](…/actions/runs/<run id>)` link. Both the
 * "Claude Code is working…" placeholder and the "PR Review in progress" checklist Claude rewrites it
 * into carry that link, so the run id is what binds a comment to the job that posted it.
 */
export function selectRunTrackingComments(
  comments: readonly IssueComment[],
  runId: string,
): IssueComment[] {
  const runLink = new RegExp(`/actions/runs/${runId}(?:[^0-9]|$)`);

  return comments.filter(
    (comment) =>
      comment.user?.login === REVIEW_AUTHOR &&
      typeof comment.body === "string" &&
      runLink.test(comment.body),
  );
}

/**
 * Parses the `MAX_ID_BEFORE` step output. The snapshot step always writes at least `max_id=0`, so an
 * empty value can only come from broken step-output wiring and is rejected like a corrupted one.
 */
export function parseMaxIdBefore(value: string | undefined): number {
  if (value == null || value === "") {
    throw new Error(
      "Missing MAX_ID_BEFORE: the snapshot step output is not wired to this step.",
    );
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid MAX_ID_BEFORE "${value}". Expected a non-negative integer.`,
    );
  }

  return Number(value);
}

/** `snapshot` mode: records the highest pre-existing workflow review id as the `max_id` step output. */
export async function snapshot(options: RunOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const reviews = await listReviews({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber: readRequiredEnv(env, "PR_NUMBER"),
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  });
  const maxId = getMaxReviewId(reviews);

  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `max_id=${maxId}\n`,
  );
  writeOutput(`Highest pre-existing Claude review id: ${maxId}.\n`);

  return maxId;
}

/** `verify` mode: fails unless a workflow review newer than the snapshot exists on the current head. */
export async function verify(options: RunOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const prNumber = readRequiredEnv(env, "PR_NUMBER");
  const headSha = readRequiredEnv(env, "HEAD_SHA");
  const runId = readRequiredEnv(env, "GITHUB_RUN_ID");
  const maxIdBefore = parseMaxIdBefore(env.MAX_ID_BEFORE);
  const reviews = await listReviews({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber,
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  });
  const count = countNewReviews(reviews, { headSha, maxIdBefore, runId });

  if (count === 0) {
    throw new Error(
      `Claude finished without posting a formal review on ${headSha} (PR #${prNumber}) carrying ${runMarker(runId)} in this run. See the claude-execution-output artifact.`,
    );
  }

  writeOutput(`Found ${count} new Claude review(s) on ${headSha}.\n`);

  return count;
}

/**
 * `cleanup` mode: deletes the tracking comments this run posted. Runs when the job is cancelled
 * (a new push superseded the in-flight review), so a stale "PR Review in progress" comment does
 * not sit next to the superseding run's one.
 */
export async function cleanup(options: RunOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const runId = readRequiredEnv(env, "GITHUB_RUN_ID");
  const listOptions: ListReviewsOptions = {
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber: readRequiredEnv(env, "PR_NUMBER"),
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  };
  const comments = selectRunTrackingComments(
    await listIssueComments(listOptions),
    runId,
  );

  for (const comment of comments) {
    await deleteIssueComment(listOptions, comment.id);
  }
  writeOutput(
    `Deleted ${comments.length} tracking comment(s) of run ${runId}.\n`,
  );

  return comments.length;
}

/** CLI entrypoint: `node scripts/ci/claude-review-gate.ts <snapshot|verify|cleanup>`. */
export async function main(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const mode = argv[0];

  switch (mode) {
    case "snapshot":
      return snapshot(options);
    case "verify":
      return verify(options);
    case "cleanup":
      return cleanup(options);
    default:
      throw new Error(
        `Unknown mode "${mode ?? ""}". Usage: claude-review-gate.ts <snapshot|verify|cleanup>`,
      );
  }
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
