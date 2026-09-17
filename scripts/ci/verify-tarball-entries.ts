#!/usr/bin/env node
/**
 * verify-tarball-entries.ts — the entry-path alias gate of
 * `.github/workflows/publish.yml`. Run with Node's native TypeScript support:
 *
 *   node scripts/ci/verify-tarball-entries.ts <tarball.tgz>
 *
 * Reads the raw ustar headers of the gzipped archive itself rather than a
 * `tar -t` listing: GNU tar resolves PAX `path` records from *global* extended
 * headers, which npm's extractor (node-tar) deliberately ignores, so a listing
 * can show a benign name for an entry node-tar extracts under its raw header
 * name. {@link readTarballEntries} applies node-tar's rules (ustar `prefix`,
 * per-entry `x` headers only) and fails closed on every header kind it does
 * not model. Exits 0 silently when every entry resolves to a distinct canonical
 * path on every consumer platform, and exits 1 with an `::error::` annotation
 * otherwise.
 *
 * The workflow's literal checks (`package/` prefix, exactly one
 * `package/package.json`, no `.`/`..`/`//` segments) inspect the stored entry
 * names, but npm's extractor (node-tar) does not: it strips a leading `\` as a
 * root indicator on every platform and treats `\` as a separator on Windows,
 * and consumers on case-insensitive file systems (Windows, macOS) collapse
 * `Package.json` onto `package.json`. A later entry that aliases the approved
 * manifest therefore overwrites it at install time while the validator still
 * reads the benign one. This gate rejects the aliases structurally.
 */

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { isMain, reportCliError } from "./workflow.ts";

const BLOCK = 512;

/** Magic + version bytes (257–265) node-tar requires before it honours the `prefix` field. */
const USTAR_MAGIC = "ustar\u000000";

/** Longest file-name component accepted by ext4, APFS and NTFS. */
const MAX_SEGMENT_LENGTH = 255;

/**
 * PAX record keys the parser accepts: `path` because it is explicitly modelled
 * (it overrides the header name), the rest because they cannot affect how
 * node-tar lays out or names entries. `size` is rejected because a `size`
 * override desynchronises header parsing between implementations; `linkpath`
 * is meaningless for regular files.
 */
const BENIGN_PAX_KEYS = new Set([
  "atime",
  "ctime",
  "mtime",
  "uid",
  "gid",
  "uname",
  "gname",
  "comment",
  "path",
]);

/** node-tar's `maxMetaEntrySize`: an `x` header larger than this is ignored wholesale, `path` record included. */
const MAX_META_ENTRY_SIZE = 1024 * 1024;

/**
 * Byte-for-byte mirror of node-tar's `decString`: `.` does not match a newline,
 * so bytes after a NUL-then-newline survive. Any such leftover then trips the
 * linkname / printable-ASCII rejections instead of being silently dropped.
 */
function decodeString(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/\0.*/, "");
}

function decodeSize(field: Buffer, offset: number): number {
  const text = decodeString(field).trim();
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(
      `Tar header at byte ${offset} has a non-octal size field; refusing to parse it.`,
    );
  }
  return Number.parseInt(text, 8);
}

/**
 * node-tar's checksum: unsigned byte sum with the checksum field counted as
 * spaces. A header that fails it is skipped by node-tar, which then re-syncs
 * on the following block, so the gate must reject it rather than trust its
 * `size`.
 */
function verifyChecksum(header: Buffer, offset: number): void {
  // node-tar decodes the field as a 12-byte octal number (running into the
  // type flag), so mirror that exactly rather than the 8-byte ustar width.
  const text = decodeString(header.subarray(148, 160)).trim();
  let sum = 8 * 0x20;
  for (let i = 0; i < 148; i++) sum += header.readUInt8(i);
  for (let i = 156; i < BLOCK; i++) sum += header.readUInt8(i);
  if (!/^[0-7]+$/.test(text) || Number.parseInt(text, 8) !== sum) {
    throw new Error(
      `Tar header at byte ${offset} has an invalid checksum; refusing to publish.`,
    );
  }
}

function parsePaxRecords(data: Buffer, offset: number): Map<string, string> {
  const records = new Map<string, string>();
  let cursor = 0;
  while (cursor < data.length) {
    const space = data.indexOf(0x20, cursor);
    const lengthText =
      space === -1 ? "" : data.subarray(cursor, space).toString("latin1");
    const length = /^[1-9][0-9]*$/.test(lengthText)
      ? Number(lengthText)
      : Number.NaN;
    const end = cursor + length;
    if (Number.isNaN(length) || end > data.length || data[end - 1] !== 0x0a) {
      throw new Error(
        `PAX extended header at byte ${offset} is malformed; refusing to parse it.`,
      );
    }
    const record = data.subarray(space + 1, end - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals === -1) {
      throw new Error(
        `PAX extended header at byte ${offset} has a record without "="; refusing to parse it.`,
      );
    }
    const key = record.slice(0, equals);
    if (!BENIGN_PAX_KEYS.has(key)) {
      throw new Error(
        `PAX extended header at byte ${offset} carries unsupported record "${key}"; refusing to publish.`,
      );
    }
    records.set(key, record.slice(equals + 1));
    cursor = end;
  }
  return records;
}

/**
 * Lists the entry paths of a gzipped tarball exactly as npm's extractor
 * (node-tar) will resolve them, and fails closed on anything it does not
 * model. Accepted: ustar/pax regular-file (`0`/NUL) and directory (`5`)
 * headers, optionally preceded by one per-entry PAX `x` header whose `path`
 * record overrides the header name. Rejected: global PAX headers (`g`, which
 * node-tar ignores but GNU tar applies), GNU long-name headers (`L`/`K`),
 * links, devices, FIFOs, magic/version bytes other than `ustar\0` + `00`
 * (node-tar only applies `prefix` for that exact value), an invalid header
 * checksum (node-tar skips such a header and re-syncs one block later), a
 * non-octal `size` field, a directory header declaring a non-zero `size`
 * (node-tar forces it to 0 and reads the next block as a header), an empty
 * path on any header kind (node-tar skips it without consuming its declared
 * body), a non-empty linkname (node-tar likewise skips a file/directory
 * header; it processes an `x` header normally, so that rejection is only
 * fail-closed), an `x` header larger than {@link MAX_META_ENTRY_SIZE} (node-tar
 * ignores it, `path` record included), malformed PAX records (bad length
 * framing or no `=`), PAX records other than {@link BENIGN_PAX_KEYS}, two
 * consecutive `x` headers, an `x` header dangling at end of archive, a
 * regular-file header whose resolved path ends in `/`, truncated archives, and
 * a zero block that is followed by further data (node-tar skips a lone zero
 * block and keeps extracting; GNU tar stops there).
 *
 * @param tgz - The gzipped archive bytes.
 * @returns The resolved entry paths in archive order; directories end in `/`.
 */
export function readTarballEntries(tgz: Buffer): string[] {
  const tar = gunzipSync(tgz);
  const entries: string[] = [];
  let pending: Map<string, string> | undefined;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      // node-tar skips a lone zero block and keeps extracting, whereas GNU tar
      // stops listing there; only accept end-of-archive padding.
      if (!tar.subarray(offset).every((byte) => byte === 0)) {
        throw new Error(
          `Tar archive has a zero block at byte ${offset} followed by more data; refusing to publish.`,
        );
      }
      break;
    }

    verifyChecksum(header, offset);
    const magic = header.subarray(257, 265).toString("latin1");
    if (magic !== USTAR_MAGIC) {
      throw new Error(
        `Tar header at byte ${offset} is not ustar/pax (magic ${JSON.stringify(magic)}); refusing to publish.`,
      );
    }
    const typeflag = header.readUInt8(156);
    const size = decodeSize(header.subarray(124, 136), offset);
    if (typeflag === 0x35 && size !== 0) {
      throw new Error(
        `Tar header at byte ${offset} is a directory declaring ${size} bytes; node-tar ignores the size and reads the next block as a header. Refusing to publish.`,
      );
    }
    const dataStart = offset + BLOCK;
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (next > tar.length) {
      throw new Error(
        `Tar header at byte ${offset} declares ${size} bytes past the end of the archive.`,
      );
    }
    const name = decodeString(header.subarray(0, 100));
    const prefix = decodeString(header.subarray(345, 500));
    const rawPath = prefix === "" ? name : `${prefix}/${name}`;
    // node-tar skips (one block, no body) a header with an empty path, or a
    // non-empty linkname on a regular file/directory, then re-syncs on the next
    // block. It processes an `x` header carrying a linkname normally; rejecting
    // it too is merely fail-closed.
    if (rawPath === "") {
      throw new Error(
        `Tar header at byte ${offset} has an empty path; refusing to publish.`,
      );
    }
    if (decodeString(header.subarray(157, 257)) !== "") {
      throw new Error(
        `Tar header at byte ${offset} ("${rawPath}") carries a linkname; refusing to publish.`,
      );
    }

    if (typeflag === 0x78) {
      if (pending !== undefined) {
        throw new Error(
          `Tar header at byte ${offset} is a second consecutive PAX header; refusing to publish.`,
        );
      }
      if (size > MAX_META_ENTRY_SIZE) {
        throw new Error(
          `Tar header at byte ${offset} is a PAX header of ${size} bytes; node-tar ignores meta entries above ${MAX_META_ENTRY_SIZE} bytes together with their path override. Refusing to publish.`,
        );
      }
      pending = parsePaxRecords(
        tar.subarray(dataStart, dataStart + size),
        offset,
      );
    } else if (typeflag === 0x30 || typeflag === 0 || typeflag === 0x35) {
      const path = pending?.get("path") ?? rawPath;
      pending = undefined;
      if (typeflag === 0x35) {
        entries.push(path.endsWith("/") ? path : `${path}/`);
      } else if (path.endsWith("/")) {
        throw new Error(
          `Tar entry "${path}" is a regular file whose name ends in "/"; refusing to publish.`,
        );
      } else {
        entries.push(path);
      }
    } else {
      throw new Error(
        `Tar entry "${rawPath}" has unsupported type flag ${JSON.stringify(String.fromCharCode(typeflag))} (only regular files, directories and per-entry PAX headers are allowed).`,
      );
    }
    offset = next;
  }
  if (pending !== undefined) {
    throw new Error(
      "Tarball ends with a dangling PAX header; refusing to publish.",
    );
  }
  return entries;
}

/** The stored path of the packed manifest every publishable tarball must carry exactly once. */
export const MANIFEST_ENTRY = "package/package.json";

/**
 * Canonical form of a tar entry path under which two entries collide on some
 * supported consumer file system: case-folded (Windows/macOS) and without a
 * trailing `/` (directory entries share the namespace of regular files).
 * Callers must reject non-ASCII names first (see {@link verifyTarballEntries});
 * ASCII case folding is exact, whereas full Unicode caseless matching and
 * HFS+/APFS normalization cannot be reproduced faithfully in JavaScript.
 */
export function canonicalEntryPath(entry: string): string {
  return entry.toLowerCase().replace(/\/+$/, "");
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** Printable ASCII characters Win32 rejects in a path segment (`/` and `\` are handled separately). */
const WIN32_INVALID = /[<>:"|?*]/;

/** Win32 reserved device basenames, matched before any `.` and case-insensitively. */
const DOS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Verifies that a tarball's entry listing cannot alias one entry onto another
 * after npm extraction.
 *
 * Rejects:
 * - any entry containing `\` (node-tar strips a leading `\` on every platform
 *   and treats `\` as a separator on Windows, so `package/\./package.json`
 *   lands on `package.json`);
 * - any entry with a `.` / `..` segment or an empty segment (`//`, leading
 *   `/`), which npm normalizes away before writing;
 * - any segment ending in `.` or a space, which the Win32 file APIs trim so
 *   `package/package.json.` lands on `package/package.json`;
 * - any segment longer than 255 characters, which no supported consumer file
 *   system can create (node-tar reports `ENAMETOOLONG` and the entry is
 *   silently missing from the installed package);
 * - any entry with a character outside printable ASCII, so that case-
 *   insensitive and Unicode-normalizing consumer file systems (e.g. `ſ` → `s`
 *   under macOS caseless matching) cannot fold it onto another entry;
 * - any segment containing a character Win32 cannot store in a file name
 *   (`<`, `>`, `:`, `"`, `|`, `?`, `*`), which node-tar does not translate on
 *   Windows so the entry could not be extracted at all;
 * - any segment containing `~`, the marker of a Windows 8.3 short name
 *   (`LONGFI~1.JS`) through which a second entry can reach an already
 *   extracted long-name file;
 * - any segment whose basename is a Win32 reserved device (`CON`, `NUL`,
 *   `COM1`, ... — with or without an extension), which does not extract as
 *   an ordinary file on Windows;
 * - any entry outside `package/`;
 * - any two entries whose canonical forms collide (exact duplicates, case
 *   variants, `dir` vs `dir/`);
 * - any regular-file entry that is also an ancestor directory of another
 *   entry in any order (`package/package.json/x` makes node-tar create a
 *   `package.json` directory and skip the real manifest with `ENOTEMPTY`);
 * - a manifest that is not stored literally as `package/package.json`;
 * - a listing without a literal `package/package.json` entry (a second one is
 *   intercepted by the collision check above).
 *
 * @param entries - The stored entry paths, in archive order.
 */
export function verifyTarballEntries(entries: readonly string[]): void {
  const seen = new Map<string, string>();
  const files = new Map<string, string>();
  const ancestors = new Map<string, string>();
  let manifestCount = 0;

  for (const entry of entries) {
    if (entry.includes("\\")) {
      throw new Error(
        `Tar entry "${entry}" contains a backslash; npm resolves it as a path separator or root indicator.`,
      );
    }

    const isDirectory = entry.endsWith("/");
    const segments = (isDirectory ? entry.slice(0, -1) : entry).split("/");
    if (segments.some((s) => s === "" || s === "." || s === "..")) {
      throw new Error(
        `Tar entry "${entry}" has a non-canonical path segment (., .., or empty).`,
      );
    }
    if (segments.some((s) => s.endsWith(".") || s.endsWith(" "))) {
      throw new Error(
        `Tar entry "${entry}" has a path segment ending in a dot or space, which Windows trims onto another path.`,
      );
    }
    if (segments.some((s) => s.length > MAX_SEGMENT_LENGTH)) {
      throw new Error(
        `Tar entry "${entry}" has a path segment longer than ${MAX_SEGMENT_LENGTH} characters.`,
      );
    }
    if (!PRINTABLE_ASCII.test(entry)) {
      throw new Error(
        `Tar entry "${entry}" contains a non-ASCII or control character; consumer file systems may fold it onto another path.`,
      );
    }
    if (WIN32_INVALID.test(entry)) {
      throw new Error(
        `Tar entry "${entry}" contains a character that is invalid in a Windows file name.`,
      );
    }
    if (segments.some((s) => s.includes("~"))) {
      throw new Error(
        `Tar entry "${entry}" has a path segment containing "~", which can alias a Windows 8.3 short name.`,
      );
    }
    if (segments.some((s) => DOS_DEVICE.test(s))) {
      throw new Error(
        `Tar entry "${entry}" has a path segment that is a Windows reserved device name.`,
      );
    }
    if (segments[0] !== "package") {
      throw new Error(`Tar entry "${entry}" is outside package/.`);
    }

    const canonical = canonicalEntryPath(entry);
    if (!isDirectory) files.set(canonical, entry);
    for (let depth = 1; depth < segments.length; depth++) {
      const ancestor = canonicalEntryPath(segments.slice(0, depth).join("/"));
      ancestors.set(ancestor, entry);
    }
    if (canonical === MANIFEST_ENTRY && entry !== MANIFEST_ENTRY) {
      throw new Error(
        `Tar entry "${entry}" aliases ${MANIFEST_ENTRY}; the manifest must be stored literally.`,
      );
    }

    const previous = seen.get(canonical);
    if (previous != null) {
      throw new Error(
        `Tar entries "${previous}" and "${entry}" resolve to the same path on a case-insensitive file system.`,
      );
    }
    seen.set(canonical, entry);

    if (entry === MANIFEST_ENTRY) {
      manifestCount += 1;
    }
  }

  for (const [canonical, file] of files) {
    const descendant = ancestors.get(canonical);
    if (descendant != null) {
      throw new Error(
        `Tar entry "${file}" is a regular file but "${descendant}" is stored beneath it.`,
      );
    }
  }

  if (manifestCount === 0) {
    throw new Error(`Tarball must contain ${MANIFEST_ENTRY} (found 0).`);
  }
}

/** CLI entrypoint: `node scripts/ci/verify-tarball-entries.ts <tarball.tgz>`. */
export function main(tarballPath: string | undefined = process.argv[2]): void {
  if (tarballPath === undefined || tarballPath === "") {
    throw new Error(
      "Usage: node scripts/ci/verify-tarball-entries.ts <tarball.tgz>",
    );
  }
  verifyTarballEntries(readTarballEntries(readFileSync(tarballPath)));
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
