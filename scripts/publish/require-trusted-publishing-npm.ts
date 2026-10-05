#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { isMain, reportCliError } from "../workflow.ts";

/** npm trusted publishing (OIDC) needs npm 11.5.1 or later. */
const MINIMUM = [11, 5, 1] as const;

/**
 * Checks that an npm version supports trusted publishing.
 *
 * @param version - Output of `npm --version`, such as `11.6.2`.
 * @throws If the version is malformed or older than 11.5.1.
 */
export function assertTrustedPublishingNpm(version: string): void {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) throw new Error(`Unrecognized npm version "${version}".`);
  const parts = match.slice(1, 4).map(Number);
  for (const [index, minimum] of MINIMUM.entries()) {
    const part = parts[index] ?? 0;
    if (part > minimum) return;
    if (part < minimum) {
      throw new Error(
        `npm ${version.trim()} is older than ${MINIMUM.join(".")}, so trusted publishing is unavailable. Use a Node release that bundles a newer npm.`,
      );
    }
  }
}

if (isMain(import.meta.url)) {
  try {
    assertTrustedPublishingNpm(
      execFileSync("npm", ["--version"], { encoding: "utf8" }),
    );
  } catch (error) {
    reportCliError(error);
  }
}
