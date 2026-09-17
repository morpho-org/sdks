#!/usr/bin/env node
/**
 * claude-verdict-check.ts — publishes a *cosmetic* check-run reflecting Claude's review verdict on a
 * pull request, so a reviewer sees Claude's stance (approve / changes requested) at a glance. Run with
 * Node's native TypeScript support:
 *
 *   node scripts/ci/claude-verdict-check.ts publish   # after the review gate passes
 *
 * The check-run is informational only: `github-actions[bot]` cannot formally approve a PR (the reviews
 * API rejects `event: APPROVE` with HTTP 422), so this never gates merge — a human still approves. The
 * verdict is read from the review this run already posted (its `<!-- CLAUDE_VERDICT:APPROVE -->` body
 * marker), reusing the same selection logic as the review gate so the two can never disagree.
 *
 * Reads `GH_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`, `HEAD_SHA`, `GITHUB_RUN_ID` and `MAX_ID_BEFORE`.
 * Every missing variable and every GitHub API failure is an error, never a silent success.
 */

import {
  DEFAULT_API_BASE_URL,
  type FetchLike,
  listReviews,
  parseMaxIdBefore,
  type Review,
  selectNewReviews,
  USER_AGENT,
} from "./claude-review-gate.ts";
import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

/** Name of the check-run this step publishes; stable so reruns update the same PR check. */
export const CHECK_NAME = "Claude Review Verdict";
/** Body marker the review engine embeds only when Claude's verdict is to approve. */
export const APPROVE_VERDICT_MARKER = "CLAUDE_VERDICT:APPROVE";

/** Claude's stance on the pull request, derived from the review it posted. */
export type Verdict = "approve" | "changes";

/** Injectable argv/env/fetch/output boundaries of the CLI mode. */
export interface RunOptions {
  readonly apiBaseUrl?: string;
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: FetchLike;
  readonly writeOutput?: (message: string) => void;
}

/** Check-run fields a {@link Verdict} maps to. */
export interface VerdictCheck {
  /** `success` renders a green check; `neutral` a grey one. Neither blocks merge on its own. */
  readonly conclusion: "neutral" | "success";
  readonly summary: string;
  readonly title: string;
}

/**
 * Reads Claude's verdict from a posted review: the approve marker means approve, its absence means the
 * review requested changes (or a review agent failed — the engine never approves in that case).
 */
export function determineVerdict(review: Review): Verdict {
  return review.body?.includes(APPROVE_VERDICT_MARKER) === true
    ? "approve"
    : "changes";
}

/** Returns the highest-id review, or `null` for an empty list. */
export function latestReview(reviews: readonly Review[]): Review | null {
  return reviews.reduce<Review | null>(
    (latest, review) =>
      latest == null || review.id > latest.id ? review : latest,
    null,
  );
}

/** Maps a verdict to the check-run's conclusion and human-readable summary. */
export function verdictCheck(verdict: Verdict): VerdictCheck {
  if (verdict === "approve") {
    return {
      conclusion: "success",
      summary:
        "Claude's automated review found no blocking issues. This is an informational verdict — a human review and approval are still required before merge.",
      title: "✅ Approved by Claude — human review still required",
    };
  }

  return {
    conclusion: "neutral",
    summary:
      "Claude's automated review requested changes (or a review agent failed). See the inline review comments. This verdict is informational and does not block merge on its own.",
    title: "🔄 Changes requested by Claude",
  };
}

/** Inputs of {@link createCheckRun}. */
export interface CreateCheckRunOptions {
  readonly apiBaseUrl?: string;
  readonly conclusion: "neutral" | "success";
  readonly fetchImpl?: FetchLike;
  readonly headSha: string;
  readonly repository: string;
  readonly summary: string;
  readonly title: string;
  readonly token: string;
}

/** Creates a completed check-run on the head commit, throwing on any non-2xx response. */
export async function createCheckRun(
  options: CreateCheckRunOptions,
): Promise<void> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const url = new URL(
    `repos/${options.repository}/check-runs`,
    options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );

  const response = await fetchImpl(url, {
    body: JSON.stringify({
      conclusion: options.conclusion,
      head_sha: options.headSha,
      name: CHECK_NAME,
      output: { summary: options.summary, title: options.title },
      status: "completed",
    }),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API POST ${url.pathname} failed with ${response.status}.`,
    );
  }
}

/** `publish` mode: reads this run's review, then publishes its verdict as a check-run on the head. */
export async function publish(options: RunOptions = {}): Promise<Verdict> {
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const repository = readRequiredEnv(env, "GITHUB_REPOSITORY");
  const token = readRequiredEnv(env, "GH_TOKEN");
  const headSha = readRequiredEnv(env, "HEAD_SHA");
  const runId = readRequiredEnv(env, "GITHUB_RUN_ID");
  const prNumber = readRequiredEnv(env, "PR_NUMBER");
  const maxIdBefore = parseMaxIdBefore(env.MAX_ID_BEFORE);

  const reviews = await listReviews({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    prNumber,
    repository,
    token,
  });
  const review = latestReview(
    selectNewReviews(reviews, { headSha, maxIdBefore, runId }),
  );
  if (review == null) {
    throw new Error(
      `No review by this run on ${headSha} (PR #${prNumber}) to publish a verdict for.`,
    );
  }

  const verdict = determineVerdict(review);
  const check = verdictCheck(verdict);
  await createCheckRun({
    apiBaseUrl: options.apiBaseUrl,
    conclusion: check.conclusion,
    fetchImpl: options.fetchImpl,
    headSha,
    repository,
    summary: check.summary,
    title: check.title,
    token,
  });
  writeOutput(`Published Claude verdict "${check.title}" on ${headSha}.\n`);

  return verdict;
}

/** CLI entrypoint: `node scripts/ci/claude-verdict-check.ts publish`. */
export async function main(options: RunOptions = {}): Promise<Verdict> {
  const argv = options.argv ?? process.argv.slice(2);
  const mode = argv[0];

  if (mode !== "publish") {
    throw new Error(
      `Unknown mode "${mode ?? ""}". Usage: claude-verdict-check.ts publish`,
    );
  }

  return publish(options);
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
