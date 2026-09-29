#!/usr/bin/env node
/**
 * verify-tarball-manifest.ts — the publishConfig allowlist gate of
 * `.github/workflows/publish.yml`. Run with Node's native TypeScript support:
 *
 *   node scripts/ci/verify-tarball-manifest.ts <path/to/package.json>
 *
 * Exits 0 and prints the validated `name@version` when the manifest's
 * `publishConfig` is restricted to the allowlist; exits 1 with an `::error::`
 * annotation otherwise. The manifest path must be a regular file (a symlink or
 * directory is rejected) and its contents are parsed as JSON, never executed.
 * Nothing besides `name@version` may be printed on stdout.
 */

import { lstatSync, readFileSync } from "node:fs";

import { isMain, reportCliError, writeStdout } from "./workflow.ts";

const NPMJS_REGISTRY_URLS = new Set([
  "https://registry.npmjs.org",
  "https://registry.npmjs.org/",
]);

const NPM_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// Official semver regex from https://semver.org (no leading `v`, no whitespace).
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** The part of a packed package manifest this validator inspects. */
export interface TarballManifest {
  readonly publishConfig?: unknown;
  readonly [key: string]: unknown;
}

/** The validated `name`/`version` identity of a packed package manifest. */
export interface TarballIdentity {
  readonly name: string;
  readonly version: string;
}

/**
 * Verifies that a packed package manifest's `publishConfig` cannot redirect
 * npm's publish traffic or the OIDC trusted-publishing exchange.
 *
 * npm 11 flattens every `publishConfig` key from the tarball's package.json
 * that is not set as a CLI flag into the publish options BEFORE the OIDC
 * exchange, so keys such as `proxy`, `https-proxy`, `strict-ssl`, or `ca`
 * would route credentialed requests through attacker-controlled transport
 * even with `--registry https://registry.npmjs.org` pinned on the CLI.
 */
export function verifyPublishConfig(manifest: TarballManifest): void {
  const publishConfig = manifest.publishConfig;
  if (publishConfig == null) {
    return;
  }

  if (typeof publishConfig !== "object" || Array.isArray(publishConfig)) {
    throw new Error(
      `Invalid publishConfig in manifest: expected an object, got ${
        Array.isArray(publishConfig) ? "array" : typeof publishConfig
      }.`,
    );
  }

  for (const [key, value] of Object.entries(
    publishConfig as Record<string, unknown>,
  )) {
    switch (key) {
      case "access":
        if (value !== "public") {
          throw new Error(
            `Invalid publishConfig.access in manifest: expected "public", got ${JSON.stringify(value)}.`,
          );
        }
        break;
      case "registry":
        if (typeof value !== "string" || !NPMJS_REGISTRY_URLS.has(value)) {
          throw new Error(
            `Invalid publishConfig.registry in manifest: expected "${[...NPMJS_REGISTRY_URLS].join('" or "')}", got ${JSON.stringify(value)}.`,
          );
        }
        break;
      default:
        throw new Error(
          `Disallowed publishConfig key "${key}" in manifest: only "access" and "registry" pinned to https://registry.npmjs.org are permitted.`,
        );
    }
  }
}

/**
 * Verifies that a packed package manifest's `name` and `version` are safe to
 * trust for the artifact bijection check in `publish.yml`, and returns them.
 */
export function verifyManifestIdentity(
  manifest: TarballManifest,
): TarballIdentity {
  const { name, version } = manifest;
  if (
    typeof name !== "string" ||
    name.length > 214 ||
    !NPM_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      `Invalid name in manifest: expected an npm package name, got ${JSON.stringify(name)}.`,
    );
  }
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new Error(
      `Invalid version in manifest: expected a semver version, got ${JSON.stringify(version)}.`,
    );
  }
  return { name, version };
}

/**
 * Runs every manifest gate (`publishConfig` allowlist first, then identity)
 * and returns the validated `name`/`version`.
 */
export function verifyTarballManifest(
  manifest: TarballManifest,
): TarballIdentity {
  verifyPublishConfig(manifest);
  return verifyManifestIdentity(manifest);
}

/** CLI entrypoint: `node scripts/ci/verify-tarball-manifest.ts <manifest-path>`. */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const manifestPath = argv[0];
  if (manifestPath == null) {
    throw new Error(
      "Usage: node scripts/ci/verify-tarball-manifest.ts <manifest-path>",
    );
  }

  if (!lstatSync(manifestPath).isFile()) {
    throw new Error(`Manifest path "${manifestPath}" is not a regular file.`);
  }

  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    throw new Error(`Manifest at "${manifestPath}" is not a JSON object.`);
  }

  const { name, version } = verifyTarballManifest(manifest as TarballManifest);
  writeStdout(`${name}@${version}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
