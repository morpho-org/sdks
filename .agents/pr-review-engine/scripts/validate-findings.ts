#!/usr/bin/env node
/**
 * validate-findings.ts — apply the engine's deterministic finding filters.
 * Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node validate-findings.ts --findings findings.json --changed-lines cl.json
 *   echo '[...]' | node validate-findings.ts --changed-lines cl.json
 *
 * Implements:
 *   - WHAT/FIX schema check (Step 5 contract).
 *   - Line-level scope filter with ±15 tolerance (see references/calibration.md).
 *   - Markdown documentation-example filter (see references/scope-filter.md).
 *
 * Input: JSON array of findings on stdin (or --findings path) + path to the
 * changed-lines JSON map (--changed-lines).
 *
 * Output (stdout): JSON object
 *   {
 *     "kept":    [<finding + "snapped_line": <int>>, ...],  // snapped_line is the
 *                // nearest actual diff line for the finding (== line when the cited
 *                // line is itself a changed line; the matched changed line when the
 *                // finding sat within ±tolerance). It is the line a GitHub inline
 *                // comment must anchor on. Omitted for runtime/pure-rename/schema-only
 *                // keeps, which have no diff line to snap to.
 *     "dropped": [{"finding": <finding>, "drop_reason": "...",
 *                  "distance_to_nearest_changed_line": <int|null>}, ...],
 *     "counts":  {"out_of_scope": N, "pre_existing": N, "doc_example": N,
 *                 "schema": N},
 *     "failed":  [<finding>, ...]   // schema-fail findings — partial-failure path
 *   }
 *
 * Exit code: 0 on a produced result (caller inspects the JSON); 2 on CLI misuse.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LINE_TOLERANCE = 15; // see references/calibration.md

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

const FP_PATTERNS =
  /secret|api\s*key|token|password|_authtoken|eval\(|dangerouslysetinnerhtml|private\s*key|mnemonic/i;

const FENCE_RE = /^\s*(?:```|~~~)/;

// A literal empty array standing alone on a line — the calibrated agent output
// shape for a clean run. Deliberately strict: a markdown checkbox (`[ ] do the
// thing`) or any other whitespace-padded bracket pair must NOT qualify, or
// failure prose gets recovered as a clean zero-finding run.
const EMPTY_ARRAY_LINE_RE = /^\s*\[\]\s*$/m;

// Keys whose NAME declares failure or partiality: {"error": []} or
// {"partial_findings": [...]} IS the failure declaration — unwrapping it would
// launder a declared failure into a clean run.
const FAILURE_KEY_RE = /error|fail|partial|incomplete|truncat|skip/i;

const AGENT_ERROR_RE = /"agent_error"\s*:/;

type Severity = "critical" | "high" | "medium" | "low";

/** A finding that passed the schema check. Extra agent keys pass through. */
type ValidatedFinding = Record<string, unknown> & {
  severity: Severity;
  file: string;
  line: number;
  description: string;
  /** Nearest actual diff line — the anchor a GitHub inline comment must use.
   *  Set on diff-line keeps; absent for runtime/pure-rename/schema-only keeps. */
  snapped_line?: number;
};

type DropReason = "file-out-of-scope" | "line-pre-existing" | "doc-example-fp";

type DroppedFinding = {
  finding: ValidatedFinding;
  drop_reason: DropReason;
  distance_to_nearest_changed_line: number | null;
};

type Counts = {
  out_of_scope: number;
  pre_existing: number;
  doc_example: number;
  schema: number;
};

type ValidationResult = {
  kept: ValidatedFinding[];
  dropped: DroppedFinding[];
  counts: Counts;
  failed: unknown[];
};

type ErrorResult = { error: string };

type ReadFileText = (path: string) => string | null;

type ValidateOptions = {
  findingsText: string;
  changedLinesText: string;
  repoRoot: string;
  schemaOnly: boolean;
  lineTolerance: number;
  readFileText?: ReadFileText;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a file as UTF-8, returning null on any IO error (mirrors Python's errors="replace" tolerance). */
function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function schemaOk(finding: unknown): finding is ValidatedFinding {
  if (!isRecord(finding)) return false;
  const severity = finding.severity;
  if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity))
    return false;
  const file = finding.file;
  if (typeof file !== "string" || file === "") return false;
  const line = finding.line;
  // `file: "runtime", line: 0` is the runtime-validation sentinel for findings
  // that can't be pinned to a source line (dev-server boot failure, route-level
  // console error). It bypasses the line rule here and the scope filters below.
  if (file === "runtime") {
    if (typeof line !== "number" || !Number.isInteger(line) || line < 0)
      return false;
  } else if (typeof line !== "number" || !Number.isInteger(line) || line <= 0) {
    return false;
  }
  const desc = finding.description;
  if (typeof desc !== "string" || desc === "") return false;
  if (!desc.includes("WHAT:") || !desc.includes("FIX:")) return false;
  return true;
}

/**
 * Return the changed line nearest to `line` (the snap target), or null when the
 * set is empty. Ties resolve to the lower line (first encountered at equal
 * distance), which keeps the anchor inside the hunk above the cited line.
 */
export function nearestChangedLine(
  line: number,
  changedLines: readonly number[],
): number | null {
  let nearest: number | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const cl of changedLines) {
    const d = Math.abs(line - cl);
    if (d < best) {
      best = d;
      nearest = cl;
    }
  }
  return nearest;
}

/**
 * Distance from `line` to the nearest changed line, or null when the set is
 * empty. Derived from `nearestChangedLine` so the scan + tie-break live in one
 * place; the distance is the same regardless of the tie-break.
 */
export function distanceToNearest(
  line: number,
  changedLines: readonly number[],
): number | null {
  const nearest = nearestChangedLine(line, changedLines);
  return nearest === null ? null : Math.abs(line - nearest);
}

/**
 * Return true iff `line` (1-based) is inside a fenced code block. Walks lines
 * 1..(line-1) — a finding cited ON a fence line itself is treated as outside
 * the block, per the scope-filter contract. `lines` is the file already split.
 */
export function isInsideFence(lines: readonly string[], line: number): boolean {
  let fenceCount = 0;
  for (const raw of lines.slice(0, Math.max(line - 1, 0))) {
    if (FENCE_RE.test(raw)) fenceCount += 1;
  }
  return fenceCount % 2 === 1;
}

/**
 * The dict rules, in exactly one place (both the strict-parse and the
 * object-led branches route here — a one-sided amendment is how false-clean /
 * false-fail asymmetries are born):
 *   - the {"agent_error": ...} sentinel stays a failure;
 *   - a dict whose sole value is a list unwraps to that list — unless the sole
 *     key's own name signals failure/partiality (FAILURE_KEY_RE), in which case
 *     the dict IS the failure declaration and stays one;
 *   - anything else (sibling keys may be declaring failure) is returned as-is
 *     for the caller to reject toward agent-failed.
 */
function unwrapDict(d: Record<string, unknown>): unknown {
  const keys = Object.keys(d);
  if (!Object.hasOwn(d, "agent_error") && keys.length === 1) {
    const key = keys[0];
    if (key !== undefined) {
      const sole = d[key];
      if (Array.isArray(sole) && !FAILURE_KEY_RE.test(key)) return sole;
    }
  }
  return d;
}

/**
 * Parse agent output tolerantly. Agents are contracted to return a bare JSON
 * array, but models given verification-style context tend to wrap it in prose.
 * See references/scope-filter.md for the full rule set. Returns an array on
 * success; null or a non-array value (for the caller to reject) otherwise.
 */
export function parseFindingsText(text: string): unknown {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // leave parsed as null; fall through to the slice fallbacks
  }
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed)) return unwrapDict(parsed);
  // A prose-wrapped sentinel is still a declared failure — never mine it.
  if (AGENT_ERROR_RE.test(text)) return parsed;
  // Object-led wrapped payload: apply the dict rules to the outermost {...}
  // slice, and never fall through to the array slice — mining an embedded
  // array out of an object wrapper is the false-clean route.
  const ostart = text.indexOf("{");
  const astart = text.indexOf("[");
  if (ostart !== -1 && (astart === -1 || ostart < astart)) {
    const oend = text.lastIndexOf("}");
    let obj: unknown = null;
    if (oend > ostart) {
      try {
        obj = JSON.parse(text.slice(ostart, oend + 1));
      } catch {
        obj = null;
      }
    }
    if (isRecord(obj)) return unwrapDict(obj);
    return parsed;
  }
  const end = text.lastIndexOf("]");
  if (astart !== -1 && end > astart) {
    // Mirror of the object-led rule: an object trailing the accepted array
    // may be declaring failure — ambiguity rejects.
    if (text.indexOf("{", end + 1) !== -1) return parsed;
    let sliced: unknown = null;
    try {
      sliced = JSON.parse(text.slice(astart, end + 1));
    } catch {
      sliced = null;
    }
    if (Array.isArray(sliced)) {
      if (sliced.length > 0 && sliced.every((x) => isRecord(x))) return sliced;
      if (sliced.length === 0 && EMPTY_ARRAY_LINE_RE.test(text)) return [];
    }
  }
  return parsed;
}

function asLineList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === "number");
}

/** Normalize a finding's file path against the repo root (matches Step 6 rules). */
function normalizePath(file: string, repoRoot: string): string {
  let norm = file;
  if (norm.startsWith("./")) norm = norm.slice(2);
  if (norm.startsWith("a/") || norm.startsWith("b/")) norm = norm.slice(2);
  if (isAbsolute(norm)) {
    const rel = relative(resolve(repoRoot), norm);
    if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) norm = rel;
  }
  return norm;
}

/**
 * The functional core: takes the raw findings + changed-lines text and produces
 * the result object, or an {error} object for unrecoverable input. All filesystem
 * access goes through the injected `readFileText` so it is testable in isolation.
 */
export function validateFindingsFromText(
  opts: ValidateOptions,
): ValidationResult | ErrorResult {
  const readFileText = opts.readFileText ?? readFileSafe;

  const findings = parseFindingsText(opts.findingsText);
  if (findings === null || findings === undefined) {
    return { error: "invalid findings JSON: no parseable JSON array in input" };
  }
  if (!Array.isArray(findings)) {
    return { error: "findings must be a JSON array" };
  }

  let changedLinesMap: unknown;
  try {
    changedLinesMap = JSON.parse(opts.changedLinesText);
  } catch (e) {
    return {
      error: `invalid changed-lines JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!isRecord(changedLinesMap)) {
    return { error: "changed-lines must be a JSON object" };
  }

  const kept: ValidatedFinding[] = [];
  const dropped: DroppedFinding[] = [];
  const failed: unknown[] = [];
  const counts: Counts = {
    out_of_scope: 0,
    pre_existing: 0,
    doc_example: 0,
    schema: 0,
  };

  for (const finding of findings) {
    if (!schemaOk(finding)) {
      failed.push(finding);
      counts.schema += 1;
      continue;
    }

    if (opts.schemaOnly) {
      kept.push(finding);
      continue;
    }

    // Runtime-validation sentinel: not a source file, so the scope filters
    // don't apply. Keep as-is.
    if (finding.file === "runtime") {
      kept.push(finding);
      continue;
    }

    const norm = normalizePath(finding.file, opts.repoRoot);

    if (!Object.hasOwn(changedLinesMap, norm)) {
      dropped.push({
        finding,
        drop_reason: "file-out-of-scope",
        distance_to_nearest_changed_line: null,
      });
      counts.out_of_scope += 1;
      continue;
    }

    const changed = asLineList(changedLinesMap[norm]);
    // Short-circuit: empty set (pure rename) → keep regardless of line.
    if (changed.length === 0) {
      kept.push(finding);
      continue;
    }

    const line = finding.line;
    let dist = 0;
    // snapped_line is the anchor a GitHub inline comment must use. Default to
    // the cited line (already a changed line); when the finding sat within
    // tolerance of a changed line, snap to that nearest changed line instead.
    let snappedLine = line;
    if (!changed.includes(line)) {
      const d = distanceToNearest(line, changed);
      if (d === null || d > opts.lineTolerance) {
        dropped.push({
          finding,
          drop_reason: "line-pre-existing",
          distance_to_nearest_changed_line: d,
        });
        counts.pre_existing += 1;
        continue;
      }
      dist = d;
      const nearest = nearestChangedLine(line, changed);
      if (nearest !== null) snappedLine = nearest;
    }

    // Markdown documentation-example filter. `norm` derives from the
    // agent-emitted finding.file, so guard the read against path traversal:
    // confirm the resolved target stays within repoRoot before reading
    // (defense-in-depth — `norm` is already scope-filtered against the
    // git-produced changed-files set, which never yields a `..` path). A target
    // that escapes repoRoot skips the fence check (the finding is then kept).
    if (norm.endsWith(".md") && FP_PATTERNS.test(finding.description)) {
      const target = join(opts.repoRoot, norm);
      const rel = relative(resolve(opts.repoRoot), resolve(target));
      const withinRepo =
        rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
      const text = withinRepo ? readFileText(target) : null;
      if (text !== null && isInsideFence(text.split(/\r\n|\r|\n/), line)) {
        dropped.push({
          finding,
          drop_reason: "doc-example-fp",
          distance_to_nearest_changed_line: dist,
        });
        counts.doc_example += 1;
        continue;
      }
    }

    kept.push({ ...finding, snapped_line: snappedLine });
  }

  return { kept, dropped, counts, failed };
}

export class UsageError extends Error {}

type CliArgs = {
  findings?: string;
  changedLines: string;
  repoRoot: string;
  schemaOnly: boolean;
  lineTolerance: number;
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

  let findings: string | undefined;
  let changedLines: string | undefined;
  let repoRoot = process.cwd();
  let schemaOnly = false;
  let lineTolerance = LINE_TOLERANCE;

  for (; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--findings":
        findings = valueAt(arg);
        break;
      case "--changed-lines":
        changedLines = valueAt(arg);
        break;
      case "--repo-root":
        repoRoot = valueAt(arg);
        break;
      case "--schema-only":
        schemaOnly = true;
        break;
      case "--line-tolerance": {
        const value = valueAt(arg);
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
          throw new UsageError(
            `--line-tolerance must be an integer, got "${value}"`,
          );
        }
        lineTolerance = parsed;
        break;
      }
      default:
        throw new UsageError(`unknown argument: ${arg}`);
    }
  }

  if (changedLines === undefined)
    throw new UsageError("--changed-lines is required");
  return { findings, changedLines, repoRoot, schemaOnly, lineTolerance };
}

function emit(result: ValidationResult | ErrorResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function main(): number {
  let parsed: CliArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  let findingsText: string;
  if (parsed.findings !== undefined) {
    const text = readFileSafe(parsed.findings);
    if (text === null) {
      emit({ error: `cannot read findings file: ${parsed.findings}` });
      return 0;
    }
    findingsText = text;
  } else {
    // Reading fd 0 throws (EAGAIN) when stdin is a TTY with no piped input;
    // emit the structured-error contract instead of crashing with a stack trace.
    try {
      findingsText = readFileSync(0, "utf8");
    } catch {
      emit({ error: "cannot read findings from stdin" });
      return 0;
    }
  }

  const changedLinesText = readFileSafe(parsed.changedLines);
  if (changedLinesText === null) {
    emit({ error: `cannot read changed-lines file: ${parsed.changedLines}` });
    return 0;
  }

  emit(
    validateFindingsFromText({
      findingsText,
      changedLinesText,
      repoRoot: parsed.repoRoot,
      schemaOnly: parsed.schemaOnly,
      lineTolerance: parsed.lineTolerance,
    }),
  );
  return 0;
}

// Run only when executed directly (`node validate-findings.ts …`), not when this
// module is imported by a test for its exported helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
