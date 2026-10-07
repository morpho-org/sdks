#!/usr/bin/env node
/**
 * alert.ts — alerting hooks of the public sync.
 *
 *   node scripts/release/public-sync/alert.ts failed   # a release didn't reach its sync PR
 *   node scripts/release/public-sync/alert.ts stale    # the sync PR is open too long
 *   node scripts/release/public-sync/alert.ts release  # public release.yml failed on main
 *
 * Reads `PUBLIC_SYNC_ALERT_WEBHOOK_URL` (incoming webhook of the alert channel),
 * `PUBLIC_SYNC_ALERT_OWNER` (mention of the on-call owner) and `RUN_URL`; `failed` also
 * reads `RELEASE_SHA`, `stale` reads `GH_TOKEN` and `MAX_AGE_MINUTES`, and `release`
 * reads `GH_TOKEN` (a watch that can't check pages a `watch-failed` alert). An alert
 * always fails the step, so it shows even while the webhook isn't configured.
 */

import { isMain, readRequiredEnv, reportCliError } from "../../workflow.ts";
import {
  createGitHub,
  type GitHub,
  OPEN_SYNC_PRS_PATH,
  PUBLIC_REPO,
} from "./github.ts";

/** Open sync PR whose head commit is older than the threshold. */
export interface StaleSyncPr {
  readonly number: number;
  readonly url: string;
  readonly ageMinutes: number;
}

/**
 * Finds the open sync PR on the public repository if it has waited more than
 * `maxAgeMinutes` since its head commit was created.
 *
 * @param options.github - Client able to read the public repository.
 * @param options.now - Current time.
 * @param options.maxAgeMinutes - Threshold.
 * @returns The stale PR, or `undefined` when there is none or it is recent.
 */
export async function findStaleSyncPr(options: {
  readonly github: GitHub;
  readonly now: Date;
  readonly maxAgeMinutes: number;
}): Promise<StaleSyncPr | undefined> {
  const { github } = options;
  const pulls = (await github.rest(OPEN_SYNC_PRS_PATH)) as {
    number: number;
    html_url: string;
    head: { sha: string };
  }[];
  const pr = pulls[0];
  if (pr === undefined) return undefined;
  const commit = (await github.rest(
    `repos/${PUBLIC_REPO}/git/commits/${pr.head.sha}`,
  )) as { committer: { date: string } };
  const ageMinutes = Math.floor(
    (options.now.getTime() - Date.parse(commit.committer.date)) / 60_000,
  );
  if (!Number.isFinite(ageMinutes)) {
    throw new Error(
      `Sync PR #${pr.number} head commit has an unreadable date "${commit.committer.date}".`,
    );
  }
  if (ageMinutes <= options.maxAgeMinutes) return undefined;
  return { number: pr.number, url: pr.html_url, ageMinutes };
}

/** Latest `release.yml` run on public `main`, when it failed. */
export interface FailedRelease {
  readonly url: string;
  readonly sha: string;
  readonly conclusion: string;
}

const RELEASE_RUNS_PATH = `repos/${PUBLIC_REPO}/actions/workflows/release.yml/runs?branch=main&per_page=1`;
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * Reads the latest `release.yml` run on public `main`. It keeps being reported until a
 * later run (or a rerun) succeeds, since a failed run can leave packages off npm.
 *
 * @param github - Client able to read the public repository.
 * @returns The run when it completed with a failure, else `undefined`.
 */
export async function findFailedRelease(
  github: GitHub,
): Promise<FailedRelease | undefined> {
  const { workflow_runs: runs } = (await github.rest(RELEASE_RUNS_PATH)) as {
    workflow_runs: {
      html_url: string;
      head_sha: string;
      status: string;
      conclusion: string | null;
    }[];
  };
  const latest = runs[0];
  if (
    latest === undefined ||
    latest.status !== "completed" ||
    !FAILED_CONCLUSIONS.has(latest.conclusion ?? "")
  ) {
    return undefined;
  }
  return {
    url: latest.html_url,
    sha: latest.head_sha,
    conclusion: latest.conclusion ?? "",
  };
}

/** What an alert reports. */
export type Alert =
  | { readonly type: "failed"; readonly releaseSha: string }
  | { readonly type: "stale"; readonly pr: StaleSyncPr }
  | { readonly type: "release-failed"; readonly run: FailedRelease }
  | { readonly type: "watch-failed"; readonly reason: string };

/**
 * Formats the alert text posted to the alert channel.
 *
 * @param alert - What happened.
 * @param where.owner - Mention of the owner, prepended so they are notified.
 * @param where.runUrl - Workflow run that raised it.
 * @returns The message.
 */
export function formatAlert(
  alert: Alert,
  where: { readonly owner: string; readonly runUrl: string },
): string {
  const text =
    alert.type === "failed"
      ? `Public sync failed for internal release ${alert.releaseSha}: the public PR wasn't opened or updated. Check the run, fix, and rerun the failed jobs.`
      : alert.type === "stale"
        ? `Public sync PR ${alert.pr.url} has been open for ${alert.pr.ageMinutes} minutes without merging. Check its CI and auto-merge.`
        : alert.type === "release-failed"
          ? `Public release ${alert.run.url} ended ${alert.run.conclusion} on public main ${alert.run.sha}: packages may be missing from npm, tags or GitHub Releases. Fix and rerun it; this alert repeats until a release run succeeds.`
          : `Public sync watch failed, so a stuck sync PR or failed release may go unnoticed: ${alert.reason}`;
  return `${where.owner} ${text} Run: ${where.runUrl}`;
}

/**
 * Decides the alert of the `stale` watch. Any failure, from a bad threshold to an
 * API error, becomes a `watch-failed` alert, so a broken watch still pages.
 *
 * @param options.github - Builds the client; called inside the guard, so a missing token pages too.
 * @param options.now - Current time.
 * @param options.maxAgeMinutes - Raw threshold, a positive integer.
 * @returns The alert to send, if any, and the error behind a `watch-failed` alert.
 */
export async function resolveStaleAlert(options: {
  readonly github: () => GitHub;
  readonly now: Date;
  readonly maxAgeMinutes: string | undefined;
}): Promise<{ readonly alert?: Alert; readonly cause?: unknown }> {
  try {
    const maxAgeMinutes = Number(options.maxAgeMinutes);
    if (!Number.isInteger(maxAgeMinutes) || maxAgeMinutes <= 0) {
      throw new Error(
        `MAX_AGE_MINUTES must be a positive integer, got ${JSON.stringify(options.maxAgeMinutes)}.`,
      );
    }
    const pr = await findStaleSyncPr({
      github: options.github(),
      now: options.now,
      maxAgeMinutes,
    });
    return pr === undefined ? {} : { alert: { type: "stale", pr } };
  } catch (error) {
    return {
      alert: {
        type: "watch-failed",
        reason: error instanceof Error ? error.message : String(error),
      },
      cause: error,
    };
  }
}

/**
 * Decides the alert of the `release` watch. Any failure becomes a `watch-failed` alert.
 *
 * @param options.github - Builds the client; called inside the guard, so a missing token pages too.
 * @returns The alert to send, if any, and the error behind a `watch-failed` alert.
 */
export async function resolveReleaseAlert(options: {
  readonly github: () => GitHub;
}): Promise<{ readonly alert?: Alert; readonly cause?: unknown }> {
  try {
    const failed = await findFailedRelease(options.github());
    return failed === undefined
      ? {}
      : { alert: { type: "release-failed", run: failed } };
  } catch (error) {
    return {
      alert: {
        type: "watch-failed",
        reason: error instanceof Error ? error.message : String(error),
      },
      cause: error,
    };
  }
}

async function run() {
  const mode = process.argv[2];
  const env = process.env;
  let alert: Alert | undefined;
  let cause: unknown;
  if (mode === "failed") {
    alert = { type: "failed", releaseSha: readRequiredEnv(env, "RELEASE_SHA") };
  } else if (mode === "stale") {
    ({ alert, cause } = await resolveStaleAlert({
      github: () => createGitHub({ token: readRequiredEnv(env, "GH_TOKEN") }),
      now: new Date(),
      maxAgeMinutes: env.MAX_AGE_MINUTES,
    }));
  } else if (mode === "release") {
    ({ alert, cause } = await resolveReleaseAlert({
      github: () => createGitHub({ token: readRequiredEnv(env, "GH_TOKEN") }),
    }));
  } else {
    throw new Error("Usage: alert.ts failed|stale|release");
  }
  if (alert === undefined) {
    console.log(
      mode === "stale"
        ? "No stale sync PR."
        : "Latest public release run didn't fail.",
    );
    return;
  }

  const text = formatAlert(alert, {
    owner: env.PUBLIC_SYNC_ALERT_OWNER || "(owner not configured)",
    runUrl: readRequiredEnv(env, "RUN_URL"),
  });
  await sendAlert({
    text,
    cause,
    webhook: env.PUBLIC_SYNC_ALERT_WEBHOOK_URL,
    fetchImpl: fetch,
  });
}

/**
 * Posts an alert to the webhook, then always throws so the step fails and the alert
 * shows in the run even when nobody could be paged.
 *
 * @param options.text - Alert text.
 * @param options.cause - Error behind the alert, kept as `cause`.
 * @param options.webhook - Incoming webhook URL; empty or unset skips the call.
 * @param options.fetchImpl - `fetch` implementation.
 * @throws Always: the alert text, or why the webhook call failed.
 */
export async function sendAlert(options: {
  readonly text: string;
  readonly cause?: unknown;
  readonly webhook: string | undefined;
  readonly fetchImpl: typeof fetch;
}): Promise<never> {
  const { text, cause, webhook } = options;
  if (webhook) {
    let response: Response;
    try {
      response = await options.fetchImpl(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (error) {
      throw new Error(`Alert webhook call failed, nobody was paged. ${text}`, {
        cause:
          cause === undefined
            ? error
            : new AggregateError([error, cause], "Webhook and watch errors"),
      });
    }
    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(
        `Alert webhook answered ${response.status} ${JSON.stringify(body)}, nobody was paged. ${text}`,
        cause === undefined ? undefined : { cause },
      );
    }
  }
  throw new Error(
    webhook
      ? text
      : `${text} (PUBLIC_SYNC_ALERT_WEBHOOK_URL isn't set: nobody was paged.)`,
    cause === undefined ? undefined : { cause },
  );
}

if (isMain(import.meta.url)) {
  run().catch(reportCliError);
}
