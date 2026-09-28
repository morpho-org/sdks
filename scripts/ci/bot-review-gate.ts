#!/usr/bin/env node
/**
 * Publishes the `bot-review-gate` commit status for the current pull-request head.
 * Run with Node's native TypeScript support: `node scripts/ci/bot-review-gate.ts`.
 */

import { type FetchLike, parseNextLink } from "./claude-review-gate.ts";
import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

const DEFAULT_API_BASE_URL = "https://api.github.com/";
const USER_AGENT = "morpho-sdks-bot-review-gate";
const DECISIVE_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/** Commit-status context this script publishes for each pull-request head. */
export const STATUS_CONTEXT = "bot-review-gate";

/** Number of distinct human approvals required for a bot-authored pull request. */
export const REQUIRED_HUMAN_APPROVALS = 2;

/** Known agent accounts whose GitHub API `type` may be `User` rather than `Bot`. */
export const AGENT_LOGINS: ReadonlySet<string> = new Set([
  "devin-ai-integration",
  "claude-code",
  "hermes-agent",
]);

interface Review {
  readonly body: string | null;
  readonly commit_id: string | null;
  readonly id: number;
  readonly state: string;
  readonly user: { readonly login: string; readonly type?: string } | null;
}

interface Author {
  readonly login: string;
  readonly type?: string;
}

type GateFetchLike = (
  url: URL,
  init: Parameters<FetchLike>[1] & { body?: string },
) => ReturnType<FetchLike>;

interface GateResult {
  readonly description: string;
  readonly state: "success" | "failure";
}

/** Returns whether a GitHub account is a bot or a known agent account. */
export function isBot(user: { login: string; type?: string }): boolean {
  return (
    user.type === "Bot" ||
    user.login.endsWith("[bot]") ||
    AGENT_LOGINS.has(user.login)
  );
}

/** Selects sorted, distinct human approvers whose latest decisive review approves this head. */
export function countedApprovers(
  reviews: readonly Review[],
  options: { readonly author: string; readonly headSha: string },
): string[] {
  const latestDecisive = new Map<
    string,
    { readonly review: Review; readonly user: NonNullable<Review["user"]> }
  >();

  for (const review of reviews) {
    if (!DECISIVE_STATES.has(review.state) || review.user == null) continue;
    latestDecisive.set(review.user.login, { review, user: review.user });
  }

  return [...latestDecisive.values()]
    .filter(
      ({ review, user }) =>
        review.state === "APPROVED" &&
        review.commit_id === options.headSha &&
        user.login !== options.author &&
        !isBot(user),
    )
    .map(({ user }) => user.login)
    .sort();
}

/** Evaluates whether the pull request's author and current-head approvals satisfy the gate. */
export function evaluate(options: {
  readonly author: Author;
  readonly reviews: readonly Review[];
  readonly headSha: string;
}): GateResult {
  if (!isBot(options.author)) {
    return {
      description: truncate("Human-authored PR: native review rules apply."),
      state: "success",
    };
  }

  const approvers = countedApprovers(options.reviews, {
    author: options.author.login,
    headSha: options.headSha,
  });
  const description =
    approvers.length >= REQUIRED_HUMAN_APPROVALS
      ? `Bot-authored PR approved by ${approvers.length} humans: ${approvers.join(", ")}`
      : `Bot-authored PR needs ${REQUIRED_HUMAN_APPROVALS} human approvals on the head commit, has ${approvers.length}${
          approvers.length > 0 ? `: ${approvers.join(", ")}` : ""
        }`;

  return {
    description: truncate(description),
    state: approvers.length >= REQUIRED_HUMAN_APPROVALS ? "success" : "failure",
  };
}

/**
 * Fetches the pull request and its reviews, then publishes the verdict as a commit status.
 * API and payload failures attempt to publish an `error` status for the fetched head before
 * rethrowing; a normal `failure` verdict is represented only by the commit status.
 */
export async function main(
  options: {
    readonly apiBaseUrl?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: GateFetchLike;
    readonly writeOutput?: (message: string) => void;
  } = {},
): Promise<GateResult> {
  const env = options.env ?? process.env;
  const token = readRequiredEnv(env, "GH_TOKEN");
  const repository = readRequiredEnv(env, "GITHUB_REPOSITORY");
  const prNumber = readRequiredEnv(env, "PR_NUMBER");
  const serverUrl = readRequiredEnv(env, "GITHUB_SERVER_URL").replace(
    /\/+$/,
    "",
  );
  const runId = readRequiredEnv(env, "GITHUB_RUN_ID");
  if (!/^\d+$/.test(prNumber)) {
    throw new Error(
      `Invalid PR_NUMBER "${prNumber}". Expected a positive integer.`,
    );
  }

  const fetchImpl: GateFetchLike = options.fetchImpl ?? fetch;
  const writeOutput = options.writeOutput ?? writeStdout;
  const apiBaseUrl = options.apiBaseUrl ?? getApiBaseUrl(serverUrl);
  const apiBase = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const targetUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  let headSha: string | undefined;

  try {
    const pullUrl = new URL(`repos/${repository}/pulls/${prNumber}`, apiBase);
    const pullResponse = await fetchImpl(pullUrl, requestInit(token, "GET"));
    await assertOk(pullResponse, pullUrl);
    const pullRequest = await pullResponse.json();

    if (isObject(pullRequest)) {
      const head = pullRequest.head;
      if (isObject(head) && typeof head.sha === "string" && head.sha !== "") {
        headSha = head.sha;
      }
    }
    if (!isPullRequest(pullRequest)) {
      throw new Error(
        `GitHub API GET ${pullUrl.pathname} returned a malformed pull request.`,
      );
    }

    const reviewUrl = new URL(
      `repos/${repository}/pulls/${prNumber}/reviews?per_page=100`,
      apiBase,
    );
    const reviews = await listReviews({
      fetchImpl,
      firstUrl: reviewUrl,
      token,
    });
    const result = evaluate({
      author: pullRequest.user,
      headSha: pullRequest.head.sha,
      reviews,
    });
    await postStatus({
      url: new URL(
        `repos/${repository}/statuses/${pullRequest.head.sha}`,
        apiBase,
      ),
      token,
      fetchImpl,
      status: {
        description: result.description,
        state: result.state,
        target_url: targetUrl,
      },
    });
    writeOutput(
      `Published ${STATUS_CONTEXT}=${result.state} for ${repository}#${prNumber} at ${pullRequest.head.sha}.\n`,
    );

    return result;
  } catch (error) {
    if (headSha != null) {
      try {
        await postStatus({
          url: new URL(`repos/${repository}/statuses/${headSha}`, apiBase),
          token,
          fetchImpl,
          status: {
            description: truncate(
              `Bot review gate could not evaluate: ${shortReason(error)}`,
            ),
            state: "error",
            target_url: targetUrl,
          },
        });
      } catch {
        // The original evaluation error is more useful than a failed fallback status request.
      }
    }
    throw error;
  }
}

async function listReviews(options: {
  readonly fetchImpl: GateFetchLike;
  readonly firstUrl: URL;
  readonly token: string;
}): Promise<Review[]> {
  const reviews: Review[] = [];
  let url: URL | null = options.firstUrl;

  while (url != null) {
    const response = await options.fetchImpl(
      url,
      requestInit(options.token, "GET"),
    );
    await assertOk(response, url);
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(
        `GitHub API GET ${url.pathname} returned a non-array reviews payload.`,
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

async function postStatus(options: {
  readonly fetchImpl: GateFetchLike;
  readonly status: {
    readonly description: string;
    readonly state: "error" | "failure" | "success";
    readonly target_url: string;
  };
  readonly token: string;
  readonly url: URL;
}): Promise<void> {
  const response = await options.fetchImpl(options.url, {
    ...requestInit(options.token, "POST"),
    body: JSON.stringify({
      ...options.status,
      context: STATUS_CONTEXT,
    }),
  });
  await assertOk(response, options.url);
}

function requestInit(
  token: string,
  method: string,
): Parameters<GateFetchLike>[1] {
  return {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method,
  };
}

async function assertOk(
  response: Awaited<ReturnType<GateFetchLike>>,
  url: URL,
): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `GitHub API ${url.pathname} failed with ${response.status}.`,
    );
  }
}

function isReview(value: unknown): value is Review {
  if (!isObject(value)) return false;
  const { body, commit_id, id, state, user } = value;
  const userOk =
    user === null ||
    (isObject(user) &&
      typeof user.login === "string" &&
      typeof user.type === "string");

  return (
    (body === null || typeof body === "string") &&
    (commit_id === null || typeof commit_id === "string") &&
    typeof id === "number" &&
    Number.isInteger(id) &&
    typeof state === "string" &&
    userOk
  );
}

function isPullRequest(
  value: unknown,
): value is { head: { sha: string }; user: Author } {
  if (!isObject(value) || !isObject(value.user) || !isObject(value.head)) {
    return false;
  }

  return (
    typeof value.user.login === "string" &&
    value.user.login !== "" &&
    typeof value.user.type === "string" &&
    typeof value.head.sha === "string" &&
    value.head.sha !== ""
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiBaseUrl(serverUrl: string): string {
  const parsedServerUrl = new URL(serverUrl);
  return parsedServerUrl.hostname === "github.com"
    ? DEFAULT_API_BASE_URL
    : `${parsedServerUrl.origin}/api/v3/`;
}

function shortReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(description: string): string {
  return description.slice(0, 140);
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
