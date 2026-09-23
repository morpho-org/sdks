#!/usr/bin/env node
/**
 * lupin-review.ts — the decisions `.github/workflows/lupin.yml` derives from Lupin's output. Run with
 * Node's native TypeScript support:
 *
 *   node scripts/ci/lupin-review.ts history   # previous completed review, before `lupin prepare`
 *   node scripts/ci/lupin-review.ts result    # whether `lupin run` left a publishable result
 *   node scripts/ci/lupin-review.ts publish   # post feedback, or a failed/cancelled status
 *
 * Every mode reads `REVIEW_OUTPUT`. `history` also reads `LUPIN` (the pinned executable),
 * `GITHUB_REPOSITORY`, `PR_NUMBER`, `RUNNER_TEMP` and `GITHUB_OUTPUT`; `result` reads
 * `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY`; `publish` reads `LUPIN`, `GITHUB_REPOSITORY`,
 * `PR_NUMBER`, `RUN_URL`, `GITHUB_RUN_ATTEMPT`, `REVIEW_RESULT` and `START_RESULT`. Lupin owns
 * admission, review and publication; this script only chooses which Lupin command runs and never
 * turns a missing result into a clean review.
 */

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

/** Workflow file whose review artifacts hold a PR's previous completed reviews. */
export const WORKFLOW_FILE = "lupin.yml";
/** Formal approvals stay with humans; Lupin posts its overview and inline findings only. */
export const DELIVERY = "comment";

const REVISION = /^[0-9a-f]{40}$/;

/** Result of one child process; `stdout` is empty when output was streamed to the job log. */
export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
}

/** One child process; `capture` returns its stdout instead of streaming it to the job log. */
export interface CommandRequest {
  readonly args: readonly string[];
  readonly capture: boolean;
  readonly command: string;
}

/** Injectable process boundary so Lupin and git can be stubbed in tests. */
export type RunCommand = (request: CommandRequest) => CommandResult;

/** Default {@link RunCommand}: captured output for lookups, inherited stdio for everything else. */
export function runCommand({
  args,
  capture,
  command,
}: CommandRequest): CommandResult {
  const child = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (child.error != null) throw child.error;

  return { status: child.status, stdout: child.stdout ?? "" };
}

/** A usable previous review, or the reason reviewers receive no history. */
export type PreviousReview =
  | {
      readonly found: true;
      readonly directory: string;
      readonly revisions: readonly [string, string];
    }
  | { readonly found: false; readonly reason: string };

/**
 * Interprets `lupin lineage fetch` output. Anything other than a complete lookup with two full
 * commit SHAs is treated as absent history, with the reason preserved for the job log.
 */
export function parseLineage(stdout: string): PreviousReview {
  let lookup: unknown;
  try {
    lookup = JSON.parse(stdout);
  } catch {
    return { found: false, reason: "lineage lookup returned invalid JSON" };
  }
  if (lookup == null || typeof lookup !== "object") {
    return { found: false, reason: "lineage lookup returned no object" };
  }
  const record = lookup as Record<string, unknown>;
  if (record.found !== true) {
    return {
      found: false,
      reason:
        typeof record.reason === "string" && record.reason !== ""
          ? record.reason
          : "no previous review",
    };
  }
  const { baseRevision, directory, revision } = record;
  if (
    typeof directory !== "string" ||
    directory === "" ||
    typeof baseRevision !== "string" ||
    !REVISION.test(baseRevision) ||
    typeof revision !== "string" ||
    !REVISION.test(revision)
  ) {
    return {
      found: false,
      reason: "lineage lookup omitted the previous directory or revisions",
    };
  }

  return { directory, found: true, revisions: [baseRevision, revision] };
}

/** Git arguments that fetch one commit with the job token, without persisting a credential. */
export function fetchRevisionArgs(revision: string): string[] {
  return [
    "-c",
    "credential.helper=",
    "-c",
    "credential.helper=!gh auth git-credential",
    "fetch",
    "origin",
    revision,
  ];
}

/** Terminal status posted when a review produced no publishable result. */
export type FailureState = "cancelled" | "failed";

/** What the publisher does with a review job's outcome. */
export type PublicationPlan =
  | { readonly kind: "comment"; readonly runDirectory: string }
  | { readonly kind: "status"; readonly state: FailureState };

/**
 * Chooses the publication for a finished review. Only a saved `review.json` is published as
 * feedback; otherwise the overview records a cancelled or failed run instead of staying silent.
 */
export function planPublication(input: {
  readonly hasResult: boolean;
  readonly reviewResult: string;
  readonly runDirectory: string;
  readonly startResult: string;
}): PublicationPlan {
  if (input.hasResult) {
    return { kind: "comment", runDirectory: input.runDirectory };
  }
  const cancelled =
    input.reviewResult === "cancelled" || input.startResult === "cancelled";

  return { kind: "status", state: cancelled ? "cancelled" : "failed" };
}

/** Inputs shared by the CLI modes; every boundary is injectable for tests. */
export interface LupinReviewOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly run?: RunCommand;
  readonly writeOutput?: (message: string) => void;
}

/**
 * Looks up the PR's previous completed review and fetches its revisions. The lookup is recorded
 * beside the run so absent history stays visible; `previous=<directory>` is emitted only when both
 * revisions are available locally.
 */
export function history(options: LupinReviewOptions = {}): PreviousReview {
  const env = options.env ?? process.env;
  const run = options.run ?? runCommand;
  const writeOutput = options.writeOutput ?? writeStdout;
  const lupin = readRequiredEnv(env, "LUPIN");
  const reviewOutput = readRequiredEnv(env, "REVIEW_OUTPUT");
  const githubOutput = readRequiredEnv(env, "GITHUB_OUTPUT");
  const directory = join(
    readRequiredEnv(env, "RUNNER_TEMP"),
    "review-previous",
  );

  const lookup = run({
    args: [
      "lineage",
      "fetch",
      readRequiredEnv(env, "PR_NUMBER"),
      "--repo",
      readRequiredEnv(env, "GITHUB_REPOSITORY"),
      "--workflow",
      WORKFLOW_FILE,
      "--output",
      directory,
    ],
    capture: true,
    command: lupin,
  });
  let previous: PreviousReview =
    lookup.status === 0
      ? parseLineage(lookup.stdout)
      : { found: false, reason: "lineage lookup failed" };

  if (previous.found) {
    const unreachable = previous.revisions.some(
      (revision) =>
        run({
          args: fetchRevisionArgs(revision),
          capture: false,
          command: "git",
        }).status !== 0,
    );
    if (unreachable) {
      previous = {
        found: false,
        reason: "previous review revisions are no longer reachable",
      };
    }
  }

  mkdirSync(reviewOutput, { recursive: true });
  writeFileSync(
    join(reviewOutput, "lineage.json"),
    `${JSON.stringify(previous)}\n`,
  );
  if (previous.found) {
    appendFileSync(githubOutput, `previous=${previous.directory}\n`);
    writeOutput(`Previous review supplied from ${previous.directory}.\n`);
  } else {
    writeOutput(`No previous review supplied: ${previous.reason}.\n`);
  }

  return previous;
}

/** Records whether the run saved a result and copies its GitHub summary into the job summary. */
export function result(options: LupinReviewOptions = {}): boolean {
  const env = options.env ?? process.env;
  const runDirectory = join(readRequiredEnv(env, "REVIEW_OUTPUT"), "run");
  const summaryPath = join(runDirectory, "delivery", "github.md");
  const present = existsSync(join(runDirectory, "review.json"));

  if (present) {
    appendFileSync(readRequiredEnv(env, "GITHUB_OUTPUT"), "present=true\n");
  }
  appendFileSync(
    readRequiredEnv(env, "GITHUB_STEP_SUMMARY"),
    existsSync(summaryPath)
      ? readFileSync(summaryPath, "utf8")
      : "Review did not produce a result. Inspect the review artifact and job logs.\n",
  );

  return present;
}

/**
 * Publishes feedback for a saved result, or the terminal status of a run without one. A failed
 * publication is recorded on the overview and fails the job.
 */
export function publish(options: LupinReviewOptions = {}): PublicationPlan {
  const env = options.env ?? process.env;
  const run = options.run ?? runCommand;
  const lupin = readRequiredEnv(env, "LUPIN");
  const runDirectory = join(readRequiredEnv(env, "REVIEW_OUTPUT"), "run");
  const target = [
    "--repo",
    readRequiredEnv(env, "GITHUB_REPOSITORY"),
    "--pr",
    readRequiredEnv(env, "PR_NUMBER"),
    "--run-url",
    readRequiredEnv(env, "RUN_URL"),
    "--attempt",
    readRequiredEnv(env, "GITHUB_RUN_ATTEMPT"),
  ];
  const status = (state: FailureState): void => {
    const posted = run({
      args: [
        "comment-status",
        ...target,
        "--state",
        state,
        "--output",
        runDirectory,
      ],
      capture: false,
      command: lupin,
    });
    if (posted.status !== 0) {
      throw new Error(`Lupin could not record the ${state} review status.`);
    }
  };

  const plan = planPublication({
    hasResult: existsSync(join(runDirectory, "review.json")),
    reviewResult: env.REVIEW_RESULT ?? "",
    runDirectory,
    startResult: env.START_RESULT ?? "",
  });
  if (plan.kind === "status") {
    status(plan.state);
    return plan;
  }

  const delivered = run({
    args: ["comment", plan.runDirectory, ...target, "--delivery", DELIVERY],
    capture: false,
    command: lupin,
  });
  if (delivered.status !== 0) {
    status("failed");
    throw new Error("Lupin could not publish the review feedback.");
  }

  return plan;
}

/** Dispatches to the requested mode. */
export function main(options: LupinReviewOptions = {}): void {
  const [mode] = options.argv ?? process.argv.slice(2);
  if (mode === "history") history(options);
  else if (mode === "result") result(options);
  else if (mode === "publish") publish(options);
  else {
    throw new Error(
      `Unknown mode "${mode ?? ""}". Usage: lupin-review.ts <history | result | publish>`,
    );
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
