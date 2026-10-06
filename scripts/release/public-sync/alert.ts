#!/usr/bin/env node
/**
 * alert.ts — alerting hooks of the public sync.
 *
 *   node scripts/release/public-sync/alert.ts failed   # a release didn't reach its sync PR
 *   node scripts/release/public-sync/alert.ts stale    # the sync PR is open too long
 *
 * Reads `PUBLIC_SYNC_ALERT_WEBHOOK_URL` (incoming webhook of the alert channel),
 * `PUBLIC_SYNC_ALERT_OWNER` (mention of the on-call owner) and `RUN_URL`; `failed` also
 * reads `RELEASE_SHA`, and `stale` reads `GH_TOKEN` and `MAX_AGE_MINUTES`. An alert
 * always fails the step, so it shows even while the webhook isn't configured.
 */

import { isMain, readRequiredEnv, reportCliError } from "../../workflow.ts";
import { createGitHub, type GitHub } from "./github.ts";
import { PUBLIC_REPO, SYNC_BRANCH } from "./sync.ts";

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
  const pulls = (await github.rest(
    `repos/${PUBLIC_REPO}/pulls?state=open&base=main&head=${PUBLIC_REPO.split("/")[0]}:${SYNC_BRANCH}`,
  )) as { number: number; html_url: string; head: { sha: string } }[];
  const pr = pulls[0];
  if (pr === undefined) return undefined;
  const commit = (await github.rest(
    `repos/${PUBLIC_REPO}/git/commits/${pr.head.sha}`,
  )) as { committer: { date: string } };
  const ageMinutes = Math.floor(
    (options.now.getTime() - Date.parse(commit.committer.date)) / 60_000,
  );
  if (!(ageMinutes > options.maxAgeMinutes)) return undefined;
  return { number: pr.number, url: pr.html_url, ageMinutes };
}

/** What an alert reports. */
export type Alert =
  | { readonly type: "failed"; readonly releaseSha: string }
  | { readonly type: "stale"; readonly pr: StaleSyncPr };

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
      : `Public sync PR ${alert.pr.url} has been open for ${alert.pr.ageMinutes} minutes without merging. Check its CI and auto-merge.`;
  return `${where.owner} ${text} Run: ${where.runUrl}`;
}

async function run() {
  const mode = process.argv[2];
  const env = process.env;
  let alert: Alert | undefined;
  if (mode === "failed") {
    alert = { type: "failed", releaseSha: readRequiredEnv(env, "RELEASE_SHA") };
  } else if (mode === "stale") {
    const maxAgeMinutes = Number(readRequiredEnv(env, "MAX_AGE_MINUTES"));
    if (!Number.isInteger(maxAgeMinutes) || maxAgeMinutes <= 0) {
      throw new Error("MAX_AGE_MINUTES must be a positive integer.");
    }
    const pr = await findStaleSyncPr({
      github: createGitHub({ token: readRequiredEnv(env, "GH_TOKEN") }),
      now: new Date(),
      maxAgeMinutes,
    });
    if (pr !== undefined) alert = { type: "stale", pr };
  } else {
    throw new Error("Usage: alert.ts failed|stale");
  }
  if (alert === undefined) {
    console.log("No stale sync PR.");
    return;
  }

  const text = formatAlert(alert, {
    owner: env.PUBLIC_SYNC_ALERT_OWNER || "(owner not configured)",
    runUrl: readRequiredEnv(env, "RUN_URL"),
  });
  const webhook = env.PUBLIC_SYNC_ALERT_WEBHOOK_URL;
  if (webhook) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(`Alert webhook answered ${response.status}. ${text}`);
    }
  }
  throw new Error(
    webhook
      ? text
      : `${text} (PUBLIC_SYNC_ALERT_WEBHOOK_URL isn't set: nobody was paged.)`,
  );
}

if (isMain(import.meta.url)) {
  run().catch(reportCliError);
}
