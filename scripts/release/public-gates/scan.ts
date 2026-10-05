#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, matchesGlob, relative, sep } from "node:path";
import { parseArgs } from "node:util";

export const POLICY_PATH = "scripts/release/public-gates/scan-policy.json";

/** Text that must never reach the public repository or npm. */
export const RULES = {
  // Linear team keys of the morpho-labs workspace.
  "linear-key":
    /\b(?:APPS|API|CRTR|INTEG|MAR|MKT|PLA|PRO|ROU|SDK|SEC|VAU|VRM)-\d+\b/g,
  "linear-url": /\blinear\.app\b/g,
  "slack-url": /\b(?:[a-z0-9-]+\.)?slack\.com\b/g,
  "notion-url": /\bnotion\.(?:so|site)\b/g,
  "devin-session": /\b(?:app\.)?devin\.ai\/sessions\b/g,
  "internal-repo": /\bmorpho-org\/sdks-internal\b/g,
  "internal-host": /\b(?:[a-z0-9-]+\.)*internal\.morpho\.[a-z]+\b/g,
  "private-key": /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  "github-token":
    /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  "npm-token": /\bnpm_[A-Za-z0-9]{36}\b/g,
  "aws-key": /\bAKIA[0-9A-Z]{16}\b/g,
  "slack-token": /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  "anthropic-key": /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  "rpc-key":
    /\b(?:alchemy\.com\/v2\/[A-Za-z0-9_-]{20,}|infura\.io\/v3\/[0-9a-f]{32})\b/g,
} as const satisfies Record<string, RegExp>;

export type RuleId = keyof typeof RULES | "blocked-term";

/** One allowed occurrence: the same rule matching the same text in matching files. */
export interface ScanException {
  readonly path: string;
  readonly rule: RuleId;
  readonly match: string;
  readonly reason: string;
}

/** Content of `scan-policy.json`. Private: it never ships. */
export interface ScanPolicy {
  /** Case-insensitive terms such as unannounced partner or chain names. */
  readonly blockedTerms: readonly string[];
  readonly exceptions: readonly ScanException[];
}

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly rule: RuleId;
  readonly match: string;
}

export interface ScannedFile {
  readonly path: string;
  readonly content: Buffer;
}

/**
 * Checks that a policy is well formed, so a typo can't silently allow a leak.
 *
 * @param policy - Parsed `scan-policy.json`.
 * @returns The policy, typed.
 */
export function parsePolicy(policy: unknown): ScanPolicy {
  if (
    typeof policy !== "object" ||
    policy === null ||
    !("blockedTerms" in policy) ||
    !Array.isArray(policy.blockedTerms) ||
    !policy.blockedTerms.every(
      (term: unknown) => typeof term === "string" && term.trim() !== "",
    ) ||
    !("exceptions" in policy) ||
    !Array.isArray(policy.exceptions)
  ) {
    throw new Error(
      `"${POLICY_PATH}" needs a "blockedTerms" array of non-empty strings and an "exceptions" array.`,
    );
  }
  const seen = new Set<string>();
  for (const exception of policy.exceptions as unknown[]) {
    if (
      typeof exception !== "object" ||
      exception === null ||
      !["path", "rule", "match", "reason"].every(
        (key) =>
          key in exception &&
          typeof (exception as Record<string, unknown>)[key] === "string" &&
          (exception as Record<string, string>)[key]?.trim() !== "",
      )
    ) {
      throw new Error(
        `Every exception in "${POLICY_PATH}" needs a non-empty "path", "rule", "match" and "reason": ${JSON.stringify(exception)}.`,
      );
    }
    const { path, rule, match } = exception as ScanException;
    if (rule !== "blocked-term" && !(rule in RULES)) {
      throw new Error(`Exception for "${path}" names unknown rule "${rule}".`);
    }
    const id = JSON.stringify([path, rule, match]);
    if (seen.has(id)) {
      throw new Error(`Duplicate exception for "${match}" in "${path}".`);
    }
    seen.add(id);
  }
  return policy as ScanPolicy;
}

/**
 * Finds every rule match in text files. Binary files (with a NUL byte) are skipped.
 *
 * @param files - Files to scan.
 * @param blockedTerms - Extra case-insensitive terms to block.
 * @returns Matches, in file then line order.
 */
export function scanFiles(
  files: Iterable<ScannedFile>,
  blockedTerms: readonly string[] = [],
): Finding[] {
  const rules: [RuleId, RegExp][] = Object.entries(RULES) as [RuleId, RegExp][];
  if (blockedTerms.length > 0) {
    const escaped = blockedTerms.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    rules.push([
      "blocked-term",
      new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi"),
    ]);
  }

  const findings: Finding[] = [];
  for (const { path, content } of files) {
    if (content.includes(0)) continue;
    const lines = content.toString("utf8").split("\n");
    for (const [index, text] of lines.entries()) {
      for (const [rule, pattern] of rules) {
        for (const [match] of text.matchAll(pattern)) {
          findings.push({ path, line: index + 1, rule, match });
        }
      }
    }
  }
  return findings;
}

/**
 * Splits findings into blocking ones and allowed ones, and reports exceptions that
 * matched nothing so stale entries get removed.
 *
 * @param findings - Output of {@link scanFiles}.
 * @param exceptions - Allowed occurrences.
 * @returns Blocking findings and unused exceptions.
 */
export function applyExceptions(
  findings: readonly Finding[],
  exceptions: readonly ScanException[],
): { blocking: Finding[]; unused: ScanException[] } {
  const used = new Set<ScanException>();
  const blocking = findings.filter((finding) => {
    const exception = exceptions.find(
      ({ path, rule, match }) =>
        rule === finding.rule &&
        match === finding.match &&
        matchesGlob(finding.path, path),
    );
    if (exception) used.add(exception);
    return exception == null;
  });
  return {
    blocking,
    unused: exceptions.filter((exception) => !used.has(exception)),
  };
}

/**
 * Lists regular files under a directory, as POSIX paths relative to it. Symlinks
 * are skipped: the generator already checked their targets are in the tree.
 *
 * @param dir - Directory to walk.
 * @param prefix - Prefix for the reported paths.
 * @returns The files.
 */
export function readTree(dir: string, prefix = ""): ScannedFile[] {
  const files: ScannedFile[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        files.push({
          path: prefix + relative(dir, full).split(sep).join("/"),
          content: readFileSync(full),
        });
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * Reads every file in npm tarballs. Paths look like `<tarball>.tgz:package/...`.
 *
 * @param tarballs - Paths to `.tgz` files.
 * @returns The files.
 */
export function readTarballs(tarballs: readonly string[]): ScannedFile[] {
  const files: ScannedFile[] = [];
  for (const tarball of tarballs) {
    const dir = mkdtempSync(join(tmpdir(), "public-scan-"));
    try {
      execFileSync("tar", ["-xzf", tarball, "-C", dir, "--no-same-owner"]);
      files.push(...readTree(dir, `${basename(tarball)}:`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return files;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      tree: { type: "string" },
      tarballs: { type: "string" },
      policy: { type: "string", default: POLICY_PATH },
    },
  });
  if (!values.tree && !values.tarballs) {
    throw new Error(
      "Usage: scan.ts [--tree <dir>] [--tarballs <dir>] [--policy <file>]",
    );
  }
  const policy = parsePolicy(JSON.parse(readFileSync(values.policy, "utf8")));
  const files = [
    ...(values.tree ? readTree(values.tree) : []),
    ...(values.tarballs
      ? readTarballs(
          readdirSync(values.tarballs)
            .filter((name) => name.endsWith(".tgz"))
            .sort()
            .map((name) => join(values.tarballs as string, name)),
        )
      : []),
  ];
  const { blocking, unused } = applyExceptions(
    scanFiles(files, policy.blockedTerms),
    policy.exceptions,
  );
  for (const { path, line, rule, match } of blocking) {
    console.error(`${path}:${line}: ${rule}: ${JSON.stringify(match)}`);
  }
  // Stale exceptions only fail the tree scan: tarballs hold a subset of the tree.
  if (values.tree) {
    for (const { path, rule, match } of unused) {
      console.error(
        `Unused exception: ${rule} ${JSON.stringify(match)} in "${path}". Remove it from "${values.policy}".`,
      );
    }
  }
  if (blocking.length > 0 || (values.tree && unused.length > 0)) {
    process.exitCode = 1;
  } else {
    console.log(`Scanned ${files.length} files: nothing internal found.`);
  }
}
