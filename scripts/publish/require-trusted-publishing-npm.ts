#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { isMain, reportCliError } from "../workflow.ts";

/**
 * Checks that npm supports trusted publishing for both publish and dist-tag.
 *
 * @param version - Output of `npm --version`, such as `11.21.0`.
 * @throws If the version is malformed, a prerelease, or lacks OIDC dist-tag support.
 */
export function assertTrustedPublishingNpm(version: string): void {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`Unrecognized npm version "${version}".`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (
    major < 11 ||
    (major === 11 && minor < 21) ||
    (major === 12 && minor < 2)
  ) {
    throw new Error(
      `npm ${version.trim()} is older than the OIDC dist-tag minimum (11.21.0 on npm 11, 12.2.0 on npm 12). Run scripts/publish/setup-npm.ts first.`,
    );
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
