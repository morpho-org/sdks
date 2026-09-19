#!/usr/bin/env node
/**
 * claude-trigger-gate.ts — the "is this actor allowed to run Claude?" gate of
 * `.github/workflows/claude.yml`. Run with Node's native TypeScript support:
 *
 *   node scripts/ci/claude-trigger-gate.ts   # writes authorized=<true|false> to GITHUB_OUTPUT
 *
 * The workflow's `if:` expression keeps its cheap syntactic filter (which event, is it a draft, does
 * the body mention `@claude`), but the authorization decision lives here because it interprets data
 * — a sender identity and a repository permission — and CI logic that interprets data is tested code
 * (`AGENTS.md` §10).
 *
 * Two holes in the expression this replaces:
 *
 *  - `author_association` reports `COLLABORATOR` for *any* direct collaborator, including one whose
 *    role is read-only. Read access is not a licence to spend the repository's Anthropic key or to
 *    drive a job holding a `pull-requests: write` token, so `COLLABORATOR` is resolved against the
 *    repository's actual permission for that user instead of being trusted on its face.
 *  - `github.event.sender.type == 'Bot'` short-circuited the association check entirely, leaving the
 *    third-party action's `allowed_bots` input as the only filter. The allowlist is enforced here
 *    too, so authorization no longer depends on an input to code the workflow does not own. The
 *    resolved list is echoed back as the `allowed_bots` output so the action and this gate cannot
 *    drift apart.
 *
 * Only the ambiguous case costs an API call: `pull_request` events are settled by the workflow's
 * same-repository filter, `OWNER` and `MEMBER` are conclusive on their own, and a bot is decided by
 * the allowlist. When the permission lookup is unavailable — a job token that cannot read
 * collaborator permissions answers 403 — the gate denies rather than falls back to the association,
 * so the blast radius of that failure is "outside collaborators can no longer `@claude`", never "an
 * unverified actor was let through".
 *
 * Reads `EVENT_NAME`, `SENDER_TYPE`, `SENDER_LOGIN`, `AUTHOR_ASSOCIATION`, `ALLOWED_BOTS`,
 * `GH_TOKEN`, `GITHUB_REPOSITORY` and `GITHUB_OUTPUT`.
 */

import { appendFileSync } from "node:fs";

import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const USER_AGENT = "morpho-sdks-claude-trigger-gate";

/**
 * Associations that establish write access on their own. `MEMBER` is a member of the organization
 * that owns the repository; `OWNER` is the repository owner. `COLLABORATOR` is deliberately absent —
 * it spans read-only outside collaborators and is resolved against the permission API instead.
 */
export const CONCLUSIVE_ASSOCIATIONS = ["OWNER", "MEMBER"] as const;

/** Repository roles that carry write access, as reported by the collaborator permission API. */
export const WRITE_PERMISSIONS = ["admin", "maintain", "write"] as const;

/** Injectable `fetch` boundary so the GitHub API can be stubbed in tests. */
export type FetchLike = (
  url: URL,
  init: { headers: Record<string, string>; method: string },
) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

/** Injectable env/fetch/output boundaries of the CLI. */
export interface RunOptions {
  readonly apiBaseUrl?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: FetchLike;
  readonly outputFile?: string;
  readonly writeOutput?: (message: string) => void;
}

/**
 * Normalizes a comma-separated bot allowlist into comparable logins: blanks dropped, case folded,
 * and the `[bot]` suffix GitHub appends to a bot's `sender.login` stripped so the workflow input and
 * the event payload compare equal.
 */
export function parseAllowedBots(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeBotLogin(entry))
    .filter((entry) => entry !== "");
}

/** Lowercases a bot login and drops the trailing `[bot]` GitHub adds to the event payload. */
export function normalizeBotLogin(login: string): string {
  return login
    .trim()
    .toLowerCase()
    .replace(/\[bot\]$/, "");
}

/**
 * Whether the collaborator permission API reports write access. Anything else — `read`, `triage`,
 * `none`, or a role GitHub adds later — is not write access.
 */
export function hasWriteAccess(permission: string): boolean {
  return (WRITE_PERMISSIONS as readonly string[]).includes(permission);
}

/**
 * Resolves the repository permission GitHub records for `login`, or `null` when the API cannot
 * answer: 404 (not a collaborator) and 403 (the job token may not read collaborator permissions) are
 * both "unknown", and the caller denies on unknown. Any other non-2xx is a wiring or outage problem
 * and throws, so it surfaces as a red job rather than a silent denial.
 */
export async function fetchPermission(options: {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly login: string;
  readonly repository: string;
  readonly token: string;
}): Promise<string | null> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const url = new URL(
    `repos/${options.repository}/collaborators/${encodeURIComponent(options.login)}/permission`,
    options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method: "GET",
  });

  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub API GET ${url.pathname} failed with ${response.status}.`,
    );
  }

  const body = await response.json();
  const permission = (body as { permission?: unknown } | null)?.permission;
  if (typeof permission !== "string") {
    throw new Error(
      `GitHub API GET ${url.pathname} returned no "permission" string.`,
    );
  }

  return permission;
}

/** Outcome of the gate: the decision plus the one-line reason written to the job log. */
export interface Decision {
  readonly authorized: boolean;
  readonly reason: string;
}

/**
 * Decides whether the event's sender may drive the Claude job. Bots are matched against the
 * allowlist, humans are authorized by a conclusive association or by a repository permission that
 * carries write access.
 */
export async function authorize(options: RunOptions = {}): Promise<Decision> {
  const env = options.env ?? process.env;
  const login = readRequiredEnv(env, "SENDER_LOGIN");
  const allowedBots = parseAllowedBots(env.ALLOWED_BOTS);

  if (env.SENDER_TYPE === "Bot") {
    const normalized = normalizeBotLogin(login);
    const authorized = allowedBots.includes(normalized);

    return {
      authorized,
      reason: authorized
        ? `Bot ${login} is on the allowlist.`
        : `Bot ${login} is not on the allowlist (${allowedBots.join(", ") || "empty"}).`,
    };
  }

  // A `pull_request` event only reaches this gate when the workflow's filter has already established
  // that the head branch lives in this repository, which takes write access to push. The event is its
  // own proof, and `author_association` would be the wrong signal to add: on `synchronize` it
  // describes the pull request's author, not the person who pushed.
  if (env.EVENT_NAME === "pull_request") {
    return {
      authorized: true,
      reason: `${login} pushed a same-repository pull request branch.`,
    };
  }

  const association = env.AUTHOR_ASSOCIATION ?? "";
  if ((CONCLUSIVE_ASSOCIATIONS as readonly string[]).includes(association)) {
    return { authorized: true, reason: `${login} is ${association}.` };
  }

  const permission = await fetchPermission({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl: options.fetchImpl,
    login,
    repository: readRequiredEnv(env, "GITHUB_REPOSITORY"),
    token: readRequiredEnv(env, "GH_TOKEN"),
  });

  if (permission == null) {
    return {
      authorized: false,
      reason: `${login} (association ${association || "none"}) has no readable repository permission.`,
    };
  }

  return {
    authorized: hasWriteAccess(permission),
    reason: `${login} (association ${association || "none"}) has "${permission}" permission.`,
  };
}

/**
 * CLI entrypoint: records `authorized` and the normalized `allowed_bots` as step outputs. A denial
 * is a normal outcome written as `authorized=false`, not a failed job — only wiring and API errors
 * throw.
 */
export async function main(options: RunOptions = {}): Promise<Decision> {
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const decision = await authorize(options);

  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `authorized=${decision.authorized}\nallowed_bots=${parseAllowedBots(env.ALLOWED_BOTS).join(",")}\n`,
  );
  writeOutput(
    `${decision.authorized ? "Authorized" : "Denied"}: ${decision.reason}\n`,
  );

  return decision;
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
