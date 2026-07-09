#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  readPackageManifest,
  readPreviousPackageManifest,
} from "./compute-pending-tag.mjs";
import { getErrorMessage } from "./helpers.mjs";

const DEFAULT_BASE_REF = "HEAD^";
const MANIFEST_PATHSPEC = "packages/*/package.json";

/**
 * Lists the package manifests touched between a base ref and HEAD.
 *
 * Mirrors the pathspec and diff filter the publish workflow uses to create
 * package tags, so both derive the released set from the same commit range.
 *
 * @param {{ baseRef?: string, cwd?: string }} options Git read options.
 * @returns {string[]} Repository-relative manifest paths, in git's order.
 */
export function listChangedManifests(options = {}) {
  const baseRef = options.baseRef ?? DEFAULT_BASE_REF;
  const stdout = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "-z",
      "--diff-filter=ACMRT",
      baseRef,
      "HEAD",
      "--",
      MANIFEST_PATHSPEC,
    ],
    { cwd: options.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return stdout.split("\0").filter((manifestPath) => manifestPath !== "");
}

/**
 * Lists the publishable packages whose version changed between a base ref and HEAD.
 *
 * Returns an empty list when the base ref does not resolve, which is how an
 * initial commit with no parent reaches this code.
 *
 * @param {{ baseRef?: string, cwd?: string }} options Git read options.
 * @returns {{ name: string, version: string }[]} Released packages, sorted by name.
 */
export function listReleasedPackages(options = {}) {
  const baseRef = options.baseRef ?? DEFAULT_BASE_REF;
  const cwd = options.cwd;
  if (!revisionExists({ cwd, revision: baseRef })) return [];

  const releasedPackages = [];
  for (const manifestPath of listChangedManifests({ baseRef, cwd })) {
    const manifest = readPackageManifest({ cwd, manifestPath });
    if (manifest.private === true) continue;
    if (manifest.name == null || manifest.version == null) continue;

    const previousManifest = readPreviousPackageManifest({
      baseRef,
      cwd,
      manifestPath,
    });
    if (previousManifest?.version === manifest.version) continue;

    releasedPackages.push({ name: manifest.name, version: manifest.version });
  }

  return releasedPackages.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

/**
 * Renders the GitHub Actions step outputs for a released package list.
 *
 * `released_packages` is the JSON payload forwarded to the documentation
 * regeneration workflow. `JSON.stringify` cannot emit a raw newline, so the
 * value is always a single line and needs no heredoc delimiter.
 *
 * @param {{ name: string, version: string }[]} releasedPackages Released packages.
 * @returns {string} The `key=value` lines to append to `$GITHUB_OUTPUT`.
 */
export function getGitHubOutput(releasedPackages) {
  const hasReleasedPackages = releasedPackages.length > 0 ? "true" : "false";

  return [
    `has_released_packages=${hasReleasedPackages}`,
    `released_packages=${JSON.stringify(releasedPackages)}`,
    "",
  ].join("\n");
}

/**
 * Reports the released packages to `$GITHUB_OUTPUT` and stdout.
 *
 * @param {{ baseRef?: string, cwd?: string, outputFile?: string, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {{ name: string, version: string }[]} The released packages.
 */
export function reportReleasedPackages(options = {}) {
  const releasedPackages = listReleasedPackages({
    baseRef: options.baseRef,
    cwd: options.cwd,
  });
  const outputFile = options.outputFile ?? process.env.GITHUB_OUTPUT;
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));

  if (outputFile != null && outputFile !== "") {
    appendFileSync(outputFile, getGitHubOutput(releasedPackages));
  }

  writeOutput(`${JSON.stringify(releasedPackages, null, 2)}\n`);

  return releasedPackages;
}

/**
 * Runs the released package listing CLI.
 *
 * @param {{ baseRef?: string, cwd?: string, outputFile?: string, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {{ name: string, version: string }[]} The released packages.
 */
export function main(options = {}) {
  return reportReleasedPackages(options);
}

function revisionExists(options) {
  try {
    execFileSync(
      "git",
      ["rev-parse", "--verify", "--quiet", `${options.revision}^{commit}`],
      { cwd: options.cwd, stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (error) {
    // `--verify --quiet` exits 1 when the revision does not resolve. Every
    // other failure (git missing, not a repository, corruption, ...) exits
    // 128 and must propagate rather than be read as "there is no parent
    // commit", which would silently dispatch nothing on a broken checkout.
    if (isUnresolvedRevisionError(error)) return false;

    throw error;
  }

  return true;
}

function isUnresolvedRevisionError(error) {
  return (
    typeof error === "object" &&
    error != null &&
    "status" in error &&
    error.status === 1
  );
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
