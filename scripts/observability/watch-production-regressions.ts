#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { getErrorMessage, sanitizeLogLine } from "../release/helpers.ts";
import {
  buildOutcomeQuery,
  CONSUMERS,
  type Consumer,
  DEFAULT_WINDOWS,
  detectRegressions,
  groupIncidents,
  type ParsedOutcomes,
  parseOutcomeRows,
  renderIncidentBody,
  type SdkVersions,
  type Windows,
} from "./tx-health.ts";

const GITHUB_API_URL = "https://api.github.com";
const DEDUP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** A closed incident is reopened as a new issue only after this quiet period. */
const REOPEN_AFTER_MS = 48 * 60 * 60 * 1000;

type Fetch = typeof fetch;

/**
 * Lists the non-private package names published from `packages/*`.
 *
 * @param cwd Repository root.
 * @returns Package names such as `@morpho-org/morpho-sdk`.
 */
export function listSdkPackages(cwd: string): Set<string> {
  return new Set(
    readdirSync(join(cwd, "packages"), { withFileTypes: true }).flatMap(
      (entry) => {
        if (!entry.isDirectory()) return [];
        const manifestPath = join(cwd, "packages", entry.name, "package.json");
        if (!existsSync(manifestPath)) return [];
        const manifest = JSON.parse(
          readFileSync(manifestPath, "utf8"),
        ) as Record<string, unknown>;
        return manifest.private === true || typeof manifest.name !== "string"
          ? []
          : [manifest.name];
      },
    ),
  );
}

/**
 * Picks the SDK runtime dependencies declared in a consumer manifest.
 *
 * @param manifest The consumer's parsed `package.json`.
 * @param sdkPackages Package names published from this repository.
 * @returns SDK package names mapped to their declared versions, sorted by name.
 */
export function pickSdkDependencies(
  manifest: Record<string, unknown>,
  sdkPackages: ReadonlySet<string>,
): Record<string, string> {
  const { dependencies } = manifest;
  if (dependencies == null || typeof dependencies !== "object") return {};
  return Object.fromEntries(
    Object.entries(dependencies)
      .filter(
        (entry): entry is [string, string] =>
          sdkPackages.has(entry[0]) && typeof entry[1] === "string",
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Runs a query against the Better Stack SQL API.
 *
 * @param query A query ending in `FORMAT JSONEachRow`.
 * @param options `env` holds `BETTERSTACK_SQL_URL`, `BETTERSTACK_SQL_USERNAME`
 *   and `BETTERSTACK_SQL_PASSWORD`; `fetchImpl` performs the request.
 * @returns The response body.
 * @throws If credentials are missing or the request fails.
 */
export async function queryBetterStack(
  query: string,
  {
    env,
    fetchImpl,
  }: { readonly env: NodeJS.ProcessEnv; readonly fetchImpl: Fetch },
): Promise<string> {
  const url = env.BETTERSTACK_SQL_URL;
  const username = env.BETTERSTACK_SQL_USERNAME;
  const password = env.BETTERSTACK_SQL_PASSWORD;
  if (!url || !username || !password) {
    throw new Error(
      "BETTERSTACK_SQL_URL, BETTERSTACK_SQL_USERNAME and BETTERSTACK_SQL_PASSWORD are required.",
    );
  }
  const endpoint = new URL(url);
  endpoint.searchParams.set("output_format_pretty_row_numbers", "0");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "text/plain",
    },
    body: query,
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`Better Stack query failed (${response.status}).`);
  }
  return response.text();
}

/**
 * Reads a consumer release's SDK versions from its manifest at that commit.
 *
 * @param release The deployed commit SHA.
 * @param options The consumer app, the package names published from this
 *   repository, a GitHub token that can read the consumer repository, and the
 *   fetch implementation.
 * @returns The SDK versions, or the reason they could not be read.
 */
export async function resolveSdkVersions(
  release: string,
  {
    consumer,
    sdkPackages,
    token,
    fetchImpl,
  }: {
    readonly consumer: Pick<Consumer, "repository" | "manifestPath">;
    readonly sdkPackages: ReadonlySet<string>;
    readonly token: string;
    readonly fetchImpl: Fetch;
  },
): Promise<SdkVersions> {
  if (!/^[0-9a-f]{40}$/.test(release)) {
    return { error: "release is not a commit SHA" };
  }
  try {
    const response = await fetchImpl(
      `${GITHUB_API_URL}/repos/${consumer.repository}/contents/${consumer.manifestPath}?ref=${release}`,
      {
        headers: {
          Accept: "application/vnd.github.raw+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
      },
    );
    if (!response.ok) {
      return { error: `GitHub contents request failed (${response.status})` };
    }
    const manifest = JSON.parse(await response.text()) as Record<
      string,
      unknown
    >;
    return { packages: pickSdkDependencies(manifest, sdkPackages) };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

interface ExistingIssue {
  readonly title: string;
  readonly state: string;
  readonly closedAtMs: number | null;
}

/**
 * Returns whether an incident with this title is already tracked: an open
 * issue, or one closed less than 48 hours ago.
 *
 * @param title The incident title.
 * @param options Recent issues opened by the workflow and the current time in
 *   milliseconds.
 * @returns Whether a new issue must not be opened.
 */
export function isTracked(
  title: string,
  {
    issues,
    nowMs,
  }: { readonly issues: readonly ExistingIssue[]; readonly nowMs: number },
): boolean {
  return issues.some(
    (issue) =>
      issue.title === title &&
      (issue.state === "open" ||
        (issue.closedAtMs != null &&
          nowMs - issue.closedAtMs < REOPEN_AFTER_MS)),
  );
}

async function listRecentIssues({
  repository,
  headers,
  nowMs,
  fetchImpl,
}: {
  readonly repository: string;
  readonly headers: Record<string, string>;
  readonly nowMs: number;
  readonly fetchImpl: Fetch;
}): Promise<ExistingIssue[]> {
  // `since` filters on `updated_at`: list every open issue, and only recent closed ones.
  const queries: Record<string, string>[] = [
    { state: "open" },
    {
      state: "closed",
      since: new Date(nowMs - DEDUP_LOOKBACK_MS).toISOString(),
    },
  ];
  const issues: ExistingIssue[] = [];
  for (const query of queries) {
    for (let page = 1; ; page += 1) {
      const url = new URL(`${GITHUB_API_URL}/repos/${repository}/issues`);
      url.search = new URLSearchParams({
        ...query,
        creator: "github-actions[bot]",
        per_page: "100",
        page: String(page),
      }).toString();
      const response = await fetchImpl(url, { headers, redirect: "error" });
      if (!response.ok) {
        throw new Error(`GitHub issue listing failed (${response.status}).`);
      }
      const listed = (await response.json()) as {
        title?: string;
        state?: string;
        closed_at?: string | null;
        pull_request?: unknown;
      }[];
      for (const issue of listed) {
        if (issue.pull_request != null || typeof issue.title !== "string")
          continue;
        issues.push({
          title: issue.title,
          state: issue.state ?? "open",
          closedAtMs: issue.closed_at ? Date.parse(issue.closed_at) : null,
        });
      }
      if (listed.length < 100) break;
    }
  }
  return issues;
}

/**
 * Detects production regressions of SDK-generated transactions and opens one
 * GitHub issue per new incident for the RCA automation.
 *
 * @param options Optional runtime inputs for tests and local execution.
 */
export async function main(
  options: {
    argv?: string[];
    cwd?: string;
    nowMs?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: Fetch;
  } = {},
): Promise<void> {
  const { values } = parseArgs({
    args: options.argv ?? process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      input: { type: "string" },
      now: { type: "string" },
    },
    strict: true,
  });
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cwd = options.cwd ?? process.cwd();
  const nowMs =
    values.now != null ? Date.parse(values.now) : (options.nowMs ?? Date.now());
  if (Number.isNaN(nowMs)) throw new Error(`Invalid --now "${values.now}".`);
  const dryRun = values["dry-run"];
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  if (!dryRun && (!token || !repository)) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  }
  if (values.input != null && CONSUMERS.length !== 1) {
    throw new Error("--input needs exactly one configured consumer.");
  }

  const windows: Windows = { ...DEFAULT_WINDOWS, nowMs };
  const sdkPackages = listSdkPackages(cwd);
  const consumerToken = env.CONSUMER_REPOSITORY_TOKEN || token;
  const githubHeaders = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const errors: string[] = [];
  let existing: ExistingIssue[] | null = null;
  let incidentCount = 0;
  let createdCount = 0;

  for (const consumer of CONSUMERS) {
    let parsed: ParsedOutcomes;
    try {
      parsed = parseOutcomeRows(
        values.input != null
          ? readFileSync(values.input, "utf8")
          : await queryBetterStack(buildOutcomeQuery(consumer, windows), {
              env,
              fetchImpl,
            }),
      );
    } catch (error) {
      errors.push(`${consumer.id}: ${getErrorMessage(error)}`);
      continue;
    }
    const { rows, rejectedRows } = parsed;
    if (rejectedRows > 0) {
      process.stderr.write(
        `${consumer.id}: dropped ${rejectedRows} rows with an invalid action type or chain id.\n`,
      );
    }
    // No tx_outcome in the last window means broken telemetry, not a healthy app.
    if (!rows.some((row) => row.window === "current")) {
      errors.push(
        `${consumer.id}: no tx_outcome events in the current window.`,
      );
      continue;
    }

    const regressions = detectRegressions(rows, { consumer, windows });
    const incidents = groupIncidents(regressions);
    incidentCount += incidents.length;
    const releases = new Set(
      incidents.flatMap((incident) =>
        incident.regressions.flatMap((r) => r.releases.map((x) => x.release)),
      ),
    );
    const sdkVersions = new Map<string, SdkVersions>();
    for (const release of releases) {
      sdkVersions.set(
        release,
        consumerToken
          ? await resolveSdkVersions(release, {
              consumer,
              sdkPackages,
              token: consumerToken,
              fetchImpl,
            })
          : { error: "no GitHub token to read the consumer repository" },
      );
    }

    for (const incident of incidents) {
      const body = renderIncidentBody(incident, {
        windows,
        dashboardUrl: consumer.dashboardUrl,
        consumerRepository: consumer.repository,
        sdkVersions,
      });
      if (dryRun) {
        process.stdout.write(`## ${incident.title}\n\n${body}\n\n`);
        continue;
      }
      try {
        existing ??= await listRecentIssues({
          repository: repository as string,
          headers: githubHeaders,
          nowMs,
          fetchImpl,
        });
        if (isTracked(incident.title, { issues: existing, nowMs })) {
          process.stdout.write(`already tracked: ${incident.title}\n`);
          continue;
        }
        const response = await fetchImpl(
          `${GITHUB_API_URL}/repos/${repository}/issues`,
          {
            method: "POST",
            headers: { ...githubHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ title: incident.title, body }),
            redirect: "error",
          },
        );
        if (!response.ok) {
          throw new Error(`GitHub issue creation failed (${response.status}).`);
        }
        createdCount += 1;
        existing.push({
          title: incident.title,
          state: "open",
          closedAtMs: null,
        });
      } catch (error) {
        errors.push(`${incident.title}: ${getErrorMessage(error)}`);
      }
    }
    process.stdout.write(
      `${consumer.id}: ${rows.length} rows, ${regressions.length} regressions, ${incidents.length} incidents.\n`,
    );
  }

  process.stdout.write(
    `Checked ${CONSUMERS.length} consumers; found ${incidentCount} incidents; created ${createdCount} issues.\n`,
  );
  if (errors.length > 0) {
    for (const error of errors)
      process.stderr.write(`${sanitizeLogLine(error)}\n`);
    throw new Error(errors.join("; "));
  }
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${sanitizeLogLine(getErrorMessage(error))}\n`);
    process.exitCode = 1;
  });
}
