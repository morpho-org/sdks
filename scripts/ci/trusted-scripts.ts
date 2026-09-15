/**
 * Trusted-copy integrity for the Claude review workflow.
 *
 * The workflow snapshots `scripts/` from the default-branch checkout into `$RUNNER_TEMP` before
 * Claude runs, then executes the post-Claude gate and scrubber from that copy. `snapshot` makes the
 * copy and records a digest of it plus the absolute path of the node binary running it as step
 * outputs (runner-held state Claude's subprocesses cannot rewrite); `verify` recomputes the digest
 * and fails if any file was added, removed, or changed since. `verify` itself
 * runs from the trusted copy, so this is defense in depth against accidental or careless edits by
 * Claude's session, not a boundary against a process that already controls the runner user.
 *
 * The digest is a SHA-256 over `"<relative path>\0<sha256(content)>\n"` entries sorted by path, so
 * it is independent of directory-walk order and of the shell tools available on the runner.
 *
 *   node scripts/ci/trusted-scripts.ts snapshot <src> <dest>     # copies, appends node_bin= and digest= to GITHUB_OUTPUT
 *   node scripts/ci/trusted-scripts.ts verify <dir> <expected>   # exits 1 when the digest differs
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { readRequiredEnv, sanitizeAnnotation } from "./workflow.ts";

interface RunOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  /** Overrides the recorded node binary path (defaults to `process.execPath`). */
  readonly nodeBin?: string;
  /** Overrides `GITHUB_OUTPUT` for tests. */
  readonly outputFile?: string;
  readonly writeOutput?: (message: string) => void;
}

/** Lists every regular file under `dir`, as `/`-separated paths relative to `dir`, sorted. */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

/** Computes the order-independent content digest of every file under `dir`. */
export function digestDirectory(dir: string): string {
  const hash = createHash("sha256");
  for (const file of listFiles(dir)) {
    const content = createHash("sha256")
      .update(readFileSync(join(dir, file)))
      .digest("hex");
    hash.update(`${file}\0${content}\n`);
  }

  return hash.digest("hex");
}

/**
 * Copies `src` to a fresh `dest`, then records `node_bin` (the interpreter running this script) and
 * the `digest` of the copy as step outputs.
 */
export function snapshot(
  { dest, src }: { readonly dest: string; readonly src: string },
  options: RunOptions = {},
): string {
  const env = options.env ?? process.env;
  if (existsSync(dest)) {
    throw new Error(`Refusing to snapshot into existing path ${dest}.`);
  }
  cpSync(src, dest, { recursive: true });
  const digest = digestDirectory(dest);
  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `node_bin=${options.nodeBin ?? process.execPath}\ndigest=${digest}\n`,
  );

  return digest;
}

/** Throws when the current digest of `dir` differs from the snapshot digest. */
export function verify(dir: string, expected: string): void {
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error(
      `Invalid expected digest "${expected}". Expected a 64-character hex SHA-256.`,
    );
  }
  const actual = digestDirectory(dir);
  if (actual !== expected) {
    throw new Error(
      `Trusted scripts in ${dir} were modified after the snapshot (expected ${expected}, got ${actual}).`,
    );
  }
}

/** CLI dispatcher: `snapshot <src> <dest>` or `verify <dir> <expected>`. */
export function main(options: RunOptions = {}): void {
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? defaultWriteOutput;
  const [mode, first, second] = argv;
  if (!first || !second) {
    throw new Error(
      "Usage: trusted-scripts.ts snapshot <src> <dest> | verify <dir> <expected>",
    );
  }

  switch (mode) {
    case "snapshot": {
      const digest = snapshot({ dest: second, src: first }, options);
      writeOutput(`Trusted scripts copied to ${second} (digest ${digest}).\n`);
      return;
    }
    case "verify": {
      verify(first, second);
      writeOutput(`Trusted scripts in ${first} match the snapshot.\n`);
      return;
    }
    default:
      throw new Error(
        `Unknown mode "${mode ?? ""}". Expected "snapshot" or "verify".`,
      );
  }
}

function defaultWriteOutput(message: string): void {
  process.stdout.write(message);
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${sanitizeAnnotation(message)}\n`);
    process.exitCode = 1;
  }
}
