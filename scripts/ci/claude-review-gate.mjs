#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getErrorMessage } from "../release/helpers.mjs";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const USER_AGENT = "morpho-sdks-claude-review-gate";
export const REVIEW_AUTHOR = "github-actions[bot]";
export const REVIEW_MARKER = "CLAUDE_REVIEW_COMPLETE";

/**
 * Lists every formal review on a pull request, following GitHub's `Link` pagination.
 *
 * @param {{ apiBaseUrl?: string, fetchImpl?: typeof fetch, prNumber: string, repository: string, token: string }} options Request options.
 * @returns {Promise<Array<{ body: string | null, commit_id: string, id: number, user: { login: string } | null }>>} The reviews, oldest first.
 */
export async function listReviews(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const reviews = [];
  let url = new URL(
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

    reviews.push(...page);
    url = parseNextLink(response.headers.get("link"));
  }

  return reviews;
}

/**
 * Parses the `rel="next"` target of a GitHub `Link` response header.
 *
 * @param {string | null} linkHeader The raw `Link` header.
 * @returns {URL | null} The next page URL, or null on the last page.
 */
export function parseNextLink(linkHeader) {
  if (linkHeader == null) return null;

  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (match != null) return new URL(match[1]);
  }

  return null;
}

/**
 * Keeps only the reviews posted by the review workflow itself: authored by the job token and
 * carrying the completion marker. Reviews by other users, or bot reviews without the marker
 * (e.g. the "Claude Code is working…" placeholders), never count.
 *
 * @param {Array<{ body: string | null, commit_id: string, id: number, user: { login: string } | null }>} reviews The reviews to filter.
 * @returns {Array<{ body: string | null, commit_id: string, id: number, user: { login: string } | null }>} The matching reviews.
 */
export function selectClaudeReviews(reviews) {
  return reviews.filter(
    (review) =>
      review.user?.login === REVIEW_AUTHOR &&
      typeof review.body === "string" &&
      review.body.includes(REVIEW_MARKER),
  );
}

/**
 * Returns the highest id among the workflow's reviews, or 0 when there is none.
 *
 * @param {Array<{ body: string | null, commit_id: string, id: number, user: { login: string } | null }>} reviews The reviews to scan.
 * @returns {number} The max review id.
 */
export function getMaxReviewId(reviews) {
  return selectClaudeReviews(reviews).reduce(
    (max, review) => Math.max(max, review.id),
    0,
  );
}

/**
 * Counts the workflow's reviews created after the snapshot and attached to the expected head.
 *
 * @param {Array<{ body: string | null, commit_id: string, id: number, user: { login: string } | null }>} reviews The reviews to scan.
 * @param {{ headSha: string, maxIdBefore: number }} options The gate inputs.
 * @returns {number} The number of qualifying reviews.
 */
export function countNewReviews(reviews, options) {
  return selectClaudeReviews(reviews).filter(
    (review) =>
      review.id > options.maxIdBefore && review.commit_id === options.headSha,
  ).length;
}

/**
 * Parses the `MAX_ID_BEFORE` step output: empty means "no snapshot" (0); anything else must be a
 * non-negative integer so a corrupted output cannot silently disable the gate.
 *
 * @param {string | undefined} value The raw environment value.
 * @returns {number} The parsed id.
 */
export function parseMaxIdBefore(value) {
  if (value == null || value === "") return 0;
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid MAX_ID_BEFORE "${value}". Expected a non-negative integer.`,
    );
  }

  return Number(value);
}

/**
 * `snapshot` mode: records the highest pre-existing workflow review id as the `max_id` step output.
 *
 * @param {{ apiBaseUrl?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, outputFile?: string, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {Promise<number>} The recorded max id.
 */
export async function snapshot(options = {}) {
  const env = options.env ?? process.env;
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));
  const reviews = await listReviews({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber: readRequiredEnv(env, "PR_NUMBER"),
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  });
  const maxId = getMaxReviewId(reviews);

  appendOutput(options.outputFile ?? env.GITHUB_OUTPUT, `max_id=${maxId}\n`);
  writeOutput(`Highest pre-existing Claude review id: ${maxId}.\n`);

  return maxId;
}

/**
 * `verify` mode: fails unless a workflow review newer than the snapshot exists on the current head.
 *
 * @param {{ apiBaseUrl?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {Promise<number>} The number of qualifying reviews (always > 0).
 */
export async function verify(options = {}) {
  const env = options.env ?? process.env;
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));
  const prNumber = readRequiredEnv(env, "PR_NUMBER");
  const headSha = readRequiredEnv(env, "HEAD_SHA");
  const maxIdBefore = parseMaxIdBefore(env.MAX_ID_BEFORE);
  const reviews = await listReviews({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber,
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  });
  const count = countNewReviews(reviews, { headSha, maxIdBefore });

  if (count === 0) {
    throw new Error(
      `Claude finished without posting a formal review on ${headSha} (PR #${prNumber}) in this run. See the claude-execution-output artifact.`,
    );
  }

  writeOutput(`Found ${count} new Claude review(s) on ${headSha}.\n`);

  return count;
}

/**
 * CLI entrypoint: `node scripts/ci/claude-review-gate.mjs <snapshot|verify>`.
 *
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, writeError?: (message: string) => void, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {Promise<number>} The mode's result.
 */
export async function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const mode = argv[0];

  switch (mode) {
    case "snapshot":
      return snapshot(options);
    case "verify":
      return verify(options);
    default:
      throw new Error(
        `Unknown mode "${mode ?? ""}". Usage: claude-review-gate.mjs <snapshot|verify>`,
      );
  }
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

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`::error::${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
