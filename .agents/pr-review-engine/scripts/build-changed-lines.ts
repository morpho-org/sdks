#!/usr/bin/env node
/**
 * build-changed-lines.ts — produce a JSON map { "<path>": [<lines>] } from
 * `git diff --unified=0` hunk headers. Used by pr-review-engine Step 3.
 * Run with Node's native TypeScript support (Node >= 22.18):
 *
 *   node build-changed-lines.ts --base <merge-base> --head <ref>
 *   node build-changed-lines.ts --base <merge-base> --head <ref> --include-uncommitted
 *
 * Rules: see references/changed-lines.md. Output: compact JSON to stdout.
 *
 * Handles deletion-only hunks (count==0 → anchor at the new-file line above the
 * deletion) and pure renames (no hunks → empty set, but the path still appears
 * as a key, discovered via `git diff --diff-filter=R`). Renames are read as raw
 * bytes (`git diff -z`) and split on the NUL separator so multi-rename paths
 * survive — the original reason this logic lived in Python rather than bash
 * (macOS bash 3.2 strips NUL bytes from command substitution).
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Parse `git diff --unified=0` output into { path: [new-file line numbers] }.
 * A file seen via its `+++ ` header is always present as a key (empty array if
 * it has no hunks). Pure port of the awk parser the bash script used to carry.
 */
export function parseDiff(diffText: string): Record<string, number[]> {
  const files: Record<string, number[]> = {};
  let file = "";

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      // Extract the new-file path. "/dev/null" is a deletion (no new path);
      // otherwise strip the "b/" prefix git adds.
      let path = line.slice(4);
      if (path === "/dev/null") {
        file = "";
        continue;
      }
      if (path.startsWith("b/")) path = path.slice(2);
      file = path;
      if (!(file in files)) files[file] = [];
      continue;
    }

    if (line.startsWith("@@ ") && file !== "") {
      // Find the "+NEW,COUNT" token; COUNT defaults to 1 when omitted.
      const newPart =
        line
          .split(" ")
          .find((p) => p.startsWith("+"))
          ?.slice(1) ?? "";
      const [startText, countText] = newPart.split(",");
      const newStart = Number.parseInt(startText ?? "", 10) || 0;
      const newCount =
        countText === undefined ? 1 : Number.parseInt(countText, 10) || 0;

      const lines = files[file] ?? [];
      if (newCount === 0) {
        // Deletion-only hunk: anchor at the new-file line just above the
        // removed block, clamped to >= 1.
        lines.push(newStart < 1 ? 1 : newStart);
      } else {
        for (let j = 0; j < newCount; j += 1) lines.push(newStart + j);
      }
      files[file] = lines;
    }
  }

  return files;
}

type MergeInput = {
  committed: Record<string, number[]>;
  uncommitted: Record<string, number[]>;
  renamed: readonly string[];
};

/**
 * Union the committed + uncommitted maps (set semantics per path) and add any
 * renamed paths as keys (empty set if they carried no hunks). Returns each
 * path's lines sorted ascending.
 */
export function mergeChangedLines(input: MergeInput): Record<string, number[]> {
  const merged = new Map<string, Set<number>>();
  for (const src of [input.committed, input.uncommitted]) {
    for (const [path, lines] of Object.entries(src)) {
      const set = merged.get(path) ?? new Set<number>();
      for (const line of lines) set.add(line);
      merged.set(path, set);
    }
  }
  for (const path of input.renamed) {
    if (!merged.has(path)) merged.set(path, new Set());
  }

  const out: Record<string, number[]> = {};
  for (const [path, set] of merged) {
    out[path] = [...set].sort((a, b) => a - b);
  }
  return out;
}

function gitText(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
}

/**
 * NEW-side paths from a rename-only `git diff` view. Reads raw bytes so the NUL
 * separators from `-z` survive (bash command substitution cannot carry NULs).
 */
function getRenames(range: string): string[] {
  const buf = execFileSync(
    "git",
    ["diff", "-z", "--name-only", "--diff-filter=R", range],
    {
      maxBuffer: MAX_BUFFER,
    },
  );
  return buf
    .toString("utf8")
    .split("\0")
    .filter((p) => p !== "");
}

export class UsageError extends Error {}

type CliArgs = { base: string; head: string; includeUncommitted: boolean };

export function parseArgs(argv: readonly string[]): CliArgs {
  const args = [...argv];
  let base: string | undefined;
  let head: string | undefined;
  let includeUncommitted = false;

  let i = 0;
  const valueAt = (flag: string): string => {
    const value = args[i + 1];
    if (value === undefined) throw new UsageError(`${flag} requires a value`);
    i += 1;
    return value;
  };

  for (; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--base":
        base = valueAt(arg);
        break;
      case "--head":
        head = valueAt(arg);
        break;
      case "--include-uncommitted":
        includeUncommitted = true;
        break;
      default:
        throw new UsageError(`unknown argument: ${arg}`);
    }
  }

  if (base === undefined || head === undefined) {
    throw new UsageError("--base and --head are required");
  }
  return { base, head, includeUncommitted };
}

function main(): number {
  let parsed: CliArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`build-changed-lines.ts: ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const range = `${parsed.base}..${parsed.head}`;
  const committed = parseDiff(gitText(["diff", "--unified=0", range]));
  const uncommitted = parsed.includeUncommitted
    ? parseDiff(gitText(["diff", "--unified=0", "HEAD"]))
    : {};
  const renamed = [
    ...getRenames(range),
    ...(parsed.includeUncommitted ? getRenames("HEAD") : []),
  ];

  const merged = mergeChangedLines({ committed, uncommitted, renamed });
  process.stdout.write(`${JSON.stringify(merged)}\n`);
  return 0;
}

// Run only when executed directly, not when imported by a test for its helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
