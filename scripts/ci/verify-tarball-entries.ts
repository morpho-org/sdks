#!/usr/bin/env node
/**
 * verify-tarball-entries.ts — the entry-path alias gate of
 * `.github/workflows/publish.yml`. Run with Node's native TypeScript support:
 *
 *   tar -tzf <tarball> | node scripts/ci/verify-tarball-entries.ts
 *
 * Reads the newline-separated `tar -t` listing on stdin, exits 0 silently when
 * every entry resolves to a distinct canonical path on every consumer platform,
 * and exits 1 with an `::error::` annotation otherwise.
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

import { isMain, reportCliError } from "./workflow.ts";

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

/**
 * Verifies that a tarball's entry listing cannot alias one entry onto another
 * after npm extraction.
 *
 * Rejects:
 * - any entry containing `\` (node-tar strips a leading `\` on every platform
 *   and treats `\` as a separator on Windows, so `package/\./package.json`
 *   lands on `package.json`);
 * - any entry with a `.` / `..` segment or an empty segment (`//`, trailing
 *   `/` on a file), which npm normalizes away before writing;
 * - any segment ending in `.` or a space, which the Win32 file APIs trim so
 *   `package/package.json.` lands on `package/package.json`;
 * - any entry with a character outside printable ASCII, so that case-
 *   insensitive and Unicode-normalizing consumer file systems (e.g. `ſ` → `s`
 *   under macOS caseless matching) cannot fold it onto another entry;
 * - any entry outside `package/`;
 * - any two entries whose canonical forms collide (exact duplicates, case
 *   variants, `dir` vs `dir/`);
 * - a manifest that is not stored literally as `package/package.json`.
 *
 * @param entries - The stored entry paths, in archive order.
 */
export function verifyTarballEntries(entries: readonly string[]): void {
  const seen = new Map<string, string>();
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
    if (!PRINTABLE_ASCII.test(entry)) {
      throw new Error(
        `Tar entry "${entry}" contains a non-ASCII or control character; consumer file systems may fold it onto another path.`,
      );
    }
    if (segments[0] !== "package") {
      throw new Error(`Tar entry "${entry}" is outside package/.`);
    }

    const canonical = canonicalEntryPath(entry);
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

  if (manifestCount !== 1) {
    throw new Error(
      `Tarball must contain exactly one ${MANIFEST_ENTRY} (found ${manifestCount}).`,
    );
  }
}

/**
 * Splits a `tar -t` listing into entry paths. Empty lines are dropped;
 * nothing else is trimmed, so an entry with leading/trailing whitespace is
 * validated as stored.
 */
export function parseEntryListing(listing: string): string[] {
  return listing.split("\n").filter((line) => line !== "");
}

/** CLI entrypoint: `tar -tzf <tarball> | node scripts/ci/verify-tarball-entries.ts`. */
export function main(listing: string = readFileSync(0, "utf8")): void {
  verifyTarballEntries(parseEntryListing(listing));
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
