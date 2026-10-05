#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, matchesGlob, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  type EntryLister,
  loadBundledTar,
} from "../../ci/verify-tarball-collisions.ts";

/** Default location of the scan policy, relative to the repository root. */
export const POLICY_PATH = "scripts/release/public-gates/scan-policy.json";

/** Text that must never reach the public repository or npm. */
const RULES = {
  // Linear team keys of the morpho-labs workspace.
  "linear-key":
    /\b(?:APPS|API|CRTR|INTEG|MAR|MKT|PLA|PRO|ROU|SDK|SEC|VAU|VRM)-\d+\b/gi,
  "linear-url": /\blinear\.app\b/gi,
  "slack-url": /\b(?:[a-z0-9-]+\.)?slack\.com\b/gi,
  "notion-url": /\bnotion\.(?:so|site)\b/gi,
  "devin-session": /\b(?:app\.)?devin\.ai\/sessions\b/gi,
  "internal-repo": /\bmorpho-org\/sdks-internal\b/gi,
  "internal-host": /\b(?:[a-z0-9-]+\.)*internal\.morpho\.[a-z]+\b/gi,
  "private-key": /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  "github-token":
    /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  "npm-token": /\bnpm_[A-Za-z0-9]{36}\b/g,
  "aws-key": /\bAKIA[0-9A-Z]{16}\b/g,
  "slack-token": /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  "anthropic-key": /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  // Wallet keys and mnemonics only next to a key-like name, since bare 32-byte
  // hex values (market ids, hashes) are everywhere. No leading boundary, so
  // prefixed names such as `DEPLOYER_PRIVATE_KEY` and `walletPrivateKey` match.
  "wallet-key":
    /(?:private[_-]?key|secret[_-]?key|pk)["'`]?\s*[:=]\s*["'`]?(?:0x)?[0-9a-f]{64}\b/gi,
  mnemonic:
    /(?:mnemonic|seed[_-]?phrase)["'`]?\s*[:=]\s*["'`]?[a-z]+(?:\s+[a-z]+){11,23}\b/gi,
  // Any scheme (`https`, `wss`, ...). A port followed by a block number
  // (`http://localhost:8545@19000000`) is a fork URL, and `${VAR}` is filled in
  // at run time.
  "url-credentials":
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"'`]+:(?!\d+@\d|\$\{)[^\s/@"'`]+@/gi,
  "rpc-key":
    /\b(?:alchemy\.com\/v2\/[A-Za-z0-9_-]{20,}|infura\.io\/v3\/[0-9a-f]{32})\b/g,
} as const satisfies Record<string, RegExp>;

type RuleId = keyof typeof RULES | "blocked-term";

/** One allowed occurrence: the same rule matching the same text in matching files. */
export interface ScanException {
  /** Glob (`matchesGlob`) over POSIX paths relative to the public tree root. */
  readonly path: string;
  /** Rule that must report the occurrence. */
  readonly rule: RuleId;
  /** Exact matched text. */
  readonly match: string;
  /** Why the occurrence may stay public. */
  readonly reason: string;
}

/** Content of `scan-policy.json`. Private: it never ships. */
export interface ScanPolicy {
  /** Case-insensitive terms such as unannounced partner or chain names. */
  readonly blockedTerms: readonly string[];
  readonly exceptions: readonly ScanException[];
}

/** One match of a rule: file, 1-based line, rule and matched text. */
export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly rule: RuleId;
  readonly match: string;
}

/** A file to scan: tree path, or `<tarball>.tgz:package/...` for a tarball entry. */
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
 * Finds every rule match in files. NUL bytes are dropped first, so UTF-16 text and
 * text inside binaries are still scanned.
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
      new RegExp(`(?<!\\w)(?:${escaped.join("|")})(?!\\w)`, "gi"),
    ]);
  }

  const findings: Finding[] = [];
  for (const { path, content } of files) {
    const text = content.includes(0)
      ? Buffer.from(content.filter((byte) => byte !== 0))
      : content;
    const lines = text.toString("utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      for (const [rule, pattern] of rules) {
        for (const [match] of line.matchAll(pattern)) {
          findings.push({ path, line: index + 1, rule, match });
        }
      }
    }
  }
  return findings;
}

/**
 * Splits findings into blocking ones and allowed ones, and reports exceptions that
 * matched nothing so stale entries get removed. Tarball findings
 * (`<tarball>.tgz:package/...`) always block, whatever the exception glob: an
 * excepted file must not ship to npm.
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
    if (finding.path.includes(".tgz:")) return true;
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
 * Reads every file in npm tarballs with npm's bundled node-tar, the parser npm
 * publish uses. Paths look like `<tarball>.tgz:package/...`.
 *
 * @param tarballs - Paths to `.tgz` files.
 * @param reader - node-tar; defaults to the copy bundled with npm.
 * @returns The files.
 * @throws If a tarball holds anything other than regular files and directories,
 * or yields no `package/package.json` (a reader that never reported its entries).
 */
export async function readTarballs(
  tarballs: readonly string[],
  reader: EntryLister = loadBundledTar(
    execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  ),
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for (const tarball of tarballs) {
    const irregular: string[] = [];
    let hasManifest = false;
    await reader.list({
      file: tarball,
      strict: true,
      onReadEntry: (entry) => {
        if (entry.type !== "File" && entry.type !== "OldFile") {
          if (entry.type !== "Directory") {
            irregular.push(`${entry.path} (${entry.type})`);
          }
          entry.resume();
          return;
        }
        if (entry.path === "package/package.json") hasManifest = true;
        const chunks: Buffer[] = [];
        entry.on("data", (chunk) => chunks.push(chunk));
        entry.on("end", () =>
          files.push({
            path: `${basename(tarball)}:${entry.path}`,
            content: Buffer.concat(chunks),
          }),
        );
      },
    });
    if (irregular.length > 0) {
      throw new Error(
        `"${tarball}" has entries that are not regular files: ${irregular.join(", ")}.`,
      );
    }
    if (!hasManifest) {
      throw new Error(`"${tarball}" has no package/package.json.`);
    }
  }
  return files;
}

/**
 * Decides the outcome of a scan run.
 *
 * @param result - Findings after exceptions, how many tree files and tarballs were
 * read (`undefined` when not requested), and the policy path for messages.
 * @returns The exit code and the lines to print.
 */
export function evaluate(result: {
  blocking: readonly Finding[];
  unused: readonly ScanException[];
  treeFiles?: number;
  tarballs?: number;
  scannedFiles: number;
  policyPath: string;
}): { exitCode: 0 | 1; errors: string[]; summary?: string } {
  const errors: string[] = [];
  if (result.treeFiles === 0) errors.push("The tree is empty.");
  if (result.tarballs === 0) errors.push("No .tgz files to scan.");
  for (const { path, line, rule, match } of result.blocking) {
    errors.push(`${path}:${line}: ${rule}: ${JSON.stringify(match)}`);
  }
  // Exceptions apply to tree findings only, so stale exceptions are reported on
  // tree scans only.
  if (result.treeFiles !== undefined) {
    for (const { path, rule, match } of result.unused) {
      errors.push(
        `Unused exception: ${rule} ${JSON.stringify(match)} in "${path}". Remove it from "${result.policyPath}".`,
      );
    }
  }
  if (errors.length > 0) return { exitCode: 1, errors };
  return {
    exitCode: 0,
    errors,
    summary: `Scanned ${result.scannedFiles} files: nothing internal found.`,
  };
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
  const treeFiles = values.tree ? readTree(values.tree) : undefined;
  const tarballs = values.tarballs
    ? readdirSync(values.tarballs)
        .filter((name) => name.endsWith(".tgz"))
        .sort()
        .map((name) => join(values.tarballs as string, name))
    : undefined;
  const files = [
    ...(treeFiles ?? []),
    ...(tarballs ? await readTarballs(tarballs) : []),
  ];
  const { blocking, unused } = applyExceptions(
    scanFiles(files, policy.blockedTerms),
    policy.exceptions,
  );
  const { exitCode, errors, summary } = evaluate({
    blocking,
    unused,
    treeFiles: treeFiles?.length,
    tarballs: tarballs?.length,
    scannedFiles: files.length,
    policyPath: values.policy,
  });
  for (const error of errors) console.error(error);
  if (summary) console.log(summary);
  process.exitCode = exitCode;
}
