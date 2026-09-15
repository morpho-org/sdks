#!/usr/bin/env node
/**
 * claude-review-gate.ts — the "did Claude actually post its review?" gate of
 * `.github/workflows/claude.yml`. Run with Node's native TypeScript support:
 *
 *   node scripts/ci/claude-review-gate.ts snapshot   # before Claude runs
 *   node scripts/ci/claude-review-gate.ts verify     # after Claude runs
 *
 * Reads `GH_TOKEN`, `GITHUB_REPOSITORY` and `PR_NUMBER`, plus `GITHUB_OUTPUT` for `snapshot` and
 * `HEAD_SHA`, `MAX_ID_BEFORE` and `GITHUB_RUN_ID` for `verify`. Every missing variable and every
 * GitHub API failure is an error, never a silent 0, so the gate can only pass on a real review.
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

/** Lists every formal review on a pull request, following GitHub's `Link` pagination. */
export async function listReviews(
  options: ListReviewsOptions,
): Promise<Review[]> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const reviews: Review[] = [];
  let url: URL | null = new URL(
    `repos/${options.repository}/pulls/${options.prNumber}/reviews?per_page=100`,
    options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );

  while (url != null) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
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
      if (!isReview(item)) {
        throw new Error(
          `GitHub API GET ${url.pathname} returned a malformed review entry.`,
        );
      }
      reviews.push(item);
    }
    url = parseNextLink(response.headers.get("link"));
  }

  return reviews;
}

function isReview(value: unknown): value is Review {
  if (typeof value !== "object" || value == null) return false;
  const { body, commit_id, id, state, user } = value as Record<
    keyof Review,
    unknown
  >;
  const userOk =
    user === null ||
    (typeof user === "object" &&
      user != null &&
      typeof (user as { login?: unknown }).login === "string");

  return (
    (body === null || typeof body === "string") &&
    (commit_id === null || typeof commit_id === "string") &&
    typeof id === "number" &&
    Number.isInteger(id) &&
    typeof state === "string" &&
    userOk
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

/** CLI entrypoint: `node scripts/ci/claude-review-gate.ts <snapshot|verify>`. */
export async function main(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const mode = argv[0];

  switch (mode) {
    case "snapshot":
      return snapshot(options);
    case "verify":
      return verify(options);
    default:
      throw new Error(
        `Unknown mode "${mode ?? ""}". Usage: claude-review-gate.ts <snapshot|verify>`,
      );
  }
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
