#!/usr/bin/env node
/**
 * Rejects tarball entries that consumer filesystems resolve to one path.
 *
 * Case-insensitive and Windows filesystems can fold distinct archive paths
 * together, while node-tar exposes the entries npm consumes. This script uses
 * npm's bundled node-tar directly so the collision check follows that parser.
 */

import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";

/** A tarball entry path and node-tar entry type. */
export interface TarEntry {
  /** The path stored in the archive. */
  readonly path: string;
  /** The node-tar entry type. */
  readonly type: string;
}

/**
 * An entry as node-tar streams it while listing.
 *
 * @public Also consumed by release tooling.
 */
export interface TarStreamEntry extends TarEntry {
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  resume(): unknown;
}

type TarListingStream = NodeJS.WritableStream & {
  on(
    event: "ignoredEntry",
    listener: (entry: TarEntry) => void,
  ): NodeJS.WritableStream;
};

/** The minimal node-tar interface needed to list an archive. */
export interface EntryLister {
  /** Creates a writable archive listing stream. */
  list(opts: {
    strict: boolean;
    onReadEntry: (entry: TarStreamEntry) => void;
  }): TarListingStream;
}

/** The node-tar streaming parser, used to read entry contents. */
export interface TarParser {
  /** Creates a writable stream that parses an archive. */
  Parser: new (opts: {
    strict: boolean;
    onReadEntry: (entry: TarStreamEntry) => void;
  }) => TarListingStream;
}

/** An archive member skipped by npm's bundled node-tar. */
export class IgnoredTarballEntryError extends Error {
  constructor(tgzPath: string, entry: TarEntry) {
    super(
      `Tarball "${tgzPath}" contains entry "${entry.path}" of type "${entry.type}" that node-tar skipped.`,
    );
    this.name = "IgnoredTarballEntryError";
  }
}

interface ForbiddenHeader extends TarEntry {
  readonly type: "OldGnuLongPath" | "GlobalExtendedHeader";
  affectedPath?: string;
}

/** An archive uses path metadata that tar readers interpret differently. */
export class ForbiddenTarballHeaderError extends Error {
  constructor(tgzPath: string, header: ForbiddenHeader) {
    const flag = header.type === "OldGnuLongPath" ? "N" : "g";
    const affected =
      header.affectedPath === undefined
        ? ""
        : ` (affected path "${header.affectedPath}")`;
    super(
      `Tarball "${tgzPath}" contains forbidden "${flag}" ${header.type} header "${header.path}"${affected}.`,
    );
    this.name = "ForbiddenTarballHeaderError";
  }
}

interface ParsedEntry extends TarEntry {
  readonly header: TarEntry;
  readonly meta: boolean;
  readonly extended?: { readonly path?: string };
  readonly globalExtended?: { readonly path?: string };
}

function observeParsedEntries(
  stream: TarListingStream,
  observe: (entry: ParsedEntry) => void,
): void {
  // In the pinned node-tar, every parsed header sets writeEntry before dispatch.
  // Public meta events expose only the payload and omit empty headers.
  const slot = Object.getOwnPropertySymbols(stream).find(
    (key) => key.description === "writeEntry",
  );
  if (
    slot === undefined ||
    Object.getOwnPropertyDescriptor(stream, slot)?.writable !== true
  ) {
    throw new Error("Bundled node-tar does not expose its writeEntry slot.");
  }
  let current: ParsedEntry | undefined;
  Object.defineProperty(stream, slot, {
    get: () => current,
    set: (entry: ParsedEntry | undefined) => {
      current = entry;
      if (entry !== undefined) observe(entry);
    },
  });
}

function isBundledTar(value: unknown): value is EntryLister & TarParser {
  return (
    typeof value === "object" &&
    value !== null &&
    "list" in value &&
    typeof value.list === "function" &&
    "Parser" in value &&
    typeof value.Parser === "function"
  );
}

/**
 * Loads node-tar bundled with the npm installation at `npmRoot`.
 *
 * @param npmRoot - The global npm module root, as returned by `npm root -g`.
 * @returns npm's bundled node-tar, narrowed to its lister and parser.
 * @throws If the bundled module has no `list()` or no `Parser`.
 */
export function loadBundledTar(npmRoot: string): EntryLister & TarParser {
  const tar: unknown = createRequire(join(npmRoot, "npm", "package.json"))(
    "tar",
  );
  if (!isBundledTar(tar)) {
    throw new Error(
      `Bundled tar at "${npmRoot}" does not expose list() and Parser.`,
    );
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
 * Rejects backslashes rather than accepting platform-dependent path separators.
 * It also models pacote's `.gitignore` to `.npmignore` rename during extraction.
 * Rename suppression is archive-order sensitive, like pacote: only a literal
 * `.npmignore` file that precedes the `.gitignore` suppresses it.
 *
 * @param entries - The entries exposed by node-tar.
 */
export function verifyTarballEntries(entries: readonly TarEntry[]): void {
  const normalizedEntries = entries.map(({ path, type }) => {
    if (type !== "File" && type !== "Directory") {
      throw new Error(`Entry "${path}" has unsupported type "${type}".`);
    }

    if (path.split("/")[0] !== "package") {
      throw new Error(`Entry "${path}" is outside package/.`);
    }

    if (path.includes("\\")) {
      throw new Error(
        `Entry "${path}" contains a backslash. Use forward slashes.`,
      );
    }

    const folded = foldEntryPath(path);
    if (folded !== "package" && !folded.startsWith("package/")) {
      throw new Error(`Entry "${path}" is outside package/.`);
    }
    return { path, type, folded };
  });

  const npmignoreFiles = new Set<string>();
  const originals = new Map<string, { path: string; type: string }>();
  const prefixes = new Set<string>();
  for (const { path, type, folded } of normalizedEntries) {
    const aliases = [folded];
    const npmignoreSibling = path.replace(/\.gitignore$/, ".npmignore");
    if (
      type === "File" &&
      path.endsWith("/.gitignore") &&
      !npmignoreFiles.has(npmignoreSibling)
    ) {
      aliases.push(foldEntryPath(npmignoreSibling));
    }
    if (type === "File" && path.endsWith("/.npmignore")) {
      npmignoreFiles.add(path);
    }

    for (const alias of aliases) {
      const original = originals.get(alias);
      if (original !== undefined) {
        throw new Error(
          `Entries "${original.path}" and "${path}" collide as "${alias}" on case-insensitive or Windows filesystems.`,
        );
      }

      const foldedSegments = alias.split("/");
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

      if (type === "File" && prefixes.has(alias)) {
        const descendant = [...originals.entries()].find(([candidate]) =>
          candidate.startsWith(`${alias}/`),
        )?.[1];
        throw new Error(
          `Entries "${path}" and "${descendant?.path ?? `${alias}/…`}" collide: a file is an ancestor of another entry.`,
        );
      }

      originals.set(alias, { path, type });
      for (let index = 1; index < foldedSegments.length; index += 1) {
        prefixes.add(foldedSegments.slice(0, index).join("/"));
      }
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
 * @throws {IgnoredTarballEntryError} If node-tar skips a member.
 * @throws {ForbiddenTarballHeaderError} If a GNU N or global PAX g header appears.
 */
export async function listTarballEntries(
  tgzPath: string,
  lister: EntryLister,
): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  let ignoredEntry: IgnoredTarballEntryError | undefined;
  let forbiddenHeader: ForbiddenHeader | undefined;
  let listingError: Error | undefined;
  try {
    const stream = lister.list({
      strict: true,
      onReadEntry: (entry) => {
        entries.push({ path: entry.path, type: entry.type });
      },
    });
    stream.on("ignoredEntry", (entry) => {
      ignoredEntry ??= new IgnoredTarballEntryError(tgzPath, entry);
    });
    observeParsedEntries(stream, (entry) => {
      const { path, type } = entry.header;
      if (type === "OldGnuLongPath" || type === "GlobalExtendedHeader") {
        forbiddenHeader ??= { type, path };
      } else if (forbiddenHeader !== undefined && !entry.meta) {
        const affectedPath =
          forbiddenHeader.type === "GlobalExtendedHeader"
            ? entry.globalExtended?.path
            : entry.extended?.path && entry.path;
        if (affectedPath) forbiddenHeader.affectedPath ??= affectedPath;
      }
    });
    await pipeline(createReadStream(tgzPath), stream);
  } catch (cause: unknown) {
    listingError = new Error(`Unable to list tarball "${tgzPath}".`, { cause });
  }
  if (forbiddenHeader !== undefined) {
    throw new ForbiddenTarballHeaderError(tgzPath, forbiddenHeader);
  }
  if (listingError !== undefined) throw listingError;
  if (ignoredEntry !== undefined) throw ignoredEntry;
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
      "Usage: node scripts/publish/verify-tarball-collisions.ts <tarball.tgz>",
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
