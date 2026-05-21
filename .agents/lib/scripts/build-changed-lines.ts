#!/usr/bin/env node
// Build the CHANGED_LINES map from a unified=0 diff.
//
// Usage:
//   git diff --unified=0 <base>..<head> | node build-changed-lines.ts
//   git diff --unified=0 HEAD          | node build-changed-lines.ts
//
//   - Reads a unified=0 diff from stdin and parses it.
//   - Emits JSON `{ "<path>": [<line>, ...] }` on stdout.
//
// Edge cases (see .agents/references/changed-lines.md):
//   - Deletion-only hunks (`+0`): produce no entries for that file's hunk.
//   - Pure renames: file appears in the map with an empty `[]` array
//     (line-level filter must short-circuit on empty sets in
//     validate-findings.ts).
//   - File deletions (`+++ /dev/null`): file does NOT appear in the map
//     (no surviving lines to scope findings against).
//
// Authoritative behavior — do not duplicate this parser in agent prose.

/** A map from changed-file path (POSIX, relative to repo root) to the
 *  sorted unique list of line numbers the diff added on the `+` side. */
export type ChangedLinesMap = Readonly<Record<string, readonly number[]>>;

/** Thrown when a unified=0 diff cannot be parsed deterministically.
 *  See AGENTS.md §2 (typed errors) and §3 (preserve `cause`). */
export class DiffParseError extends Error {
  override name = "DiffParseError";
  readonly offendingLine: string | undefined;
  constructor(message: string, offendingLine?: string) {
    super(message);
    this.offendingLine = offendingLine;
  }
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const FILE_NEW_RE = /^\+\+\+ b\/(.+)$/;
const FILE_DELETED_RE = /^\+\+\+ \/dev\/null$/;
const RENAME_TO_RE = /^rename to (.+)$/;
const DIFF_GIT_RE = /^diff --git a\/(.+) b\/(.+)$/;

/**
 * Parse a unified=0 diff and return its CHANGED_LINES map.
 *
 * Pure function — no I/O. Consumed by the CLI wrapper below and by the
 * Phase 5 invariant test, which smoke-tests with inline fixtures.
 */
export function buildChangedLines(diffText: string): ChangedLinesMap {
  const result: Record<string, number[]> = {};
  let currentFile: string | null = null;
  let pendingDiffPath: string | null = null;

  for (const line of diffText.split("\n")) {
    const diffGitMatch = line.match(DIFF_GIT_RE);
    if (diffGitMatch) {
      pendingDiffPath = diffGitMatch[2] ?? null;
      currentFile = null;
      continue;
    }
    const renameMatch = line.match(RENAME_TO_RE);
    if (renameMatch && pendingDiffPath) {
      // Pure rename: emit an empty array so the line-filter short-circuits.
      result[renameMatch[1]!] ??= [];
      continue;
    }
    const fileNewMatch = line.match(FILE_NEW_RE);
    if (fileNewMatch) {
      currentFile = fileNewMatch[1]!;
      result[currentFile] ??= [];
      continue;
    }
    if (FILE_DELETED_RE.test(line)) {
      currentFile = null;
      continue;
    }
    if (!currentFile) continue;
    const hunkMatch = line.match(HUNK_RE);
    if (hunkMatch) {
      const start = Number.parseInt(hunkMatch[1]!, 10);
      const count =
        hunkMatch[2] === undefined ? 1 : Number.parseInt(hunkMatch[2]!, 10);
      if (!Number.isFinite(start) || !Number.isFinite(count)) {
        throw new DiffParseError(`malformed hunk header`, line);
      }
      // count === 0 means deletion-only: no `+` lines added.
      for (let i = 0; i < count; i++) result[currentFile]!.push(start + i);
    }
  }

  const sorted: Record<string, number[]> = {};
  for (const [path, lines] of Object.entries(result)) {
    sorted[path] = Array.from(new Set(lines)).sort((a, b) => a - b);
  }
  return sorted;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const diffText = Buffer.concat(chunks).toString("utf8");
  const result = buildChangedLines(diffText);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
