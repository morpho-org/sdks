#!/usr/bin/env node
/**
 * Rejects tarball entries that consumer filesystems resolve to one path.
 *
 * Case-insensitive and Windows filesystems can fold distinct archive paths
 * together, while node-tar exposes the entries npm consumes. This script uses
 * npm's bundled node-tar directly so the collision check follows that parser.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { isMain, reportCliError, writeStdout } from "./workflow.ts";

/** A tarball entry path and node-tar entry type. */
export interface TarEntry {
  /** The path stored in the archive. */
  readonly path: string;
  /** The node-tar entry type. */
  readonly type: string;
}

/** The minimal node-tar interface needed to list an archive. */
export interface EntryLister {
  /** Lists archive entries and invokes the callback for each one. */
  list(opts: {
    file: string;
    onReadEntry: (entry: TarEntry) => void;
  }): Promise<unknown>;
}

function isEntryLister(value: unknown): value is EntryLister {
  return (
    typeof value === "object" &&
    value !== null &&
    "list" in value &&
    typeof value.list === "function"
  );
}

/**
 * Loads node-tar bundled with the npm installation at `npmRoot`.
 *
 * @param npmRoot - The global npm module root, as returned by `npm root -g`.
 * @returns A minimal entry lister backed by npm's bundled node-tar.
 */
export function loadBundledTar(npmRoot: string): EntryLister {
  const tar: unknown = createRequire(join(npmRoot, "npm", "package.json"))(
    "tar",
  );
  if (!isEntryLister(tar)) {
    throw new Error(`Bundled tar at "${npmRoot}" does not expose list().`);
  }
  return tar;
}

/**
 * Folds an archive path as a case-insensitive Windows consumer would.
 *
 * @param path - The path stored in the archive.
 * @returns The normalized, case-folded path.
 */
export function foldEntryPath(path: string): string {
  const segments = path.replaceAll("\\", "/").split("/");
  const foldedSegments: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw new Error(`Entry path "${path}" escapes the archive root.`);
    }
    foldedSegments.push(segment);
  }
  return foldedSegments.join("/").normalize("NFC").toLowerCase();
}

/**
 * Verifies that tarball entries are safe on case-insensitive or Windows filesystems.
 *
 * @param entries - The entries exposed by node-tar.
 */
export function verifyTarballEntries(entries: readonly TarEntry[]): void {
  const originals = new Map<string, string>();
  for (const { path, type } of entries) {
    if (type !== "File" && type !== "Directory") {
      throw new Error(`Entry "${path}" has unsupported type "${type}".`);
    }

    const folded = foldEntryPath(path);
    if (folded !== "package" && !folded.startsWith("package/")) {
      throw new Error(`Entry "${path}" is outside package/.`);
    }

    const original = originals.get(folded);
    if (original !== undefined) {
      throw new Error(
        `Entries "${original}" and "${path}" collide as "${folded}" on case-insensitive or Windows filesystems.`,
      );
    }
    originals.set(folded, path);
  }

  if (!originals.has("package/package.json")) {
    throw new Error("Tarball has no package/package.json.");
  }
}

/**
 * Lists a tarball's entries through npm's bundled node-tar.
 *
 * @param tgzPath - The tarball path.
 * @param lister - The node-tar-compatible entry lister.
 * @returns The entries found in the tarball.
 */
export async function listTarballEntries(
  tgzPath: string,
  lister: EntryLister,
): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  try {
    await lister.list({
      file: tgzPath,
      onReadEntry: (entry) => {
        entries.push({ path: entry.path, type: entry.type });
      },
    });
  } catch (cause: unknown) {
    throw new Error(`Unable to list tarball "${tgzPath}".`, { cause });
  }
  return entries;
}

/**
 * Verifies one tarball supplied on the command line.
 *
 * @param tarballPath - The tarball path, defaulting to the first CLI argument.
 * @param writeOutput - The output sink.
 */
export async function main(
  tarballPath: string | undefined = process.argv[2],
  writeOutput: (message: string) => void = writeStdout,
): Promise<void> {
  if (tarballPath === undefined || tarballPath === "") {
    throw new Error(
      "Usage: node scripts/ci/verify-tarball-collisions.ts <tarball.tgz>",
    );
  }

  const npmRoot = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8",
  }).trim();
  const entries = await listTarballEntries(
    tarballPath,
    loadBundledTar(npmRoot),
  );
  verifyTarballEntries(entries);
  writeOutput(`${entries.length} entries OK\n`);
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
