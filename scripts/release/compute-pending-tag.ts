#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, isPathInside } from "./helpers.ts";

const DEFAULT_BASE_REF = "HEAD^";
const PACKAGE_MANIFEST_PATH_RE = /^packages\/[^/]+\/package\.json$/;
// `git show <rev>:<path>` reports an absent base ref or an absent path with
// one of these `fatal:` messages and exit code 128. Any other failure (git
// missing, repository corruption, ...) must propagate rather than be treated
// as "the package did not exist yet".
const MISSING_REVISION_OR_PATH_RE =
  /invalid object name|unknown revision|does not exist in|exists on disk, but not in/i;

/** Minimal `package.json` shape consumed by the pending-tag computation. */
export interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
}

interface ReadPackageManifestOptions {
  cwd?: string;
  manifestPath: string;
}

interface ReadPreviousPackageManifestOptions
  extends ReadPackageManifestOptions {
  baseRef?: string;
}

interface ResolvedManifestPath {
  absolutePath: string;
  basePath: string;
  relativePath: string;
}

/**
 * Reads a package manifest from disk.
 *
 * @param options Read options.
 * @returns The parsed package manifest.
 */
export function readPackageManifest(
  options: ReadPackageManifestOptions,
): PackageManifest {
  const manifestPath = resolveManifestPath(options);
  const stats = lstatSync(manifestPath.absolutePath);

  if (!stats.isFile()) {
    throw new Error(`Invalid manifest path "${options.manifestPath}".`);
  }

  assertPathInsideBase({
    absolutePath: realpathSync(manifestPath.absolutePath),
    basePath: manifestPath.basePath,
    manifestPath: options.manifestPath,
  });

  return JSON.parse(
    readFileSync(manifestPath.absolutePath, "utf8"),
  ) as PackageManifest;
}

/**
 * Reads a package manifest from the previous release commit, if it exists.
 *
 * @param options Git read options.
 * @returns The parsed previous package manifest.
 */
export function readPreviousPackageManifest(
  options: ReadPreviousPackageManifestOptions,
): PackageManifest | undefined {
  const baseRef = options.baseRef ?? DEFAULT_BASE_REF;
  const manifestPath = resolveManifestPath(options);
  let manifestSource: string;

  try {
    manifestSource = execFileSync(
      "git",
      ["show", `${baseRef}:${manifestPath.relativePath}`],
      {
        cwd: options.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    if (isMissingRevisionOrPathError(error)) {
      return undefined;
    }

    throw error;
  }

  return JSON.parse(manifestSource) as PackageManifest;
}

/**
 * Computes the package tag that still needs to be created during publish rerun recovery.
 *
 * @param options Tag computation options.
 * @returns The package tag to create, or undefined when the version did not change.
 */
export function computePendingTag(options: {
  baseRef?: string;
  cwd?: string;
  manifest?: PackageManifest;
  manifestPath: string;
  readPreviousManifest?: (
    options: ReadPreviousPackageManifestOptions,
  ) => PackageManifest | undefined;
}): string | undefined {
  const manifest =
    options.manifest ??
    readPackageManifest({
      cwd: options.cwd,
      manifestPath: options.manifestPath,
    });
  const readPreviousManifest =
    options.readPreviousManifest ?? readPreviousPackageManifest;
  const previousManifest = readPreviousManifest({
    baseRef: options.baseRef,
    cwd: options.cwd,
    manifestPath: options.manifestPath,
  });

  if (previousManifest?.version === manifest.version) {
    return undefined;
  }

  return `${manifest.name}-v${manifest.version}`;
}

function resolveManifestPath(
  options: ReadPackageManifestOptions,
): ResolvedManifestPath {
  if (
    isAbsolute(options.manifestPath) ||
    options.manifestPath.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Invalid manifest path "${options.manifestPath}".`);
  }

  const basePath = realpathSync(options.cwd ?? process.cwd());
  const absolutePath = resolve(basePath, options.manifestPath);
  const relativePath = relative(basePath, absolutePath);

  assertPathInsideBase({
    absolutePath,
    basePath,
    manifestPath: options.manifestPath,
  });

  if (!PACKAGE_MANIFEST_PATH_RE.test(relativePath)) {
    throw new Error(`Invalid manifest path "${options.manifestPath}".`);
  }

  return { absolutePath, basePath, relativePath };
}

function assertPathInsideBase(options: {
  absolutePath: string;
  basePath: string;
  manifestPath: string;
}): void {
  if (!isPathInside(options.basePath, options.absolutePath)) {
    throw new Error(`Invalid manifest path "${options.manifestPath}".`);
  }
}

function isMissingRevisionOrPathError(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error == null ||
    !("status" in error) ||
    error.status !== 128
  ) {
    return false;
  }

  const stderr = "stderr" in error ? error.stderr : undefined;

  return typeof stderr === "string" && MISSING_REVISION_OR_PATH_RE.test(stderr);
}

/**
 * Runs the pending package tag computation CLI.
 *
 * @param args CLI arguments.
 * @param options Runtime options.
 * @returns The computed package tag.
 */
export function main(
  args: string[] = process.argv.slice(2),
  options: {
    baseRef?: string;
    cwd?: string;
    writeOutput?: (message: string) => void;
  } = {},
): string | undefined {
  const [manifestPath] = args;
  if (manifestPath == null) {
    throw new Error(
      "Usage: node scripts/release/compute-pending-tag.ts <manifest-path>",
    );
  }

  const tag = computePendingTag({
    baseRef: options.baseRef,
    cwd: options.cwd,
    manifestPath,
  });

  if (tag != null) {
    const writeOutput =
      options.writeOutput ?? ((message) => process.stdout.write(message));
    writeOutput(tag);
  }

  return tag;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
