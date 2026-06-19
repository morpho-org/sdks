#!/usr/bin/env node
/**
 * review-scope.ts — testable git-scope helpers for the review skills (feedback #31).
 * Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node review-scope.ts --to-https <remote-url>      # SSH->HTTPS rewrite for the fetch fallback
 *   node review-scope.ts --run-hash --base <merge-base>   # idempotency-cache run identity
 *
 * These two computations were each shipped with a real bug found only by review
 * (the SSH->HTTPS fetch fallback's URL handling, and the cache run-hash being
 * content-blind). Extracting their pure cores here puts them under `pnpm verify`
 * so a regression fails a gate instead of riding to production. Pure functions
 * are unit-tested; the CLI shells to git and is integration-tested against a
 * real fixture repo (the build-changed-lines.ts pattern).
 *
 * Exit code: 0 on success; 2 on CLI misuse.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * Rewrite a GitHub SSH remote to its HTTPS form so a fetch can retry over HTTPS
 * when the SSH agent is down. No-op for an already-HTTPS or non-GitHub remote
 * (returns the input unchanged), so the caller can pass any `origin` URL.
 */
export function toHttpsUrl(remoteUrl: string): string {
  const url = remoteUrl.trim();
  const scp = url.match(/^git@github\.com:(.+)$/); // git@github.com:owner/repo(.git)
  if (scp?.[1] !== undefined) return `https://github.com/${scp[1]}`;
  const ssh = url.match(/^ssh:\/\/git@github\.com\/(.+)$/); // ssh://git@github.com/owner/repo(.git)
  if (ssh?.[1] !== undefined) return `https://github.com/${ssh[1]}`;
  return url;
}

/**
 * The idempotency-cache run identity: a hash over (merge-base, head SHA, the
 * CONTENT of the uncommitted overlay). It MUST fold in the diff content, not a
 * `git status --porcelain` summary — porcelain is content-blind, so editing an
 * already-modified file would keep the same identity and falsely reuse stale
 * findings. merge-base + head SHA already pin the committed diff.
 */
export function runHash(parts: {
  mergeBase: string;
  headSha: string;
  diff: string;
}): string {
  const key = `${parts.mergeBase}\n${parts.headSha}\n${parts.diff}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export class UsageError extends Error {}

type Mode =
  | { kind: "to-https"; url: string }
  | { kind: "run-hash"; base: string };

export function parseArgs(argv: readonly string[]): Mode {
  const args = [...argv];
  if (args[0] === "--to-https") {
    const url = args[1];
    if (url === undefined)
      throw new UsageError("--to-https requires a remote URL");
    return { kind: "to-https", url };
  }
  if (args[0] === "--run-hash") {
    let base: string | undefined;
    for (let i = 1; i < args.length; i += 1) {
      if (args[i] === "--base") {
        base = args[i + 1];
        i += 1;
      }
    }
    if (base === undefined)
      throw new UsageError("--run-hash requires --base <merge-base>");
    return { kind: "run-hash", base };
  }
  throw new UsageError(
    "expected --to-https <url> or --run-hash --base <merge-base>",
  );
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main(): number {
  let mode: Mode;
  try {
    mode = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`review-scope: ${error.message}\n`);
      return 2;
    }
    throw error;
  }

  if (mode.kind === "to-https") {
    process.stdout.write(`${toHttpsUrl(mode.url)}\n`);
    return 0;
  }

  // run-hash: merge-base + current head SHA + the uncommitted overlay's content.
  const headSha = git(["rev-parse", "HEAD"]).trim();
  const diff = git(["diff", "HEAD"]);
  process.stdout.write(`${runHash({ mergeBase: mode.base, headSha, diff })}\n`);
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (isMain) process.exit(main());
