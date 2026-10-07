#!/usr/bin/env node
/**
 * alert.ts — alerting hooks of the public sync.
 *
 *   node scripts/release/public-sync/alert.ts failed   # a release didn't reach its sync PR
 *   node scripts/release/public-sync/alert.ts stale    # the sync PR is open too long, or the newest one was closed unmerged
 *   node scripts/release/public-sync/alert.ts release  # public release.yml failed or is stuck on main
 *
 * Reads `PUBLIC_SYNC_ALERT_WEBHOOK_URL` (incoming webhook of the alert channel),
 * `PUBLIC_SYNC_ALERT_OWNER` (mention of the on-call owner) and `RUN_URL`; `failed` also
 * reads `RELEASE_SHA`, `stale` reads `GH_TOKEN` and `MAX_AGE_MINUTES`, and `release`
 * reads `GH_TOKEN` and `MAX_AGE_MINUTES` (a watch that can't check pages a `watch-failed` alert). An alert
 * always fails the step, so it shows even while the webhook isn't configured.
 */

import { isMain, readRequiredEnv, reportCliError } from "../../workflow.ts";
import {
  createGitHub,
  type GitHub,
  GitHubApiError,
  LAST_CLOSED_SYNC_PR_PATH,
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

/**
 * Finds the newest closed sync PR when it was closed without merging. The sync never
 * closes its PR, so that PR was closed by hand, or by deleting `sync/main`, and its
 * release won't ship until the next sync. An open sync PR clears this, so it is checked
 * first and the closed one is ignored while any sync PR is open.
 *
 * @param github - Client able to read the public repository.
 * @returns The PR, or `undefined` when a sync PR is open, or the newest closed one was merged or there is none.
 */
export async function findAbandonedSyncPr(
  github: GitHub,
): Promise<{ readonly number: number; readonly url: string } | undefined> {
  const open = (await github.rest(OPEN_SYNC_PRS_PATH)) as unknown[];
  if (open.length > 0) return undefined;
  const [pr] = (await github.rest(LAST_CLOSED_SYNC_PR_PATH)) as {
    number: number;
    html_url: string;
    merged_at: string | null;
  }[];
  if (pr === undefined || pr.merged_at !== null) return undefined;
  return { number: pr.number, url: pr.html_url };
}

/** A recent `release.yml` run on public `main` that didn't succeed or is stuck. */
export interface FailedRelease {
  readonly url: string;
  readonly sha: string;
  /** Conclusion of a completed run, or the status (`queued`, `waiting`, ...) of a stuck one. */
  readonly conclusion: string;
  /** Set when the run hasn't completed: minutes since its latest attempt started. */
  readonly stuckMinutes?: number;
}

/** Newest `release.yml` runs checked for one newer than the newest success. */
const RELEASE_RUNS_CHECKED = 20;
const RELEASE_WORKFLOW_FILE_PATH = `repos/${PUBLIC_REPO}/contents/.github/workflows/release.yml?ref=main`;
const RELEASE_RUNS_PATH = `repos/${PUBLIC_REPO}/actions/workflows/release.yml/runs?branch=main&per_page=${RELEASE_RUNS_CHECKED}`;

/**
 * Reads the newest `RELEASE_RUNS_CHECKED` `release.yml` runs on public `main` and reports
 * the newest one, newer than the newest success, that failed or is stuck. A run publishes
 * every version its commit declares that npm doesn't have yet, so a success covers every
 * older run. The one exception is a version a later bump replaced before it was published:
 * it's never published, and its notes ship with the next version.
 *
 * @param github - Client able to read the public repository.
 * @param options.now - Current time.
 * @param options.maxAgeMinutes - Minutes a run may stay queued, waiting or in progress.
 * @returns The newest run whose latest attempt completed with any conclusion but
 *   `success`, or that hasn't completed after `maxAgeMinutes`, else `undefined`
 *   (also while public `main` has no `release.yml` file yet, before cutover).
 * @throws If the runs can't be read while public `main` has `release.yml`.
 * @throws If a run that hasn't completed has an unreadable start time.
 */
export async function findFailedRelease(
  github: GitHub,
  options: { readonly now: Date; readonly maxAgeMinutes: number },
): Promise<FailedRelease | undefined> {
  let response: unknown;
  try {
    response = await github.rest(RELEASE_RUNS_PATH);
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    // Until cutover merges the first snapshot, public main has no release.yml. Once it
    // has one, a 404 means the watch can't see its runs: rethrow so it pages.
    try {
      await github.rest(RELEASE_WORKFLOW_FILE_PATH);
    } catch (fileError) {
      if (fileError instanceof GitHubApiError && fileError.status === 404) {
        return undefined;
      }
      throw fileError;
    }
    throw error;
  }
  const { workflow_runs: runs } = response as {
    workflow_runs: {
      html_url: string;
      head_sha: string;
      status: string;
      conclusion: string | null;
      run_started_at: string;
    }[];
  };
  for (const release of runs) {
    if (release.status === "completed") {
      if (release.conclusion === "success") return undefined;
      return {
        url: release.html_url,
        sha: release.head_sha,
        conclusion: release.conclusion ?? "",
      };
    }
    const ageMinutes = Math.floor(
      (options.now.getTime() - Date.parse(release.run_started_at)) / 60_000,
    );
    if (Number.isNaN(ageMinutes)) {
      throw new Error(
        `Public release run ${release.html_url} has an unreadable start time "${release.run_started_at}".`,
      );
    }
    if (ageMinutes <= options.maxAgeMinutes) continue;
    return {
      url: release.html_url,
      sha: release.head_sha,
      conclusion: release.status,
      stuckMinutes: ageMinutes,
    };
  }
  return undefined;
}

/** What an alert reports. */
export type Alert =
  | { readonly type: "failed"; readonly releaseSha: string }
  | { readonly type: "stale"; readonly pr: StaleSyncPr }
  | {
      readonly type: "abandoned";
      readonly pr: { readonly number: number; readonly url: string };
    }
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
        : alert.type === "abandoned"
          ? `Public sync PR ${alert.pr.url} was closed without merging and no sync PR is open: its release won't reach npm until the next sync. Rerun the sync job of the latest internal release.`
          : alert.type === "release-failed" &&
              alert.run.stuckMinutes !== undefined
            ? `Public release ${alert.run.url} has been ${alert.run.conclusion} for ${alert.run.stuckMinutes} minutes on public main ${alert.run.sha}: its packages aren't on npm yet. Approve, unblock or cancel and rerun it; this alert repeats until a release run succeeds.`
            : alert.type === "release-failed"
              ? `Public release ${alert.run.url} ended ${alert.run.conclusion} on public main ${alert.run.sha}: packages may be missing from npm, tags or GitHub Releases. Fix and rerun it; this alert repeats until a release run succeeds.`
              : `Public sync watch failed, so a stuck sync PR or failed release may go unnoticed: ${alert.reason}`;
  return `${where.owner} ${text} Run: ${where.runUrl}`;
}

/**
 * Decides the alert of the `stale` watch: a sync PR open too long or, when none is open,
 * one closed without merging. Any failure, from a bad threshold to an
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
    const github = options.github();
    const pr = await findStaleSyncPr({
      github,
      now: options.now,
      maxAgeMinutes,
    });
    if (pr !== undefined) return { alert: { type: "stale", pr } };
    const abandoned = await findAbandonedSyncPr(github);
    return abandoned === undefined
      ? {}
      : { alert: { type: "abandoned", pr: abandoned } };
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
 * Decides the alert of the `release` watch. Any failure, from a bad threshold to an
 * API error, becomes a `watch-failed` alert.
 *
 * @param options.github - Builds the client; called inside the guard, so a missing token pages too.
 * @param options.now - Current time.
 * @param options.maxAgeMinutes - Raw threshold for a run that hasn't completed, a positive integer.
 * @returns The alert to send, if any, and the error behind a `watch-failed` alert.
 */
export async function resolveReleaseAlert(options: {
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
    const failed = await findFailedRelease(options.github(), {
      now: options.now,
      maxAgeMinutes,
    });
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
      now: new Date(),
      maxAgeMinutes: env.MAX_AGE_MINUTES,
    }));
  } else {
    throw new Error("Usage: alert.ts failed|stale|release");
  }
  if (alert === undefined) {
    console.log(
      mode === "stale"
        ? "No stale or abandoned sync PR."
        : "No recent public release run failed or is stuck.",
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
