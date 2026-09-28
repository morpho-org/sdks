#!/usr/bin/env node
/**
 * Publishes the `bot-review-gate` commit status for the current pull-request head.
 * Run with Node's native TypeScript support: `node scripts/ci/bot-review-gate.ts`.
 */

import {
  type FetchLike,
  type ListReviewsOptions,
  listReviews,
  parseNextLink,
  type Review,
} from "./claude-review-gate.ts";
import {
  describeError,
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

interface SkippedGateResult {
  readonly description: string;
  readonly state: "skipped";
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

/** Evaluates the gate using current-head approvers already filtered by permission. */
export function evaluate(options: {
  readonly author: Author;
  readonly approvers: readonly string[];
}): GateResult {
  if (!isBot(options.author)) {
    return {
      description: truncate("Human-authored PR: native review rules apply."),
      state: "success",
    };
  }

  const description =
    options.approvers.length >= REQUIRED_HUMAN_APPROVALS
      ? `Bot-authored PR approved by ${options.approvers.length} humans: ${options.approvers.join(", ")}`
      : `Bot-authored PR needs ${REQUIRED_HUMAN_APPROVALS} human approvals on the head commit, has ${options.approvers.length}${
          options.approvers.length > 0
            ? `: ${options.approvers.join(", ")}`
            : ""
        }`;

  return {
    description: truncate(description),
    state:
      options.approvers.length >= REQUIRED_HUMAN_APPROVALS
        ? "success"
        : "failure",
  };
}

/**
 * Fetches the triggering pull request, evaluates every open pull request at its head, and
 * publishes one commit status.
 * Only approvers with write access or higher count.
 * Requires `EVENT_HEAD_SHA`, the 40-hex SHA used to serialize this run. If the fetched PR head
 * differs, the run skips without listing other PRs, fetching reviews, or publishing a status.
 * API or payload failures try to publish an `error` status to `EVENT_HEAD_SHA`; the original
 * error is always rethrown. A normal `failure` verdict is represented only by the commit status.
 */
export async function main(
  options: {
    readonly apiBaseUrl?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: GateFetchLike;
    readonly writeOutput?: (message: string) => void;
  } = {},
): Promise<GateResult | SkippedGateResult> {
  const env = options.env ?? process.env;
  const token = readRequiredEnv(env, "GH_TOKEN");
  const repository = readRequiredEnv(env, "GITHUB_REPOSITORY");
  const prNumber = readRequiredEnv(env, "PR_NUMBER");
  const eventHeadSha = env.EVENT_HEAD_SHA;
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

  try {
    if (eventHeadSha == null || eventHeadSha === "") {
      throw new Error("Missing required environment variable EVENT_HEAD_SHA.");
    }
    if (!/^[0-9a-f]{40}$/.test(eventHeadSha)) {
      throw new Error(
        `Invalid EVENT_HEAD_SHA "${eventHeadSha}". Expected a 40-character hexadecimal SHA.`,
      );
    }

    const pullUrl = new URL(`repos/${repository}/pulls/${prNumber}`, apiBase);
    const pullResponse = await fetchImpl(pullUrl, requestInit(token, "GET"));
    await assertOk(pullResponse, pullUrl);
    const pullRequest = await pullResponse.json();

    if (!isPullRequest(pullRequest)) {
      throw new Error(
        `GitHub API GET ${pullUrl.pathname} returned a malformed pull request.`,
      );
    }

    const triggerHeadSha = pullRequest.head.sha;
    if (triggerHeadSha !== eventHeadSha) {
      const description =
        `Head moved from ${eventHeadSha} to ${triggerHeadSha} for ${repository}#${prNumber}; ` +
        "skipping (a newer run evaluates the current head).";
      if (env.GITHUB_EVENT_NAME === "workflow_run") {
        writeOutput(`::warning::${description}\n`);
        return { description, state: "skipped" };
      }
      throw new Error(
        `PR head is ${triggerHeadSha}, expected ${eventHeadSha} from the triggering event; re-run this workflow.`,
      );
    }

    const pullRequests = new Map<number, PullRequest>();
    let pullsUrl: URL | null = new URL(
      `repos/${repository}/pulls?state=open&per_page=100`,
      apiBase,
    );
    while (pullsUrl != null) {
      const response = await fetchImpl(pullsUrl, requestInit(token, "GET"));
      await assertOk(response, pullsUrl);
      const page = await response.json();
      if (!Array.isArray(page)) {
        throw new Error(
          `GitHub API GET ${pullsUrl.pathname} returned a non-array pull request payload.`,
        );
      }
      for (const item of page) {
        if (
          !isObject(item) ||
          !isObject(item.head) ||
          item.head.sha !== triggerHeadSha
        ) {
          continue;
        }
        if (!isPullRequest(item)) {
          throw new Error(
            `GitHub API GET ${pullsUrl.pathname} returned a malformed pull request entry.`,
          );
        }
        pullRequests.set(item.number, item);
      }
      pullsUrl = parseNextLink(response.headers.get("link"));
    }
    if (!pullRequests.has(pullRequest.number)) {
      pullRequests.set(pullRequest.number, pullRequest);
    }

    const evaluated: {
      readonly number: number;
      readonly result: GateResult;
    }[] = [];
    const permissionCache = new Map<string, Promise<boolean>>();
    for (const candidate of [...pullRequests.values()].sort(
      (left, right) => left.number - right.number,
    )) {
      if (!isBot(candidate.user)) {
        evaluated.push({
          number: candidate.number,
          result: evaluate({
            author: candidate.user,
            approvers: [],
          }),
        });
        continue;
      }

      const reviews = await listReviews({
        apiBaseUrl: apiBase,
        fetchImpl,
        prNumber: String(candidate.number),
        repository,
        token,
      } satisfies ListReviewsOptions);
      const counted = countedApprovers(reviews, {
        author: candidate.user.login,
        headSha: triggerHeadSha,
      });
      const permissionChecks = await Promise.all(
        counted.map(async (login) => ({
          hasWriteAccess: await hasWriteAccess(login, {
            apiBase,
            cache: permissionCache,
            fetchImpl,
            repository,
            token,
          }),
          login,
        })),
      );
      const approvers = permissionChecks
        .filter(({ hasWriteAccess: approved }) => approved)
        .map(({ login }) => login);
      const ignoredApprovers = permissionChecks
        .filter(({ hasWriteAccess: approved }) => !approved)
        .map(({ login }) => login);
      const verdict = evaluate({
        author: candidate.user,
        approvers,
      });
      const result: GateResult = {
        description: truncate(
          verdict.state === "failure" && ignoredApprovers.length > 0
            ? `${verdict.description}; ignored (no write access): ${ignoredApprovers.join(", ")}`
            : verdict.description,
        ),
        state: verdict.state,
      };
      if (ignoredApprovers.length > 0) {
        writeOutput(
          `Ignored approvers without write access for ${repository}#${candidate.number}: ${ignoredApprovers.join(", ")}.\n`,
        );
      }
      evaluated.push({
        number: candidate.number,
        result,
      });
    }

    const firstFailure = evaluated.find(
      ({ result: candidateResult }) => candidateResult.state === "failure",
    );
    const triggeringResult = evaluated.find(
      ({ number }) => number === pullRequest.number,
    )?.result;
    if (triggeringResult == null) {
      throw new Error(
        `Triggering pull request #${pullRequest.number} was not evaluated.`,
      );
    }
    const otherCount = evaluated.length - 1;
    const result: GateResult =
      firstFailure == null
        ? {
            description: truncate(
              `${triggeringResult.description}${
                otherCount > 0
                  ? ` (+${otherCount} other PRs at this commit)`
                  : ""
              }`,
            ),
            state: "success",
          }
        : {
            description: truncate(
              `#${firstFailure.number}: ${firstFailure.result.description}`,
            ),
            state: "failure",
          };
    await postStatus({
      url: new URL(`repos/${repository}/statuses/${triggerHeadSha}`, apiBase),
      token,
      fetchImpl,
      status: {
        description: result.description,
        state: result.state,
        target_url: targetUrl,
      },
    });
    writeOutput(
      `Published ${STATUS_CONTEXT}=${result.state} for ${repository}#${prNumber} at ${triggerHeadSha}.\n`,
    );

    return result;
  } catch (error) {
    const fallbackHeadSha =
      eventHeadSha != null && /^[0-9a-f]{40}$/.test(eventHeadSha)
        ? eventHeadSha
        : undefined;
    if (fallbackHeadSha != null) {
      try {
        await postStatus({
          url: new URL(
            `repos/${repository}/statuses/${fallbackHeadSha}`,
            apiBase,
          ),
          token,
          fetchImpl,
          status: {
            description: truncate(
              `Bot review gate could not evaluate: ${describeError(error)}`,
            ),
            state: "error",
            target_url: targetUrl,
          },
        });
      } catch (fallbackError) {
        process.stderr.write(
          `::warning::Could not publish bot-review-gate error status: ${describeError(fallbackError)}\n`,
        );
      }
    }
    throw error;
  }
}

function hasWriteAccess(
  login: string,
  options: {
    readonly apiBase: string;
    readonly cache: Map<string, Promise<boolean>>;
    readonly fetchImpl: GateFetchLike;
    readonly repository: string;
    readonly token: string;
  },
): Promise<boolean> {
  const cached = options.cache.get(login);
  if (cached != null) return cached;

  const permissionUrl = new URL(
    `repos/${options.repository}/collaborators/${encodeURIComponent(login)}/permission`,
    options.apiBase,
  );
  const permission = (async () => {
    const response = await options.fetchImpl(
      permissionUrl,
      requestInit(options.token, "GET"),
    );
    await assertOk(response, permissionUrl);
    const payload = await response.json();
    if (!isObject(payload) || typeof payload.permission !== "string") {
      throw new Error(
        `GitHub API GET ${permissionUrl.pathname} returned a malformed collaborator permission payload.`,
      );
    }
    return (
      payload.permission === "admin" ||
      payload.permission === "write" ||
      payload.permission === "maintain"
    );
  })();
  options.cache.set(login, permission);
  return permission;
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

function isPullRequest(value: unknown): value is PullRequest {
  if (!isObject(value) || !isObject(value.user) || !isObject(value.head)) {
    return false;
  }

  return (
    typeof value.number === "number" &&
    Number.isInteger(value.number) &&
    value.number > 0 &&
    typeof value.user.login === "string" &&
    value.user.login !== "" &&
    typeof value.user.type === "string" &&
    typeof value.head.sha === "string" &&
    value.head.sha !== ""
  );
}

interface PullRequest {
  readonly head: { readonly sha: string };
  readonly number: number;
  readonly user: Author;
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

function truncate(description: string): string {
  return description.slice(0, 140);
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
