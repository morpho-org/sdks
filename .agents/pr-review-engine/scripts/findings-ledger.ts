#!/usr/bin/env node
/**
 * findings-ledger.ts — persist a per-PR/branch findings ledger so re-runs are
 * stateful (feedback #19). Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node findings-ledger.ts --ledger <path> --findings findings.json --head-sha <sha> [--run-hash <h>] [--write]
 *   echo '[...]' | node findings-ledger.ts --ledger <path> --head-sha <sha> --write
 *   node findings-ledger.ts --ledger <path> --check-cache --run-hash <h>   # idempotency cache (feedback #23)
 *
 * The ledger is review *state*, not repo content: callers store it OUTSIDE the
 * repo under review (default `~/.claude/facets/reviews/<owner>-<repo>-<key>.json`,
 * override the dir with FACETS_LEDGER_DIR) so it never trips a clean-tree guard.
 *
 * Functional core / imperative shell: `mergeLedger` is a pure function over plain
 * data; all filesystem access is injected (loadLedger/saveLedger take an IO fn),
 * so the merge logic is testable without touching disk.
 *
 * Identity: a finding's stable `id` is hash(file | normalized WHAT-clause),
 * deliberately NOT including the line (which drifts as code above it changes) or
 * the full description (which an LLM rephrases). The same logical finding matches
 * across runs (and the same finding raised by two agents collapses to one entry —
 * the engine already de-dupes its FINDINGS); full rephrasing of the WHAT clause
 * is the known limit.
 *
 * Output (stdout): JSON object
 *   {
 *     "net_new":    [<entry>, ...],   // ids not previously in the ledger (or re-opened)
 *     "recurring":  [<entry>, ...],   // ids already open in the ledger
 *     "resolved":   [<entry>, ...],   // ledger entries that were open but absent this run
 *     "suppressed": [<entry>, ...],   // ids the ledger marks wontfix (kept out of surfaced output)
 *     "ledger":     {"findings": [<entry>, ...], "last_run": {...}}   // updated ledger (persisted iff --write)
 *   }
 *
 * With --run-hash, the merge stamps `ledger.last_run = { hash, head_sha }` (the
 * run's input identity, computed by the caller as a digest of merge-base + head
 * SHA + worktree porcelain). With --check-cache, output is instead
 *   { "cache_hit": <bool>, "head_sha": <stored|null>, "findings": [<open entry>...],
 *     "counts": {critical,high,medium,low} }
 * so a caller can short-circuit the agent panel and reprint the cached review
 * when the input is byte-identical to the last run.
 *
 * Exit code: 0 on a produced result; 2 on CLI misuse.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const VALID_STATUSES = new Set(["open", "resolved", "wontfix"]);

type Severity = "critical" | "high" | "medium" | "low";
type Status = "open" | "resolved" | "wontfix";

/** A finding as produced by validate-findings (extra keys pass through). */
type InputFinding = {
  severity: Severity;
  file: string;
  line: number;
  description: string;
};

type LedgerEntry = {
  id: string;
  file: string;
  line: number;
  severity: Severity;
  description: string;
  status: Status;
  first_seen_sha: string;
  last_seen_sha: string;
  posted_comment_id: number | null;
};

/** The last review's input identity — `hash` over (merge-base, head SHA, worktree porcelain), computed by the caller. Lets a re-run short-circuit when nothing changed (feedback #23). */
type LastRun = { hash: string; head_sha: string };

type Ledger = { findings: LedgerEntry[]; last_run?: LastRun };

type MergeResult = {
  net_new: LedgerEntry[];
  recurring: LedgerEntry[];
  resolved: LedgerEntry[];
  suppressed: LedgerEntry[];
  ledger: Ledger;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract the WHAT-clause text (the stable problem statement) or fall back to the whole description. */
export function whatClause(description: string): string {
  const match = description.match(/WHAT:\s*(.*?)(?:FIX:|$)/is);
  const captured = match?.[1];
  if (captured !== undefined && captured.trim() !== "") return captured;
  return description;
}

/** Lowercase, collapse every run of non-alphanumerics to a single space, trim. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Stable id for a finding: hash(file | normalized WHAT). Line and FIX are excluded (they drift). */
export function findingId(finding: {
  file: string;
  description: string;
}): string {
  const key = `${finding.file} :: ${normalize(whatClause(finding.description))}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function isValidEntry(value: unknown): value is LedgerEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.file === "string" &&
    typeof value.line === "number" &&
    typeof value.severity === "string" &&
    VALID_SEVERITIES.has(value.severity) &&
    typeof value.description === "string" &&
    typeof value.status === "string" &&
    VALID_STATUSES.has(value.status) &&
    typeof value.first_seen_sha === "string" &&
    typeof value.last_seen_sha === "string"
  );
}

/** Parse ledger JSON text into a Ledger, dropping malformed entries. Returns an empty ledger on unparseable input. */
export function parseLedger(text: string): Ledger {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { findings: [] };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.findings))
    return { findings: [] };
  const findings = parsed.findings.filter(isValidEntry).map((entry) => ({
    ...entry,
    posted_comment_id:
      typeof entry.posted_comment_id === "number"
        ? entry.posted_comment_id
        : null,
  }));
  const ledger: Ledger = { findings };
  const lastRun = parsed.last_run;
  if (
    isRecord(lastRun) &&
    typeof lastRun.hash === "string" &&
    typeof lastRun.head_sha === "string"
  ) {
    ledger.last_run = { hash: lastRun.hash, head_sha: lastRun.head_sha };
  }
  return ledger;
}

/** True iff `runHash` is non-empty and matches the ledger's last recorded run — i.e. the review input is byte-identical to the cached run. */
export function isCacheHit(ledger: Ledger, runHash: string): boolean {
  return runHash !== "" && ledger.last_run?.hash === runHash;
}

/** The reusable kept findings from a cached run: the entries still `open` (wontfix + resolved are excluded, matching a live review's surfaced set). */
export function openFindings(ledger: Ledger): LedgerEntry[] {
  return ledger.findings.filter((entry) => entry.status === "open");
}

/** Severity tally for a findings list (the cached counts a short-circuited review reprints). */
export function severityCounts(
  findings: readonly { severity: Severity }[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

type CacheResult = {
  cache_hit: boolean;
  head_sha: string | null;
  findings: LedgerEntry[];
  counts: Record<Severity, number>;
};

/** The cache-check envelope the caller branches on (Step 2c). Pure: a hit returns the reusable open findings + their counts; a miss returns an empty set. */
export function buildCacheResult(ledger: Ledger, runHash: string): CacheResult {
  const hit = isCacheHit(ledger, runHash);
  const findings = hit ? openFindings(ledger) : [];
  return {
    cache_hit: hit,
    head_sha: ledger.last_run?.head_sha ?? null,
    findings,
    counts: severityCounts(findings),
  };
}

/** True when `text` is non-empty but does NOT parse to a `{findings: [...]}` shape — i.e. corrupt/truncated, not legitimately empty. */
export function isCorruptLedgerText(text: string): boolean {
  if (text.trim() === "") return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return !isRecord(parsed) || !Array.isArray(parsed.findings);
  } catch {
    return true;
  }
}

/**
 * Merge a fresh review's findings into the prior ledger. Pure: clones every
 * entry, never mutates the input ledger or findings.
 *
 *  - id already open       -> recurring (refresh line/severity/description + last_seen)
 *  - id marked wontfix     -> suppressed (kept in ledger, kept OUT of surfaced output)
 *  - id resolved, reappears-> re-opened, counted as recurring
 *  - id unseen before      -> net_new (status open, first_seen = last_seen = headSha)
 *  - open id absent now    -> resolved (wontfix entries are never auto-resolved)
 */
export function mergeLedger(opts: {
  ledger: Ledger;
  findings: readonly InputFinding[];
  headSha: string;
  runHash?: string;
}): MergeResult {
  const { headSha } = opts;
  const byId = new Map<string, LedgerEntry>();
  for (const entry of opts.ledger.findings) byId.set(entry.id, { ...entry });

  const netNew: LedgerEntry[] = [];
  const recurring: LedgerEntry[] = [];
  const suppressed: LedgerEntry[] = [];
  const seen = new Set<string>();

  for (const finding of opts.findings) {
    const id = findingId(finding);
    if (seen.has(id)) continue; // de-dupe identical findings within one run
    seen.add(id);

    const existing = byId.get(id);
    if (existing === undefined) {
      const entry: LedgerEntry = {
        id,
        file: finding.file,
        line: finding.line,
        severity: finding.severity,
        description: finding.description,
        status: "open",
        first_seen_sha: headSha,
        last_seen_sha: headSha,
        posted_comment_id: null,
      };
      byId.set(id, entry);
      netNew.push(entry);
      continue;
    }

    existing.line = finding.line;
    existing.severity = finding.severity;
    existing.description = finding.description;
    existing.last_seen_sha = headSha;
    if (existing.status === "wontfix") {
      suppressed.push(existing);
    } else {
      existing.status = "open";
      recurring.push(existing);
    }
  }

  const resolved: LedgerEntry[] = [];
  for (const entry of byId.values()) {
    if (!seen.has(entry.id) && entry.status === "open") {
      entry.status = "resolved";
      entry.last_seen_sha = headSha;
      resolved.push(entry);
    }
  }

  const newLedger: Ledger = { findings: [...byId.values()] };
  // Stamp this run's identity when given; otherwise carry the prior one forward
  // so a merge that doesn't supply a hash doesn't wipe the cache marker.
  if (opts.runHash !== undefined)
    newLedger.last_run = { hash: opts.runHash, head_sha: headSha };
  else if (opts.ledger.last_run !== undefined)
    newLedger.last_run = opts.ledger.last_run;

  return {
    net_new: netNew,
    recurring,
    resolved,
    suppressed,
    ledger: newLedger,
  };
}

type ReadFileText = (path: string) => string | null;
type WriteFileText = (path: string, text: string) => void;

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function writeFileMkdir(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  // Atomic: write a sibling temp then rename (same-dir rename is atomic), so a
  // crash mid-write can't leave a truncated ledger that the next run would treat
  // as corrupt and overwrite — losing the operator's wontfix marks.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * Load a ledger via the injected reader. A missing file (null) is a legitimately
 * empty ledger and stays silent; a file that is PRESENT but unparseable warns to
 * stderr before falling back to empty — overwriting it on a subsequent --write
 * would otherwise silently wipe the operator's `wontfix` marks.
 */
export function loadLedger(
  path: string,
  readFile: ReadFileText = readFileSafe,
): Ledger {
  const text = readFile(path);
  if (text === null) return { findings: [] };
  if (isCorruptLedgerText(text)) {
    process.stderr.write(
      `findings-ledger: ledger at ${path} is present but unreadable; starting from empty — wontfix marks will be lost if this run writes.\n`,
    );
  }
  return parseLedger(text);
}

/** Persist a ledger as pretty JSON via the injected writer. */
export function saveLedger(opts: {
  path: string;
  ledger: Ledger;
  writeFile?: WriteFileText;
}): void {
  const writeFile = opts.writeFile ?? writeFileMkdir;
  writeFile(opts.path, `${JSON.stringify(opts.ledger, null, 2)}\n`);
}

/** Filter an unknown value to the well-formed findings it contains (the input boundary). */
export function asFindingArray(value: unknown): InputFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is InputFinding =>
      isRecord(item) &&
      typeof item.file === "string" &&
      typeof item.line === "number" &&
      typeof item.severity === "string" &&
      VALID_SEVERITIES.has(item.severity) &&
      typeof item.description === "string",
  );
}

export class UsageError extends Error {}

type CliArgs = {
  ledger: string;
  findings?: string;
  headSha?: string;
  write: boolean;
  runHash?: string;
  checkCache: boolean;
};

export function parseArgs(argv: readonly string[]): CliArgs {
  const args = [...argv];
  let i = 0;
  const valueAt = (flag: string): string => {
    const value = args[i + 1];
    if (value === undefined) throw new UsageError(`${flag} requires a value`);
    i += 1;
    return value;
  };

  let ledger: string | undefined;
  let findings: string | undefined;
  let headSha: string | undefined;
  let write = false;
  let runHash: string | undefined;
  let checkCache = false;

  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--ledger") ledger = valueAt("--ledger");
    else if (arg === "--findings") findings = valueAt("--findings");
    else if (arg === "--head-sha") headSha = valueAt("--head-sha");
    else if (arg === "--run-hash") runHash = valueAt("--run-hash");
    else if (arg === "--write") write = true;
    else if (arg === "--check-cache") checkCache = true;
    else throw new UsageError(`unknown argument: ${arg}`);
  }

  if (ledger === undefined) throw new UsageError("--ledger is required");
  if (checkCache) {
    if (runHash === undefined)
      throw new UsageError("--check-cache requires --run-hash");
  } else if (headSha === undefined) {
    throw new UsageError("--head-sha is required");
  }
  return { ledger, findings, headSha, write, runHash, checkCache };
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main(): number {
  let cli: CliArgs;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`findings-ledger: ${error.message}\n`);
      return 2;
    }
    throw error;
  }

  const ledger = loadLedger(cli.ledger);

  // Cache-check mode: report whether the run hash matches the cached run, and
  // hand back the reusable open findings so the caller can short-circuit the
  // agent panel on an unchanged re-run (feedback #23). No findings input needed.
  if (cli.checkCache) {
    process.stdout.write(
      `${JSON.stringify(buildCacheResult(ledger, cli.runHash ?? ""))}\n`,
    );
    return 0;
  }

  if (cli.headSha === undefined) {
    process.stderr.write("findings-ledger: --head-sha is required\n");
    return 2;
  }

  const findingsText =
    cli.findings !== undefined
      ? (readFileSafe(cli.findings) ?? "")
      : readStdin();
  let parsedFindings: unknown;
  try {
    parsedFindings = JSON.parse(findingsText);
  } catch {
    parsedFindings = [];
  }
  const findings = asFindingArray(parsedFindings);

  const result = mergeLedger({
    ledger,
    findings,
    headSha: cli.headSha,
    runHash: cli.runHash,
  });
  if (cli.write) saveLedger({ path: cli.ledger, ledger: result.ledger });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (isMain) process.exit(main());
