#!/usr/bin/env node

import { setTimeout as delay } from "node:timers/promises";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import { REGISTRY } from "./plan-npm-publish.ts";
import { SEMVER_PATTERN } from "./verify-tarball-manifest.ts";

const POLL_MS = 10_000;
const TIMEOUT_MS = 10 * 60_000;
const PACKAGE_NAME_PATTERN = /^@morpho-org\/[a-z0-9._-]+$/;

/**
 * Waits until npm's install-resolution packument lists a published version.
 *
 * @param options - Package identity and injectable registry, sleep and clock controls.
 * @throws If the identity is invalid, npm returns a malformed packument, or the version
 *   does not become visible within ten minutes.
 */
export async function waitForNpmVersion({
  name,
  version,
  fetchFn = fetch,
  sleep = delay,
  now = Date.now,
}: {
  name: string;
  version: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<void> {
  if (!PACKAGE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid Morpho package name "${name}".`);
  }
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid SemVer version "${version}".`);
  }

  const url = `${REGISTRY}/${name.replace("/", "%2F")}`;
  const deadline = now() + TIMEOUT_MS;
  let lastStatus: number | undefined;
  let lastError: unknown;
  let attempted = false;

  while (now() < deadline || !attempted) {
    attempted = true;
    let response: Response | undefined;
    let bodyText: string | undefined;
    try {
      response = await fetchFn(url, {
        headers: {
          accept: "application/vnd.npm.install-v1+json",
        },
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(POLL_MS * 3, deadline - now())),
        ),
      });
      lastStatus = response.status;
      if (response.ok) {
        bodyText = await response.text();
      }
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }

    if (response?.ok && bodyText != null) {
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch (cause) {
        throw new Error(
          `GET ${url} returned an unparseable install packument.`,
          { cause },
        );
      }
      const versions =
        typeof body === "object" && body !== null && !Array.isArray(body)
          ? (body as Record<string, unknown>).versions
          : undefined;
      if (
        typeof versions !== "object" ||
        versions === null ||
        Array.isArray(versions)
      ) {
        throw new Error(`GET ${url} returned a malformed install packument.`);
      }
      if (Object.hasOwn(versions, version)) return;
    }

    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_MS, remaining));
  }

  const lastResponse =
    lastStatus == null ? "no HTTP response" : `last HTTP status ${lastStatus}`;
  const detail =
    lastError == null ? lastResponse : `${lastResponse}; ${String(lastError)}`;
  throw new Error(
    `Timed out waiting for ${name}@${version} to appear on npm after ten minutes (${detail}).`,
    lastError == null ? undefined : { cause: lastError },
  );
}

/**
 * CLI entrypoint: `node scripts/publish/wait-for-npm-version.ts <name> <version>`.
 *
 * @param argv - Command-line arguments.
 */
async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const [name, version, ...extra] = argv;
  if (!name || !version || extra.length > 0) {
    throw new Error(
      "Usage: node scripts/publish/wait-for-npm-version.ts <name> <version>",
    );
  }
  await waitForNpmVersion({ name, version });
  writeStdout(`${name}@${version} is visible on npm.\n`);
}

if (isMain(import.meta.url)) {
  main().catch(reportCliError);
}
