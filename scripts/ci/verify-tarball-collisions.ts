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
    strict: boolean;
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
 * @remarks
 * Rejects path segments that Windows cannot represent safely, including
 * non-ASCII characters, 8.3 aliases, trailing dots or spaces, reserved device
 * names, and characters rejected by Win32.
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
    if (!/^[\x20-\x7e]*$/.test(segment)) {
      throw new Error(
        `Entry path "${path}" contains a non-ASCII or control character.`,
      );
    }
    if (segment.includes("~")) {
      throw new Error(
        `Entry path "${path}" can alias a Windows 8.3 short name.`,
      );
    }
    if (/[. ]$/.test(segment)) {
      throw new Error(
        `Entry path "${path}" has a segment where Win32 trims trailing dots and spaces.`,
      );
    }
    if (/[<>:"|?*]/.test(segment)) {
      throw new Error(
        `Entry path "${path}" contains a character Win32 rejects.`,
      );
    }
    const basename = segment.split(".", 1)[0]?.toUpperCase();
    if (
      basename !== undefined &&
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/.test(basename)
    ) {
      throw new Error(
        `Entry path "${path}" contains the reserved Windows device name "${basename}".`,
      );
    }
    foldedSegments.push(segment);
  }
  return foldedSegments.join("/").toLowerCase();
}

/**
 * Verifies that tarball entries are safe on case-insensitive or Windows filesystems.
 *
 * @param entries - The entries exposed by node-tar.
 */
export function verifyTarballEntries(entries: readonly TarEntry[]): void {
  const originals = new Map<string, { path: string; type: string }>();
  const prefixes = new Set<string>();
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
        `Entries "${original.path}" and "${path}" collide as "${folded}" on case-insensitive or Windows filesystems.`,
      );
    }

    const foldedSegments = folded.split("/");
    const ancestorFile = foldedSegments
      .slice(1)
      .map((_, index) => foldedSegments.slice(0, index + 1).join("/"))
      .map((ancestor) => originals.get(ancestor))
      .find((entry) => entry?.type === "File");
    if (ancestorFile !== undefined) {
      throw new Error(
        `Entries "${ancestorFile.path}" and "${path}" collide: a file is an ancestor of another entry.`,
      );
    }

    if (type === "File" && prefixes.has(folded)) {
      const descendant = [...originals.entries()].find(([candidate]) =>
        candidate.startsWith(`${folded}/`),
      )?.[1];
      if (descendant !== undefined) {
        throw new Error(
          `Entries "${path}" and "${descendant.path}" collide: a file is an ancestor of another entry.`,
        );
      }
    }

    originals.set(folded, { path, type });
    for (let index = 1; index < foldedSegments.length; index += 1) {
      prefixes.add(foldedSegments.slice(0, index).join("/"));
    }
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
      strict: true,
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
