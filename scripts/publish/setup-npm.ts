#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isMain, readRequiredEnv, reportCliError } from "../workflow.ts";

const VERSION = "11.21.2";
const INTEGRITY =
  "7HPApk+AflMUavSseL1Pm6CnYqMIHk53x+KmuhqmTDqPkjPMgxIpTPcTqsE91EKNw4gFBJV9fnXiSdGm1DXq9A==";

/** Rejects a changed npm distribution before extracting or executing any of it. */
export function verifyNpmArchive(
  bytes: Uint8Array,
  expected = INTEGRITY,
): void {
  if (createHash("sha512").update(bytes).digest("base64") !== expected) {
    throw new Error(
      `npm ${VERSION} archive does not match its pinned SHA-512.`,
    );
  }
}

/** Sets up checksum-pinned npm with OIDC dist-tag support, without installing dependencies. */
export async function main(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const prefix = join(readRequiredEnv(env, "RUNNER_TEMP"), "release-npm");
  const githubEnv = readRequiredEnv(env, "GITHUB_ENV");
  const githubPath = readRequiredEnv(env, "GITHUB_PATH");
  const url = `https://registry.npmjs.org/npm/-/npm-${VERSION}.tgz`;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // No registry-supplied integrity: the reviewed digest is fixed in this script.
  verifyNpmArchive(bytes);
  const npmRoot = join(prefix, "lib", "node_modules", "npm");
  const bin = join(prefix, "bin");
  mkdirSync(npmRoot, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const archive = join(prefix, "npm.tgz");
  writeFileSync(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", npmRoot]);
  symlinkSync(join(npmRoot, "bin", "npm-cli.js"), join(bin, "npm"));
  appendFileSync(githubEnv, `NPM_CONFIG_PREFIX=${prefix}\n`);
  appendFileSync(githubPath, `${bin}\n`);
}

if (isMain(import.meta.url)) main().catch(reportCliError);
