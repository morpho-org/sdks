#!/usr/bin/env node
/**
 * Reads the identity npm publish will use from a tarball.
 *
 * npm publish resolves a tarball manifest through pacote.manifest, which uses
 * node-tar to extract the archive with strip: 1. A GNU `tar -t` listing can
 * disagree with that extraction for crafted archives such as
 * `package/\./package.json`, so this script asks the bundled extractor itself
 * instead of emulating its path handling.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { isMain, reportCliError, writeStdout } from "./workflow.ts";

/** The package identity read from a publishable tarball. */
export interface TarballIdentity {
  /** The package name. */
  readonly name: string;
  /** The package version. */
  readonly version: string;
}

/** The minimal pacote interface needed to read a tarball manifest. */
export interface ManifestReader {
  /** Reads the manifest for a package specification. */
  manifest(
    spec: string,
    opts: { fullMetadata: boolean; fullReadJson: boolean },
  ): Promise<{ readonly name?: unknown; readonly version?: unknown }>;
}

function isManifestReader(value: unknown): value is ManifestReader {
  return (
    typeof value === "object" &&
    value !== null &&
    "manifest" in value &&
    typeof value.manifest === "function"
  );
}

/**
 * Loads the pacote bundled with the npm installation at `npmRoot`.
 *
 * @param npmRoot - The global npm module root, as returned by `npm root -g`.
 * @returns A minimal manifest reader backed by npm's bundled pacote.
 */
export function loadBundledPacote(npmRoot: string): ManifestReader {
  const pacote: unknown = createRequire(join(npmRoot, "npm", "package.json"))(
    "pacote",
  );
  if (!isManifestReader(pacote)) {
    throw new Error(
      `Bundled pacote at "${npmRoot}" does not expose manifest().`,
    );
  }
  return pacote;
}

/**
 * Reads the package identity through pacote's npm publish manifest path.
 *
 * @param tgzPath - The tarball path.
 * @param reader - The pacote-compatible manifest reader.
 * @returns The validated package name and version.
 */
export async function readTarballIdentity(
  tgzPath: string,
  reader: ManifestReader,
): Promise<TarballIdentity> {
  let manifest: { readonly name?: unknown; readonly version?: unknown };
  try {
    manifest = await reader.manifest(`file:${resolve(tgzPath)}`, {
      fullMetadata: true,
      fullReadJson: true,
    });
  } catch (cause: unknown) {
    throw new Error(`Unable to read tarball manifest from "${tgzPath}".`, {
      cause,
    });
  }

  const name = manifest.name;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.includes("\t") ||
    name.includes("\n")
  ) {
    throw new Error(
      `Tarball manifest name must be a non-empty string without tabs or newlines (got ${JSON.stringify(name)}).`,
    );
  }

  const version = manifest.version;
  if (
    typeof version !== "string" ||
    version.length === 0 ||
    version.includes("\t") ||
    version.includes("\n")
  ) {
    throw new Error(
      `Tarball manifest version must be a non-empty string without tabs or newlines (got ${JSON.stringify(version)}).`,
    );
  }

  return { name, version };
}

/**
 * Formats a tarball identity for the publish workflow's tab-separated input.
 *
 * @param id - The package identity.
 * @returns The identity followed by a newline.
 */
export function formatIdentity(id: TarballIdentity): string {
  return `${id.name}\t${id.version}\n`;
}

/**
 * Reads and writes one tarball identity from the command line.
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
      "Usage: node scripts/ci/read-tarball-identity.ts <tarball.tgz>",
    );
  }

  const npmRoot = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8",
  }).trim();
  const identity = await readTarballIdentity(
    tarballPath,
    loadBundledPacote(npmRoot),
  );
  writeOutput(formatIdentity(identity));
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
