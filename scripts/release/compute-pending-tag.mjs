#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_REF = "HEAD^";
const PACKAGE_MANIFEST_PATH_RE = /^packages\/[^/]+\/package\.json$/;

/**
 * Reads a package manifest from disk.
 *
 * @param {{ cwd?: string, manifestPath: string }} options Read options.
 * @returns {{ name?: string, version?: string }} The parsed package manifest.
 */
export function readPackageManifest(options) {
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

  return JSON.parse(readFileSync(manifestPath.absolutePath, "utf8"));
}

/**
 * Reads a package manifest from the previous release commit, if it exists.
 *
 * @param {{ baseRef?: string, cwd?: string, manifestPath: string }} options Git read options.
 * @returns {undefined | { name?: string, version?: string }} The parsed previous package manifest.
 */
export function readPreviousPackageManifest(options) {
  const baseRef = options.baseRef ?? DEFAULT_BASE_REF;
  const manifestPath = resolveManifestPath(options);

  try {
    return JSON.parse(
      execFileSync("git", ["show", `${baseRef}:${manifestPath.relativePath}`], {
        cwd: options.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined;
  }
}

/**
 * Computes the package tag that still needs to be created during publish rerun recovery.
 *
 * @param {{ baseRef?: string, cwd?: string, manifest?: { name?: string, version?: string }, manifestPath: string, readPreviousManifest?: (options: { baseRef?: string, cwd?: string, manifestPath: string }) => undefined | { name?: string, version?: string } }} options Tag computation options.
 * @returns {undefined | string} The package tag to create, or undefined when the version did not change.
 */
export function computePendingTag(options) {
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

  return `${manifest.name}@${manifest.version}`;
}

function resolveManifestPath(options) {
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

function assertPathInsideBase(options) {
  const relativePath = relative(options.basePath, options.absolutePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Invalid manifest path "${options.manifestPath}".`);
  }
}

/**
 * Runs the pending package tag computation CLI.
 *
 * @param {string[]} args CLI arguments.
 * @param {{ baseRef?: string, cwd?: string }} options Runtime options.
 * @returns {undefined | string} The computed package tag.
 */
export function main(args = process.argv.slice(2), options = {}) {
  const [manifestPath] = args;
  if (manifestPath == null) {
    throw new Error(
      "Usage: node scripts/release/compute-pending-tag.mjs <manifest-path>",
    );
  }

  const tag = computePendingTag({
    baseRef: options.baseRef,
    cwd: options.cwd,
    manifestPath,
  });

  if (tag != null) {
    process.stdout.write(tag);
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
