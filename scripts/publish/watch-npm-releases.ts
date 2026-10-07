#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getErrorMessage,
  parseReleaseSpec,
  sanitizeLogLine,
} from "./helpers.ts";

const REGISTRY_URL = "https://registry.npmjs.org";
const GITHUB_API_URL = "https://api.github.com";
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
const DEDUP_WINDOW_MS = LOOKBACK_MS + 24 * 60 * 60 * 1000;

/** Former packages/* names of this repository, watched in case one is published again. */
const RETIRED_PACKAGES = [
  "@morpho-org/blue-api-sdk",
  "@morpho-org/blue-sdk-ethers",
  "@morpho-org/blue-sdk-ethers-liquidation",
  "@morpho-org/blue-sdk-simulation",
  "@morpho-org/blue-sdk-viem-bundler",
  "@morpho-org/blue-sdk-viem-simulation",
  "@morpho-org/blue-sdk-wagmi",
  "@morpho-org/bundler-sdk",
  "@morpho-org/bundler-sdk-ethers",
  "@morpho-org/bundler-sdk-viem",
  "@morpho-org/examples",
  "@morpho-org/liquidation-sdk-viem",
  "@morpho-org/liquidity-sdk-ethers",
  "@morpho-org/migration-sdk-viem",
  "@morpho-org/prool-viemtest",
  "@morpho-org/simulation-sdk",
  "@morpho-org/simulation-sdk-wagmi",
  "@morpho-org/test-ethers",
  "@morpho-org/test-viem",
  "@morpho-org/test-wagmi",
] as const;

type Packument = {
  versions?: Record<string, unknown>;
  time?: Record<string, string>;
};

/**
 * Selects published versions from the fixed 48-hour lookback window.
 * @param packument npm registry package metadata.
 * @param nowMs The current time in milliseconds.
 * @returns Timed recent versions in ascending publish-time order and untimed versions in packument order.
 * @throws If the packument does not contain plain version and time objects.
 */
export function selectRecentVersions(
  packument: Packument,
  nowMs: number,
): { recent: string[]; untimed: string[] } {
  const { time, versions } = packument;
  if (
    time == null ||
    typeof time !== "object" ||
    Object.getPrototypeOf(time) !== Object.prototype ||
    versions == null ||
    typeof versions !== "object" ||
    Object.getPrototypeOf(versions) !== Object.prototype
  ) {
    throw new Error("npm packument time and versions must be plain objects.");
  }

  const lowerBound = nowMs - LOOKBACK_MS;
  const recent: { version: string; publishTimeMs: number }[] = [];
  const untimed: string[] = [];
  for (const version of Object.keys(versions)) {
    const publishTime = time[version];
    const publishTimeMs =
      typeof publishTime === "string" ? Date.parse(publishTime) : NaN;
    if (!Number.isFinite(publishTimeMs)) {
      untimed.push(version);
      continue;
    }
    if (publishTimeMs >= lowerBound) recent.push({ version, publishTimeMs });
  }

  return {
    recent: recent
      .sort((left, right) => left.publishTimeMs - right.publishTimeMs)
      .map(({ version }) => version),
    untimed,
  };
}

/**
 * Formats the exact issue title for an npm release.
 * @param name The npm package name.
 * @param version The published package version.
 * @returns The release issue title.
 */
export function releaseIssueTitle(name: string, version: string): string {
  return `npm release: ${name}@${version}`;
}

/**
 * Scans npm versions and creates one issue for each unseen recent release.
 * @param options Optional runtime inputs for tests and local execution.
 */
export async function main(
  options: {
    cwd?: string;
    nowMs?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required.");
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const cwd = options.cwd ?? process.cwd();
  const discoveredNonPrivate = readdirSync(join(cwd, "packages"), {
    withFileTypes: true,
  }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const manifestPath = join(cwd, "packages", entry.name, "package.json");
    if (!existsSync(manifestPath)) return [];
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    return manifest.private === true || typeof manifest.name !== "string"
      ? []
      : [manifest.name];
  });
  const packages = [...new Set([...discoveredNonPrivate, ...RETIRED_PACKAGES])];

  const candidates: { name: string; version: string }[] = [];
  const errors: string[] = [];
  let recentVersionCount = 0;
  for (const name of packages) {
    try {
      const response = await fetchImpl(
        `${REGISTRY_URL}/${name.replaceAll("/", "%2f")}`,
        { redirect: "error" },
      );
      if (response.status === 404) {
        process.stdout.write(`Skipping ${name}: not published yet.\n`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`npm registry request failed (${response.status}).`);
      }
      const packument = (await response.json()) as Packument;
      const { recent: versions, untimed } = selectRecentVersions(
        packument,
        nowMs,
      );
      recentVersionCount += versions.length;
      for (const version of untimed) {
        errors.push(`${name}@${version}: Missing or unparsable publish time.`);
      }
      for (const version of versions) {
        try {
          candidates.push(parseReleaseSpec(`${name}@${version}`));
        } catch (error) {
          errors.push(`${name}@${version}: ${getErrorMessage(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${name}: ${getErrorMessage(error)}`);
    }
  }

  const githubHeaders = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let existingTitles: Set<string> | null = new Set();
  if (candidates.length > 0) {
    try {
      for (let page = 1; ; page += 1) {
        const url = new URL(`${GITHUB_API_URL}/repos/${repository}/issues`);
        url.search = new URLSearchParams({
          state: "all",
          creator: "github-actions[bot]",
          since: new Date(nowMs - DEDUP_WINDOW_MS).toISOString(),
          per_page: "100",
          page: String(page),
        }).toString();
        const response = await fetchImpl(url, {
          headers: githubHeaders,
          redirect: "error",
        });
        if (!response.ok) {
          throw new Error(`GitHub issue listing failed (${response.status}).`);
        }
        const issues = (await response.json()) as {
          title?: string;
          pull_request?: unknown;
        }[];
        for (const issue of issues)
          if (issue.pull_request == null && typeof issue.title === "string")
            existingTitles.add(issue.title);
        if (issues.length < 100) break;
      }
    } catch (error) {
      errors.push(`GitHub issue listing: ${getErrorMessage(error)}`);
      existingTitles = null;
    }
  }

  let createdCount = 0;
  if (existingTitles != null) {
    for (const { name, version } of candidates) {
      const title = releaseIssueTitle(name, version);
      if (existingTitles.has(title)) continue;
      try {
        const response = await fetchImpl(
          `${GITHUB_API_URL}/repos/${repository}/issues`,
          {
            method: "POST",
            headers: {
              ...githubHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title,
              body: `Opened by npm-release-watch (SDK-1264). A Devin Automation verifies this release and comments here.\n\nhttps://www.npmjs.com/package/${name}/v/${version}`,
            }),
            redirect: "error",
          },
        );
        if (!response.ok) {
          throw new Error(`GitHub issue creation failed (${response.status}).`);
        }
        createdCount += 1;
        existingTitles.add(title);
      } catch (error) {
        errors.push(`${title}: ${getErrorMessage(error)}`);
      }
    }
  }

  process.stdout.write(
    `Checked ${packages.length} packages; found ${recentVersionCount} recent versions; created ${createdCount} issues.\n`,
  );
  if (errors.length > 0) {
    errors.forEach((error) =>
      process.stderr.write(`${sanitizeLogLine(error)}\n`),
    );
    throw new Error(errors.join("; "));
  }
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${sanitizeLogLine(getErrorMessage(error))}\n`);
    process.exitCode = 1;
  });
}
