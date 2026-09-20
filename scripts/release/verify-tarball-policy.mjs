#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, sanitizeLogLine } from "./helpers.mjs";

const DEFAULT_POLICY_PATH = "scripts/release/release-policy.json";
const TARBALL_ROOT = "package/";
// Lifecycle scripts a package manager runs on the consumer's machine when the
// package is installed as a dependency. Other scripts (`build`, `test`, the
// legacy `prepublish`) only run inside this repository and are inert once
// published, so they stay allowed.
const INSTALL_LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "preprepare",
  "prepare",
  "postprepare",
];
// Manifest fields that make the registry install code or additional packages
// on the consumer's machine. None of them has a legitimate use in this repo.
const FORBIDDEN_MANIFEST_FIELDS = [
  "bin",
  "bundleDependencies",
  "bundledDependencies",
];
const INSTALLED_DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * @typedef {{ dependencies: string[], files?: string[] }} PackagePolicy
 * @typedef {{ defaults: { files: string[], repositoryUrls: string[] }, packages: Record<string, PackagePolicy> }} ReleasePolicy
 */

/**
 * Reads and structurally validates the release policy file.
 *
 * @param {string} policyPath Path to the policy JSON file.
 * @returns {ReleasePolicy} The parsed policy.
 */
export function loadPolicy(policyPath) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));

  if (
    !isStringArray(policy?.defaults?.files) ||
    !isStringArray(policy?.defaults?.repositoryUrls) ||
    typeof policy?.packages !== "object" ||
    policy.packages == null
  ) {
    throw new Error(
      `Invalid release policy "${policyPath}": expected defaults.files, defaults.repositoryUrls and packages.`,
    );
  }

  for (const [name, packagePolicy] of Object.entries(policy.packages)) {
    if (
      !isStringArray(packagePolicy?.dependencies) ||
      (packagePolicy.files != null && !isStringArray(packagePolicy.files))
    ) {
      throw new Error(
        `Invalid release policy "${policyPath}": package "${name}" needs a dependencies array and an optional files array.`,
      );
    }
  }

  return policy;
}

/**
 * Returns whether a tarball entry path (relative to `package/`) is allowed by the given patterns.
 * A pattern is either an exact path or `<dir>/**`, which allows every regular file below `<dir>/`.
 *
 * @param {string} entry The entry path relative to the tarball root.
 * @param {readonly string[]} patterns The allowlist patterns.
 * @returns {boolean} Whether the entry matches a pattern.
 */
export function matchesAllowlist(entry, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith("/**")
      ? entry.startsWith(pattern.slice(0, -2))
      : entry === pattern,
  );
}

/**
 * Evaluates one packed tarball against the policy, without any I/O.
 *
 * @param {{ entries: readonly string[], manifest: Record<string, unknown>, policy: ReleasePolicy }} input The tarball entry list (as printed by `tar -tzf`), its packed manifest, and the policy.
 * @returns {string[]} Human-readable violations; empty when the tarball complies.
 */
export function evaluateTarballPolicy({ entries, manifest, policy }) {
  const violations = [];
  const name = typeof manifest.name === "string" ? manifest.name : undefined;
  const packagePolicy = name != null ? policy.packages[name] : undefined;

  if (packagePolicy == null) {
    violations.push(
      `package "${name ?? "<unnamed>"}" is not listed in the release policy`,
    );
    return violations;
  }

  const allowedFiles = [
    ...policy.defaults.files,
    ...(packagePolicy.files ?? []),
  ];
  for (const rawEntry of entries) {
    if (rawEntry.endsWith("/")) continue;
    if (!rawEntry.startsWith(TARBALL_ROOT)) {
      violations.push(`entry "${rawEntry}" is outside ${TARBALL_ROOT}`);
      continue;
    }

    const entry = rawEntry.slice(TARBALL_ROOT.length);
    if (!matchesAllowlist(entry, allowedFiles)) {
      violations.push(`file "${entry}" is not in the files allowlist`);
    }
  }

  const scripts = manifest.scripts;
  if (scripts != null) {
    if (typeof scripts !== "object") {
      violations.push('manifest field "scripts" is not an object');
    } else {
      const installScripts = INSTALL_LIFECYCLE_SCRIPTS.filter(
        (script) => scripts[script] != null,
      );
      if (installScripts.length > 0) {
        violations.push(
          `manifest declares install lifecycle scripts: ${installScripts.join(", ")}`,
        );
      }
    }
  }

  for (const field of FORBIDDEN_MANIFEST_FIELDS) {
    if (manifest[field] != null) {
      violations.push(`manifest declares forbidden field "${field}"`);
    }
  }

  const allowedDependencies = new Set(packagePolicy.dependencies);
  for (const field of INSTALLED_DEPENDENCY_FIELDS) {
    const declared = manifest[field];
    if (declared == null) continue;
    if (typeof declared !== "object") {
      violations.push(`manifest field "${field}" is not an object`);
      continue;
    }

    for (const dependency of Object.keys(declared)) {
      if (!allowedDependencies.has(dependency)) {
        violations.push(
          `${field} "${dependency}" is not in the dependency allowlist`,
        );
      }
    }
  }

  const repositoryUrl =
    typeof manifest.repository === "string"
      ? manifest.repository
      : manifest.repository?.url;
  if (
    typeof repositoryUrl !== "string" ||
    !policy.defaults.repositoryUrls.includes(repositoryUrl)
  ) {
    violations.push(
      `manifest repository "${String(repositoryUrl)}" is not an allowed repository URL`,
    );
  }

  return violations;
}

/**
 * Lists the entries of a gzipped tarball as printed by `tar -tzf`.
 *
 * @param {string} tarballPath Path to the `.tgz` file.
 * @returns {string[]} The entry paths.
 */
export function listTarballEntries(tarballPath) {
  return execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}

/**
 * Reads `package/package.json` out of a gzipped tarball without extracting anything to disk.
 *
 * @param {string} tarballPath Path to the `.tgz` file.
 * @returns {Record<string, unknown>} The packed manifest.
 */
export function readTarballManifest(tarballPath) {
  return JSON.parse(
    execFileSync("tar", ["-xzOf", tarballPath, `${TARBALL_ROOT}package.json`], {
      encoding: "utf8",
    }),
  );
}

/**
 * Lists the names of every non-private workspace package under `packages/`.
 *
 * @param {string} cwd The repository root.
 * @returns {string[]} The public package names.
 */
export function listPublicPackageNames(cwd) {
  const names = [];
  for (const dir of readdirSync(join(cwd, "packages"))) {
    const manifestPath = join(cwd, "packages", dir, "package.json");
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.private === true) continue;
    names.push(manifest.name);
  }

  return names.sort();
}

/**
 * Verifies every `.tgz` in a directory against the policy and checks that every public workspace
 * package has a policy entry, so a new package cannot be published before its policy is reviewed.
 *
 * @param {{ cwd?: string, policy: ReleasePolicy, tarballDir: string }} options Verification options.
 * @returns {{ checked: string[], violations: Map<string, string[]> }} The verified tarball names and the violations per tarball (or per missing policy entry).
 */
export function verifyTarballs({ cwd = process.cwd(), policy, tarballDir }) {
  const violations = new Map();
  const checked = [];

  for (const name of listPublicPackageNames(cwd)) {
    if (policy.packages[name] == null) {
      violations.set(name, [
        `public workspace package "${name}" has no entry in the release policy`,
      ]);
    }
  }

  const tarballs = readdirSync(tarballDir)
    .filter((file) => file.endsWith(".tgz"))
    .sort();
  if (tarballs.length === 0) {
    throw new Error(`No .tgz tarballs found in "${tarballDir}".`);
  }

  for (const tarball of tarballs) {
    const tarballPath = join(tarballDir, tarball);
    const result = evaluateTarballPolicy({
      entries: listTarballEntries(tarballPath),
      manifest: readTarballManifest(tarballPath),
      policy,
    });

    checked.push(tarball);
    if (result.length > 0) violations.set(tarball, result);
  }

  return { checked, violations };
}

/**
 * Runs the tarball policy CLI: `node scripts/release/verify-tarball-policy.mjs <tarball-dir> [policy-path]`.
 *
 * @param {string[]} args CLI arguments.
 * @param {{ cwd?: string, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {boolean} Whether every tarball complies with the policy.
 */
export function main(args = process.argv.slice(2), options = {}) {
  const [tarballDir, policyPath = DEFAULT_POLICY_PATH] = args;
  if (tarballDir == null) {
    throw new Error(
      "Usage: node scripts/release/verify-tarball-policy.mjs <tarball-dir> [policy-path]",
    );
  }

  const cwd = options.cwd ?? process.cwd();
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));
  const { checked, violations } = verifyTarballs({
    cwd,
    policy: loadPolicy(resolve(cwd, policyPath)),
    tarballDir: resolve(cwd, tarballDir),
  });

  for (const tarball of checked) {
    const result = violations.get(tarball);
    writeOutput(
      `${sanitizeLogLine(tarball)}: ${result == null ? "OK" : `FAIL (${result.length})`}\n`,
    );
  }

  for (const [subject, messages] of violations) {
    for (const message of messages) {
      writeOutput(
        `::error::${sanitizeLogLine(subject)}: ${sanitizeLogLine(message)}\n`,
      );
    }
  }

  return violations.size === 0;
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (!main()) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
