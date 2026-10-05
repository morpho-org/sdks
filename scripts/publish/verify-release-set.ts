#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import { listPublicPackages, type PackageIdentity } from "./pack.ts";
import {
  loadBundledPacote,
  type ManifestReader,
  readTarballIdentity,
} from "./read-tarball-identity.ts";
import {
  type EntryLister,
  listTarballEntries,
  loadBundledTar,
  type TarEntry,
  verifyTarballEntries,
} from "./verify-tarball-collisions.ts";
import { verifyTarballManifest } from "./verify-tarball-manifest.ts";

/** A tarball cleared for publishing. */
export interface ReleaseTarball extends PackageIdentity {
  readonly file: string;
}

/**
 * Checks an npm tarball's layout: one `package/` root, canonical paths, only
 * regular files and directories, and a single regular `package/package.json`.
 *
 * @param file - Tarball name, for messages.
 * @param entries - Entries as node-tar lists them.
 */
export function verifyTarballStructure(
  file: string,
  entries: readonly TarEntry[],
): void {
  let manifests = 0;
  for (const { path, type } of entries) {
    const segments = path.replace(/\/$/, "").split("/");
    if (
      segments[0] !== "package" ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      throw new Error(`Tarball "${file}" has a non-canonical entry "${path}".`);
    }
    if (type !== "File" && type !== "OldFile" && type !== "Directory") {
      throw new Error(`Tarball "${file}" has a ${type} entry "${path}".`);
    }
    if (path.startsWith("package/package.json/")) {
      throw new Error(
        `Tarball "${file}" has entries below package/package.json.`,
      );
    }
    if (path === "package/package.json") {
      if (type === "Directory") {
        throw new Error(
          `Tarball "${file}": package/package.json is a directory.`,
        );
      }
      manifests++;
    }
  }
  if (manifests !== 1) {
    throw new Error(
      `Tarball "${file}" must hold exactly one package/package.json (found ${manifests}).`,
    );
  }
}

/**
 * Checks that the tarballs are exactly the public packages declared at this commit,
 * one per package, at the declared version.
 *
 * @param expected - Packages declared in the checked-out source.
 * @param received - Identities read from the tarballs.
 */
export function verifyReleaseMatch(
  expected: readonly PackageIdentity[],
  received: readonly ReleaseTarball[],
): void {
  const byName = new Map<string, ReleaseTarball>();
  for (const tarball of received) {
    if (byName.has(tarball.name)) {
      throw new Error(`Two tarballs for ${tarball.name}.`);
    }
    byName.set(tarball.name, tarball);
  }
  for (const { name, version } of expected) {
    // release.yml publishes under the `latest` dist-tag, so prereleases must not reach it.
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error(
        `${name}@${version} is not a stable x.y.z version. Publish prereleases from the development repository instead.`,
      );
    }
    const got = byName.get(name)?.version;
    if (got !== version) {
      throw new Error(
        `Expected a tarball for ${name}@${version}, got "${got ?? "none"}".`,
      );
    }
    byName.delete(name);
  }
  for (const { name, version } of byName.values()) {
    throw new Error(`Unexpected tarball ${name}@${version}.`);
  }
}

/**
 * Checks `SHA256SUMS` lists exactly the tarballs, that each digest matches, and
 * that the directory holds nothing but regular `.tgz` files and `SHA256SUMS`.
 *
 * @param dir - Tarball directory.
 * @returns The tarball names, sorted.
 */
export function verifyChecksums(dir: string): string[] {
  const sumsPath = join(dir, "SHA256SUMS");
  if (!existsSync(sumsPath)) throw new Error(`Missing "${sumsPath}".`);
  const sums = new Map<string, string>();
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    if (line === "") continue;
    const match = /^([0-9a-f]{64}) [ *](?:\.\/)?([^/]+\.tgz)$/.exec(line);
    if (!match?.[1] || !match[2] || sums.has(match[2])) {
      throw new Error(`Invalid SHA256SUMS line ${JSON.stringify(line)}.`);
    }
    sums.set(match[2], match[1]);
  }
  // Packing may have run dependency code, so nothing but tarballs may ride along.
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "SHA256SUMS") continue;
    if (!name.endsWith(".tgz") || !lstatSync(join(dir, name)).isFile()) {
      throw new Error(`Unexpected "${name}" next to the tarballs.`);
    }
    files.push(name);
  }
  if (files.length === 0) throw new Error(`No tarballs in "${dir}".`);
  for (const file of files) {
    const digest = createHash("sha256")
      .update(readFileSync(join(dir, file)))
      .digest("hex");
    if (sums.get(file) !== digest) {
      throw new Error(`Tarball "${file}" doesn't match SHA256SUMS.`);
    }
    sums.delete(file);
  }
  if (sums.size > 0) {
    throw new Error(
      `SHA256SUMS lists missing tarballs: ${[...sums.keys()].join(", ")}.`,
    );
  }
  return files;
}

/**
 * Runs every pre-publish check on a directory of tarballs: checksums, layout,
 * case-folding collisions, the identity npm publish reads (pacote), the stored
 * manifest's `publishConfig` and identity, and the match with the source tree.
 *
 * @param options.dir - Tarball directory with `SHA256SUMS`.
 * @param options.expected - Packages declared at this commit.
 * @param options.tar - node-tar, as bundled with npm.
 * @param options.pacote - pacote, as bundled with npm.
 * @returns The tarballs to publish, sorted by file name.
 */
export async function verifyReleaseSet(options: {
  dir: string;
  expected: readonly PackageIdentity[];
  tar: EntryLister;
  pacote: ManifestReader;
}): Promise<ReleaseTarball[]> {
  const received: ReleaseTarball[] = [];
  for (const file of verifyChecksums(options.dir)) {
    const path = join(options.dir, file);
    const manifestChunks: Buffer[] = [];
    // Same listing policy as the collision check, plus capturing package.json.
    const entries = await listTarballEntries(path, {
      list: (opts) =>
        options.tar.list({
          ...opts,
          onReadEntry: (entry) => {
            opts.onReadEntry(entry);
            if (entry.path === "package/package.json") {
              entry.on("data", (chunk) => manifestChunks.push(chunk));
            } else {
              entry.resume();
            }
          },
        }),
    });
    verifyTarballStructure(file, entries);
    verifyTarballEntries(entries);
    const { name, version } = await readTarballIdentity(path, options.pacote);
    const stored = verifyTarballManifest(
      JSON.parse(Buffer.concat(manifestChunks).toString("utf8")),
    );
    if (stored.name !== name || stored.version !== version) {
      throw new Error(
        `Tarball "${file}": package.json says ${stored.name}@${stored.version} but npm would publish ${name}@${version}.`,
      );
    }
    received.push({ file: path, name, version });
  }
  verifyReleaseMatch(options.expected, received);
  return received;
}

/**
 * `verify-release-set.ts <dir>` checks the tarballs against the packages declared
 * in the current directory and prints `<name>\t<version>\t<file>` per tarball.
 *
 * @param argv - Command-line arguments.
 */
async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const { positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
  });
  const [dir] = positionals;
  if (!dir || positionals.length !== 1) {
    throw new Error("Usage: node scripts/publish/verify-release-set.ts <dir>");
  }
  const npmRoot = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8",
  }).trim();
  const tarballs = await verifyReleaseSet({
    dir,
    expected: listPublicPackages("."),
    tar: loadBundledTar(npmRoot),
    pacote: loadBundledPacote(npmRoot),
  });
  for (const { name, version, file } of tarballs) {
    writeStdout(`${name}\t${version}\t${file}\n`);
  }
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
