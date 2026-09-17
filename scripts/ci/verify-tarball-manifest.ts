#!/usr/bin/env node
/**
 * Validates the untrusted manifest extracted from a release tarball.
 *
 * Run with Node's native TypeScript support:
 *
 *   node scripts/ci/verify-tarball-manifest.ts <path/to/package.json>
 */

import { readFileSync } from "node:fs";

import { isMain, reportCliError } from "./workflow.ts";

const NPMJS_REGISTRY_URLS = new Set([
  "https://registry.npmjs.org",
  "https://registry.npmjs.org/",
]);

/** The portion of a packed package manifest inspected by the validator. */
export interface TarballManifest {
  readonly publishConfig?: unknown;
  readonly [key: string]: unknown;
}

/**
 * Verifies that `publishConfig` cannot alter npm's publish transport.
 *
 * npm flattens tarball `publishConfig` keys into its publish options before
 * exchanging the trusted-publishing OIDC token. Only the repository's
 * expected npmjs packaging fields are therefore accepted.
 *
 * @param manifest - The parsed package manifest from the tarball.
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
            `Invalid publishConfig.access in manifest: expected "public", got "${value}".`,
          );
        }
        break;
      case "registry":
        if (typeof value !== "string" || !NPMJS_REGISTRY_URLS.has(value)) {
          throw new Error(
            `Invalid publishConfig.registry in manifest: expected "${[...NPMJS_REGISTRY_URLS].join('" or "')}", got "${value}".`,
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

/** CLI entrypoint for validating a packed package manifest. */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const manifestPath = argv[0];
  if (manifestPath == null) {
    throw new Error(
      "Usage: node scripts/ci/verify-tarball-manifest.ts <manifest-path>",
    );
  }

  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Invalid manifest at "${manifestPath}": expected a JSON object root, got ${
        parsed === null
          ? "null"
          : Array.isArray(parsed)
            ? "array"
            : typeof parsed
      }.`,
    );
  }

  verifyPublishConfig(parsed as TarballManifest);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
