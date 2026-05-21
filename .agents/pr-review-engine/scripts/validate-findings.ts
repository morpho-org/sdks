#!/usr/bin/env node
// Validate and scope-filter PR-review findings.
//
// Usage: node validate-findings.ts <findings.json> <changed-lines.json> [repo-root]
//   - findings.json: JSON array of `{ severity, file, line, description }`.
//   - changed-lines.json: output of build-changed-lines.ts.
//   - repo-root: defaults to `$PWD`. Used to resolve `.md` files for the
//     fenced-code-block filter.
//
// Emits JSON `{ kept, dropped, failed, counts }` on stdout.
// See:
//   .agents/pr-review-engine/references/calibration.md  — ±15 line tolerance rationale.
//   .agents/pr-review-engine/references/scope-filter.md — Markdown fence rule + normalization.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Severity ladder used everywhere downstream. */
export type Severity = "critical" | "high" | "medium" | "low";

/** Shape every persona must emit (§ Step 5 of pr-review-base.md). */
export interface Finding {
  readonly severity: Severity;
  readonly file: string;
  readonly line: number;
  readonly description: string;
}

/** Finding the scope filter dropped, tagged with the reason. */
export interface DroppedFinding extends Finding {
  readonly drop_reason:
    | "file_out_of_scope"
    | "line_pre_existing"
    | "doc_example_fp";
  readonly distance_to_nearest_changed_line?: number;
}

/** Malformed agent output — kept in the audit trail rather than silently
 *  dropped, so a missing WHAT:/FIX: clause or bad shape flows into
 *  FAILED_AGENTS at Step 6.2 of pr-review-base.md. */
export interface FailedFinding {
  readonly raw: unknown;
  readonly reason: string;
}

/** Output contract — consumed by pr-review-base.md Step 6 and rendered
 *  per-caller (gh comment / local terminal / ci /tmp). */
export interface ValidationResult {
  readonly kept: readonly Finding[];
  readonly dropped: readonly DroppedFinding[];
  readonly failed: readonly FailedFinding[];
  readonly counts: Readonly<Record<Severity, number>>;
}

/** Thrown when the inputs themselves are unparseable JSON or wrong shape.
 *  Per-finding malformations route to `failed[]` instead. */
export class FindingsParseError extends Error {
  override name = "FindingsParseError";
}

/** Tolerance window (in lines) for the adjacent-code rule.
 *  Findings within ±TOLERANCE of any changed line in the same file are
 *  kept; outside, they're dropped as pre-existing. Fixed engine constant
 *  — see references/calibration.md for the rationale. */
const TOLERANCE = 15;

const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];

function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

function validateShape(raw: unknown): Finding | { error: string } {
  if (typeof raw !== "object" || raw === null)
    return { error: "finding is not an object" };
  const f = raw as Record<string, unknown>;
  if (!isSeverity(f.severity))
    return { error: `severity must be one of ${SEVERITIES.join("|")}` };
  if (typeof f.file !== "string" || f.file.length === 0)
    return { error: "file must be a non-empty string" };
  if (typeof f.line !== "number" || !Number.isInteger(f.line) || f.line < 1) {
    return { error: "line must be a positive integer" };
  }
  if (typeof f.description !== "string" || f.description.length === 0) {
    return { error: "description must be a non-empty string" };
  }
  if (!f.description.includes("WHAT:"))
    return { error: 'description missing "WHAT:" clause' };
  if (!f.description.includes("FIX:"))
    return { error: 'description missing "FIX:" clause' };
  return {
    severity: f.severity,
    file: f.file,
    line: f.line,
    description: f.description,
  };
}

function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("a/") || s.startsWith("b/")) s = s.slice(2);
  return s;
}

function nearestChangedDistance(
  line: number,
  changed: readonly number[],
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const l of changed) {
    const d = Math.abs(l - line);
    if (d < min) min = d;
  }
  return min;
}

/** Find fenced code-block line ranges in a Markdown file body.
 *  Returns inclusive 1-indexed [start, end] pairs. Handles ` ``` ` and
 *  ` ~~~ ` fences; an unclosed fence is treated as extending to EOF. */
export function findFencedBlocks(
  content: string,
): readonly (readonly [number, number])[] {
  const lines = content.split("\n");
  const blocks: [number, number][] = [];
  let inFence = false;
  let fenceStart = 0;
  let fenceChar = "";
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i]!.replace(/^\s+/, "");
    const isFence = stripped.startsWith("```") || stripped.startsWith("~~~");
    if (!isFence) continue;
    const ch = stripped[0]!;
    if (!inFence) {
      inFence = true;
      fenceStart = i + 1;
      fenceChar = ch;
    } else if (ch === fenceChar) {
      blocks.push([fenceStart, i + 1]);
      inFence = false;
      fenceChar = "";
    }
  }
  if (inFence) blocks.push([fenceStart, lines.length]);
  return blocks;
}

function isLineInsideFence(
  line: number,
  blocks: readonly (readonly [number, number])[],
): boolean {
  for (const [start, end] of blocks) {
    if (line >= start && line <= end) return true;
  }
  return false;
}

export interface ValidateOptions {
  readonly repoRoot: string;
  readonly changedLines: Readonly<Record<string, readonly number[]>>;
}

/**
 * Apply the three-stage scope filter to a list of raw findings.
 *
 * Stages, in order:
 *   1. WHAT/FIX schema check → failed[]
 *   2. File-out-of-scope drop → dropped[] (reason: file_out_of_scope)
 *   3. Line-pre-existing drop (±TOLERANCE window) → dropped[]
 *      (reason: line_pre_existing, with distance_to_nearest_changed_line).
 *      Skipped when the file's changed-lines set is empty (pure rename).
 *   4. Markdown doc-example drop → dropped[] (reason: doc_example_fp)
 */
export function validateFindings(
  rawFindings: readonly unknown[],
  opts: ValidateOptions,
): ValidationResult {
  const kept: Finding[] = [];
  const dropped: DroppedFinding[] = [];
  const failed: FailedFinding[] = [];
  const fenceCache = new Map<string, readonly (readonly [number, number])[]>();

  for (const raw of rawFindings) {
    const shape = validateShape(raw);
    if ("error" in shape) {
      failed.push({ raw, reason: shape.error });
      continue;
    }
    const f = shape;
    const normalized = normalizePath(f.file);
    const changed = opts.changedLines[normalized];
    if (!changed) {
      dropped.push({ ...f, drop_reason: "file_out_of_scope" });
      continue;
    }
    if (changed.length > 0) {
      const distance = nearestChangedDistance(f.line, changed);
      if (distance > TOLERANCE) {
        dropped.push({
          ...f,
          drop_reason: "line_pre_existing",
          distance_to_nearest_changed_line: distance,
        });
        continue;
      }
    }
    if (normalized.endsWith(".md")) {
      let blocks = fenceCache.get(normalized);
      if (!blocks) {
        try {
          const content = readFileSync(
            resolve(opts.repoRoot, normalized),
            "utf8",
          );
          blocks = findFencedBlocks(content);
        } catch {
          blocks = [];
        }
        fenceCache.set(normalized, blocks);
      }
      if (isLineInsideFence(f.line, blocks)) {
        dropped.push({ ...f, drop_reason: "doc_example_fp" });
        continue;
      }
    }
    kept.push(f);
  }

  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of kept) counts[f.severity]++;
  return { kept, dropped, failed, counts };
}

function main(): void {
  const [findingsPath, changedLinesPath, repoRoot] = process.argv.slice(2);
  if (!findingsPath || !changedLinesPath) {
    process.stderr.write(
      "usage: validate-findings.ts <findings.json> <changed-lines.json> [repo-root]\n",
    );
    process.exit(2);
  }
  let findingsRaw: unknown;
  let changedLinesRaw: unknown;
  try {
    findingsRaw = JSON.parse(readFileSync(findingsPath, "utf8"));
  } catch (err) {
    throw new FindingsParseError(
      `failed to parse findings: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    changedLinesRaw = JSON.parse(readFileSync(changedLinesPath, "utf8"));
  } catch (err) {
    throw new FindingsParseError(
      `failed to parse changed-lines: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(findingsRaw)) {
    throw new FindingsParseError("findings file must contain a JSON array");
  }
  if (
    typeof changedLinesRaw !== "object" ||
    changedLinesRaw === null ||
    Array.isArray(changedLinesRaw)
  ) {
    throw new FindingsParseError(
      "changed-lines file must contain a JSON object",
    );
  }
  const result = validateFindings(findingsRaw, {
    repoRoot: repoRoot ?? process.cwd(),
    changedLines: changedLinesRaw as Record<string, readonly number[]>,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }
}
