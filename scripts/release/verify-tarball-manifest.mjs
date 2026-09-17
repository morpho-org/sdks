#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getErrorMessage } from "./helpers.mjs";

const NPMJS_REGISTRY_URLS = new Set([
  "https://registry.npmjs.org",
  "https://registry.npmjs.org/",
]);

/**
 * Verifies that a packed package manifest's `publishConfig` cannot redirect
 * npm's publish traffic or the OIDC trusted-publishing exchange.
 *
 * npm 11 flattens every `publishConfig` key from the tarball's package.json
 * that is not set as a CLI flag into the publish options BEFORE the OIDC
 * exchange, so keys such as `proxy`, `https-proxy`, `strict-ssl`, or `ca`
 * would route credentialed requests through attacker-controlled transport
 * even with `--registry https://registry.npmjs.org` pinned on the CLI.
 *
 * @param {{ publishConfig?: unknown }} manifest The parsed package manifest.
 * @returns {void}
 */
export function verifyPublishConfig(manifest) {
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

  for (const [key, value] of Object.entries(publishConfig)) {
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

/**
 * Runs the tarball manifest verification CLI.
 *
 * @param {string[]} args CLI arguments.
 * @returns {void}
 */
export function main(args = process.argv.slice(2)) {
  const [manifestPath] = args;
  if (manifestPath == null) {
    throw new Error(
      "Usage: node scripts/release/verify-tarball-manifest.mjs <manifest-path>",
    );
  }

  verifyPublishConfig(JSON.parse(readFileSync(manifestPath, "utf8")));
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
