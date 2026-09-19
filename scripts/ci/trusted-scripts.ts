/**
 * Trusted-copy integrity for the Claude review workflow.
 *
 * The workflow snapshots `scripts/` and `.agents/` from the default-branch checkout into
 * `$RUNNER_TEMP` before Claude runs, then executes the post-Claude gate and scrubber from the
 * `scripts/` copy and points Claude at the `.agents/` copy for its review instructions. `snapshot`
 * makes the copies, adds the node binary running it as `<dest>/bin/node` (so the interpreter is
 * covered by the same digest as the scripts it runs), strips every write bit from the result, and
 * records the digest plus that node path as step outputs (runner-held state Claude's subprocesses
 * cannot rewrite); `verify` recomputes the digest and fails if any file was added, removed, or
 * changed since. `verify` itself runs from the trusted copy, so this is defense in depth against
 * accidental or careless edits by Claude's session, not a boundary against a process that already
 * controls the runner user.
 *
 * Every copy is digested, instructions included: the review the workflow accepts is only as trusted
 * as the instructions that produced it, and Claude holds `Write`/`Edit` over a directory it is also
 * told to read. {@link makeReadOnly} stops the accidental write, the digest detects the deliberate
 * one, and the post-Claude gate refuses the review when either copy moved.
 *
 * The digest is a SHA-256 over `"<copy index>\0<relative path>\0<sha256(content)>\n"` entries,
 * sorted by path within each copy and taken in copy order, so it is independent of directory-walk
 * order and of the shell tools available on the runner, and a file cannot migrate between copies
 * unnoticed.
 *
 *   node scripts/ci/trusted-scripts.ts snapshot <src> <dest> [<src> <dest> ...]   # copies + node, appends node_bin= and digest= to GITHUB_OUTPUT
 *   node scripts/ci/trusted-scripts.ts verify <expected> <dir> [<dir> ...]        # exits 1 when the digest differs
 *
 * `verify` must be passed the same destinations in the same order `snapshot` received them.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
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

/**
 * Lists every non-directory entry under `dir` (regular files and symlinks, so a planted link changes
 * the digest too), as `/`-separated paths relative to `dir`, sorted.
 */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

/**
 * Computes the order-independent content digest of every file under each of `dirs`. Entries are
 * prefixed with the index of the directory they came from, so moving a file from one copy to
 * another changes the digest.
 */
export function digestDirectories(dirs: readonly string[]): string {
  const hash = createHash("sha256");
  dirs.forEach((dir, index) => {
    for (const file of listFiles(dir)) {
      const content = createHash("sha256")
        .update(readFileSync(join(dir, file)))
        .digest("hex");
      hash.update(`${index}\0${file}\0${content}\n`);
    }
  });

  return hash.digest("hex");
}

/** Computes the order-independent content digest of every file under `dir`. */
export function digestDirectory(dir: string): string {
  return digestDirectories([dir]);
}

/**
 * Strips every write bit from the regular files under `dir`.
 *
 * Claude's session runs as the runner user and owns these files, so a shell it controls can `chmod`
 * them back — this closes the accidental path (`Write`, `Edit`, a stray `>` redirect), which opens
 * the target for writing and now fails with `EACCES`. It is not a boundary against a process running
 * arbitrary commands; detecting that case is {@link verify}'s job.
 *
 * Directories are left writable on purpose. Clearing their write bit would additionally block
 * `unlink`-then-recreate, but that path already requires the shell access the digest covers, and a
 * non-writable directory tree cannot be removed by an ordinary recursive delete — it would leave
 * `$RUNNER_TEMP` undeletable for anything that reuses the workspace.
 *
 * Symlinks are skipped: `chmod` follows them and Linux has no `lchmod`, so chmod-ing a link would
 * silently retarget the write bits of whatever it points at — either a path already covered by this
 * walk, or one outside the snapshot's trust boundary that this function has no business touching.
 */
export function makeReadOnly(dir: string): void {
  for (const file of listFiles(dir)) {
    const path = join(dir, file);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) continue;
    chmodSync(path, stats.mode & ~0o222);
  }
}

/** A directory copy made alongside the digested snapshot. */
export interface CopySpec {
  readonly dest: string;
  readonly src: string;
}

/**
 * Copies `src` to a fresh `dest`, copies the interpreter running this script to `<dest>/bin/node`,
 * then records that path as `node_bin` and the `digest` over every copy as step outputs. All copies
 * are left read-only.
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
  const copies = [{ dest, src }, ...extraCopies];
  for (const copy of copies) {
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
  const dests = copies.map((copy) => copy.dest);
  const digest = digestDirectories(dests);
  // After the digest: chmod changes no content, but hashing first keeps the recorded digest the
  // value `verify` recomputes regardless of how the runner's umask left the copied modes.
  for (const target of dests) makeReadOnly(target);
  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `node_bin=${nodeBin}\ndigest=${digest}\n`,
  );

  return digest;
}

/**
 * Throws when the current digest of `dirs` differs from the snapshot digest. `dirs` must be the
 * snapshot destinations in the order {@link snapshot} received them.
 */
export function verify(dirs: readonly string[], expected: string): void {
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error(
      `Invalid expected digest "${expected}". Expected a 64-character hex SHA-256.`,
    );
  }
  if (dirs.length === 0) {
    throw new Error("Refusing to verify an empty list of trusted directories.");
  }
  const actual = digestDirectories(dirs);
  if (actual !== expected) {
    throw new Error(
      `Trusted copies in ${dirs.join(", ")} were modified after the snapshot (expected ${expected}, got ${actual}).`,
    );
  }
}

const USAGE =
  "Usage: trusted-scripts.ts snapshot <src> <dest> [<src> <dest> ...] | verify <expected> <dir> [<dir> ...]";

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

/**
 * CLI dispatcher: `snapshot <src> <dest> [<src> <dest> ...]` or
 * `verify <expected> <dir> [<dir> ...]`.
 */
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
      const [expected, ...dirs] = rest;
      if (!expected || dirs.length === 0 || dirs.some((dir) => !dir)) {
        throw new Error(USAGE);
      }
      verify(dirs, expected);
      writeOutput(`Trusted copies in ${dirs.join(", ")} match the snapshot.\n`);
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
