#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  isMain,
  reportCliError,
  sanitizeAnnotation,
  writeStdout,
} from "../ci/workflow.ts";

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
] as const;
// Manifest fields that make the registry install code or additional packages
// on the consumer's machine. None of them has a legitimate use in this repo.
const FORBIDDEN_MANIFEST_FIELDS = [
  "bin",
  "bundleDependencies",
  "bundledDependencies",
] as const;
const INSTALLED_DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
// Path segments npm would resolve differently from the literal tarball entry,
// which would let an entry escape the allowlisted directory it appears under.
const NON_CANONICAL_SEGMENTS = new Set(["", ".", ".."]);

export interface PackagePolicy {
  readonly dependencies: readonly string[];
  readonly files?: readonly string[];
}

export interface ReleasePolicy {
  readonly defaults: {
    readonly files: readonly string[];
    readonly repositoryUrls: readonly string[];
  };
  readonly packages: Readonly<Record<string, PackagePolicy>>;
}

export type PackedManifest = Readonly<Record<string, unknown>>;

export interface VerifyTarballsOptions {
  readonly cwd?: string;
  readonly policy: ReleasePolicy;
  readonly tarballDir: string;
}

export interface VerifyTarballsResult {
  readonly checked: readonly string[];
  readonly violations: ReadonlyMap<string, readonly string[]>;
}

export interface MainOptions {
  readonly cwd?: string;
  readonly writeOutput?: (message: string) => void;
}

/** Reads and structurally validates the release policy file. */
export function loadPolicy(policyPath: string): ReleasePolicy {
  const policy: unknown = JSON.parse(readFileSync(policyPath, "utf8"));

  if (
    !isRecord(policy) ||
    !isRecord(policy.defaults) ||
    !isStringArray(policy.defaults.files) ||
    !isStringArray(policy.defaults.repositoryUrls) ||
    !isRecord(policy.packages)
  ) {
    throw new Error(
      `Invalid release policy "${policyPath}": expected defaults.files, defaults.repositoryUrls and packages.`,
    );
  }

  const packages: Record<string, PackagePolicy> = {};
  for (const [name, packagePolicy] of Object.entries(policy.packages)) {
    if (
      !isRecord(packagePolicy) ||
      !isStringArray(packagePolicy.dependencies) ||
      (packagePolicy.files != null && !isStringArray(packagePolicy.files))
    ) {
      throw new Error(
        `Invalid release policy "${policyPath}": package "${name}" needs a dependencies array and an optional files array.`,
      );
    }

    packages[name] = {
      dependencies: packagePolicy.dependencies,
      ...(packagePolicy.files != null ? { files: packagePolicy.files } : {}),
    };
  }

  return {
    defaults: {
      files: policy.defaults.files,
      repositoryUrls: policy.defaults.repositoryUrls,
    },
    packages,
  };
}

/**
 * Returns whether a tarball entry path (relative to `package/`) is allowed by the given patterns.
 * A pattern is either an exact path or `<dir>/**`, which allows every regular file below `<dir>/`.
 * Paths with empty, `.` or `..` segments never match, so an entry cannot escape its directory.
 */
export function matchesAllowlist(
  entry: string,
  patterns: readonly string[],
): boolean {
  if (!isCanonicalPath(entry)) return false;

  return patterns.some((pattern) =>
    pattern.endsWith("/**")
      ? entry.startsWith(pattern.slice(0, -2))
      : entry === pattern,
  );
}

/**
 * Evaluates one packed tarball against the policy, without any I/O.
 *
 * @param input The tarball entry list (as printed by `tar -tzf`), its packed manifest, and the policy.
 * @returns Human-readable violations; empty when the tarball complies.
 */
export function evaluateTarballPolicy({
  entries,
  manifest,
  policy,
}: {
  readonly entries: readonly string[];
  readonly manifest: PackedManifest;
  readonly policy: ReleasePolicy;
}): string[] {
  const violations: string[] = [];
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
    if (!isCanonicalPath(entry)) {
      violations.push(`file "${entry}" is not a canonical path`);
    } else if (!matchesAllowlist(entry, allowedFiles)) {
      violations.push(`file "${entry}" is not in the files allowlist`);
    }
  }

  const scripts = manifest.scripts;
  if (scripts != null) {
    if (!isRecord(scripts)) {
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
    if (!isRecord(declared)) {
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

  const repository = manifest.repository;
  const repositoryUrl =
    typeof repository === "string"
      ? repository
      : isRecord(repository)
        ? repository.url
        : undefined;
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

/** Lists the entries of a gzipped tarball as printed by `tar -tzf`. */
export function listTarballEntries(tarballPath: string): string[] {
  return execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}

/** Reads `package/package.json` out of a gzipped tarball without extracting anything to disk. */
export function readTarballManifest(tarballPath: string): PackedManifest {
  const manifest: unknown = JSON.parse(
    execFileSync("tar", ["-xzOf", tarballPath, `${TARBALL_ROOT}package.json`], {
      encoding: "utf8",
    }),
  );
  if (!isRecord(manifest)) {
    throw new Error(`Tarball "${tarballPath}" has a non-object package.json.`);
  }

  return manifest;
}

/** Lists the names of every non-private workspace package under `packages/`. */
export function listPublicPackageNames(cwd: string): string[] {
  const names: string[] = [];
  for (const dir of readdirSync(join(cwd, "packages"))) {
    const manifestPath = join(cwd, "packages", dir, "package.json");
    if (!existsSync(manifestPath)) continue;

    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!isRecord(manifest) || manifest.private === true) continue;
    if (typeof manifest.name !== "string") {
      throw new Error(`Workspace package "${manifestPath}" has no name.`);
    }
    names.push(manifest.name);
  }

  return names.sort();
}

/**
 * Verifies every `.tgz` in a directory against the policy and checks that every public workspace
 * package has a policy entry, so a new package cannot be published before its policy is reviewed.
 *
 * @returns The verified tarball names and the violations per tarball (or per missing policy entry).
 */
export function verifyTarballs({
  cwd = process.cwd(),
  policy,
  tarballDir,
}: VerifyTarballsOptions): VerifyTarballsResult {
  const violations = new Map<string, readonly string[]>();
  const checked: string[] = [];

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
 * Runs the tarball policy CLI: `node scripts/release/verify-tarball-policy.ts <tarball-dir> [policy-path]`.
 *
 * @returns Whether every tarball complies with the policy.
 */
export function main(
  args: readonly string[] = process.argv.slice(2),
  options: MainOptions = {},
): boolean {
  const [tarballDir, policyPath = DEFAULT_POLICY_PATH] = args;
  if (tarballDir == null) {
    throw new Error(
      "Usage: node scripts/release/verify-tarball-policy.ts <tarball-dir> [policy-path]",
    );
  }

  const cwd = options.cwd ?? process.cwd();
  const writeOutput = options.writeOutput ?? writeStdout;
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
        `::error::${sanitizeAnnotation(sanitizeLogLine(`${subject}: ${message}`))}\n`,
      );
    }
  }

  return violations.size === 0;
}

function isCanonicalPath(entry: string): boolean {
  return entry
    .split("/")
    .every((segment) => !NON_CANONICAL_SEGMENTS.has(segment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Replaces control characters (which could forge log lines or annotations) with `?`. */
function sanitizeLogLine(value: string): string {
  let sanitized = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    sanitized += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? "?" : char;
  }

  return sanitized;
}

if (isMain(import.meta.url)) {
  try {
    if (!main()) process.exitCode = 1;
  } catch (error: unknown) {
    reportCliError(error);
  }
}
