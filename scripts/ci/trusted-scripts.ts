/**
 * Trusted-copy integrity for the Claude review workflow.
 *
 * The workflow snapshots `scripts/` from the default-branch checkout into `$RUNNER_TEMP` before
 * Claude runs, then executes the post-Claude gate and scrubber from that copy. `snapshot` makes the
 * copy, adds the node binary running it as `<dest>/bin/node` (so the interpreter is covered by the
 * same digest as the scripts it runs), and records the digest plus that node path as step outputs
 * (runner-held state Claude's subprocesses cannot rewrite); `verify` recomputes the digest and
 * fails if any file was added, removed, or changed since. `verify` itself
 * runs from the trusted copy, so this is defense in depth against accidental or careless edits by
 * Claude's session, not a boundary against a process that already controls the runner user.
 *
 * The digest is a SHA-256 over `"<relative path>\0<sha256(content)>\n"` entries sorted by path, so
 * it is independent of directory-walk order and of the shell tools available on the runner.
 *
 *   node scripts/ci/trusted-scripts.ts snapshot <src> <dest> [<src> <dest> ...]   # copies scripts + node, appends node_bin= and digest= to GITHUB_OUTPUT
 *   node scripts/ci/trusted-scripts.ts verify <dir> <expected>                    # exits 1 when the digest differs
 *
 * Extra `<src> <dest>` pairs are plain trusted copies made in the same step (the `.agents/` review
 * instructions Claude is pointed at); they are not part of the digest, which only guards code the
 * post-Claude steps execute.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

interface RunOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  /** Overrides the node binary copied into the snapshot (defaults to `process.execPath`). */
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

/** A directory copy made alongside the digested snapshot. */
export interface CopySpec {
  readonly dest: string;
  readonly src: string;
}

/**
 * Copies `src` to a fresh `dest`, copies the interpreter running this script to `<dest>/bin/node`,
 * then records that path as `node_bin` and the `digest` of the whole copy as step outputs.
 */
export function snapshot(
  {
    dest,
    extraCopies = [],
    src,
  }: {
    readonly dest: string;
    readonly extraCopies?: readonly CopySpec[];
    readonly src: string;
  },
  options: RunOptions = {},
): string {
  const env = options.env ?? process.env;
  for (const copy of [{ dest, src }, ...extraCopies]) {
    if (existsSync(copy.dest)) {
      throw new Error(`Refusing to snapshot into existing path ${copy.dest}.`);
    }
  }
  for (const copy of extraCopies) {
    cpSync(copy.src, copy.dest, { recursive: true });
  }
  cpSync(src, dest, { recursive: true });
  const nodeBin = join(dest, "bin", "node");
  mkdirSync(join(dest, "bin"));
  copyFileSync(options.nodeBin ?? process.execPath, nodeBin);
  const digest = digestDirectory(dest);
  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `node_bin=${nodeBin}\ndigest=${digest}\n`,
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

const USAGE =
  "Usage: trusted-scripts.ts snapshot <src> <dest> [<src> <dest> ...] | verify <dir> <expected>";

/** Parses `<src> <dest>` pairs; an odd or empty argument list is a usage error. */
export function parseCopyPairs(args: readonly string[]): CopySpec[] {
  if (args.length === 0 || args.length % 2 !== 0 || args.some((a) => !a)) {
    throw new Error(USAGE);
  }
  const pairs: CopySpec[] = [];
  for (let i = 0; i < args.length; i += 2) {
    pairs.push({ dest: args[i + 1] as string, src: args[i] as string });
  }

  return pairs;
}

/** CLI dispatcher: `snapshot <src> <dest> [<src> <dest> ...]` or `verify <dir> <expected>`. */
export function main(options: RunOptions = {}): void {
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? writeStdout;
  const [mode, ...rest] = argv;

  switch (mode) {
    case "snapshot": {
      const [primary, ...extraCopies] = parseCopyPairs(rest);
      if (primary == null) throw new Error(USAGE);
      const digest = snapshot({ ...primary, extraCopies }, options);
      for (const copy of extraCopies) {
        writeOutput(`Trusted copy of ${copy.src} made at ${copy.dest}.\n`);
      }
      writeOutput(
        `Trusted scripts copied to ${primary.dest} (digest ${digest}).\n`,
      );
      return;
    }
    case "verify": {
      const [first, second] = rest;
      if (!first || !second) throw new Error(USAGE);
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

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
