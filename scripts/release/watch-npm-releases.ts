#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getErrorMessage, sanitizeLogLine } from "./helpers.ts";

const REGISTRY_URL = "https://registry.npmjs.org";
const GITHUB_API_URL = "https://api.github.com";
const ISSUE_LABEL = "npm-release-verify";
const DEFAULT_LOOKBACK_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;

interface Packument {
  versions?: Record<string, ReleaseManifest>;
  time?: Record<string, string>;
  "dist-tags"?: Record<string, string>;
}

interface ReleaseManifest {
  dist?: {
    integrity?: string;
    tarball?: string;
    attestations?: { url?: string };
  };
  _npmUser?: { trustedPublisher?: { id?: string } };
}

interface RecentVersion {
  version: string;
  publishTime: string;
  manifest: ReleaseManifest;
}

interface ReleaseCandidate extends RecentVersion {
  name: string;
  body: string;
}

/**
 * Selects versions with manifests and publish timestamps inside the lookback window.
 *
 * @param packument The npm package metadata.
 * @param nowMs The current time in milliseconds.
 * @param lookbackMs The lookback duration in milliseconds.
 * @returns Recent versions in ascending publish-time order.
 */
// biome-ignore lint/complexity/useMaxParams: Keep the required exported API signature.
export function selectRecentVersions(
  packument: Packument,
  nowMs: number,
  lookbackMs: number,
): RecentVersion[] {
  const lowerBound = nowMs - lookbackMs;
  return Object.entries(packument.time ?? {})
    .filter(([version, publishTime]) => {
      const timestamp = Date.parse(publishTime);
      return (
        version !== "created" &&
        version !== "modified" &&
        packument.versions?.[version] != null &&
        Number.isFinite(timestamp) &&
        timestamp >= lowerBound
      );
    })
    .map(([version, publishTime]) => ({
      version,
      publishTime,
      manifest: packument.versions?.[version] ?? {},
    }))
    .sort(
      (left, right) =>
        Date.parse(left.publishTime) - Date.parse(right.publishTime),
    );
}

/**
 * Formats the exact issue title for an npm release.
 *
 * @param name The npm package name.
 * @param version The published package version.
 * @returns The release issue title.
 */
export function releaseIssueTitle(name: string, version: string): string {
  return `npm release: ${name}@${version}`;
}

/**
 * Renders the informational body for a release-verification issue.
 *
 * @param release The release details to include.
 * @returns The issue body.
 */
export function renderReleaseIssueBody(release: {
  name: string;
  version: string;
  publishTime: string;
  distTags: string[];
  integrity: string;
  tarball: string;
  attestationsUrl: string;
  trustedPublisherPresent: boolean;
}): string {
  const inlineCode = (value: string): string =>
    `\`${value.replaceAll("`", "").replace(/[\r\n]/g, "")}\``;
  const tarball = release.tarball || "MISSING";
  const renderedTarball = tarball.startsWith(`${REGISTRY_URL}/`)
    ? inlineCode(tarball)
    : `UNEXPECTED (${inlineCode(tarball)})`;
  return [
    `- Package: ${inlineCode(release.name)}`,
    `- Version: ${inlineCode(release.version)}`,
    `- Publish time: ${inlineCode(release.publishTime)}`,
    `- Dist-tags pointing to this version: ${inlineCode(release.distTags.length > 0 ? release.distTags.join(", ") : "none")}`,
    `- Integrity: ${inlineCode(release.integrity || "MISSING")}`,
    `- Tarball: ${renderedTarball}`,
    `- Attestations: ${inlineCode(release.attestationsUrl || "MISSING")}`,
    `- Trusted publisher present: ${release.trustedPublisherPresent ? "yes" : "no"}`,
    "",
    "Opened by npm-release-watch (SDK-1264). A Devin Automation verifies this release and comments here.",
  ].join("\n");
}

/**
 * Removes candidates whose issue titles are already present.
 *
 * @param candidates The candidate releases.
 * @param existingTitles Titles of existing issues.
 * @returns Releases without a matching existing issue.
 */
export function findMissingReleases<
  T extends { name: string; version: string },
>(candidates: readonly T[], existingTitles: readonly string[]): T[] {
  const existing = new Set(existingTitles);
  return candidates.filter(
    ({ name, version }) => !existing.has(releaseIssueTitle(name, version)),
  );
}

function readPackages(cwd: string): { name: string }[] {
  return readdirSync(`${cwd}/packages`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = `${cwd}/packages/${entry.name}/package.json`;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: string;
          private?: boolean;
        };
        return manifest.private !== true && manifest.name != null
          ? [{ name: manifest.name }]
          : [];
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return [];
        }
        throw error;
      }
    });
}

async function readJsonResponse<T>(
  response: Response,
  operation: string,
): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${operation} failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(body) as T;
  } catch (cause) {
    throw new Error(`${operation} returned invalid JSON.`, { cause });
  }
}

async function fetchPackument(
  name: string,
  fetchImpl: typeof fetch,
): Promise<Packument | null> {
  const encodedName = name.replaceAll("/", "%2f");
  const response = await fetchImpl(`${REGISTRY_URL}/${encodedName}`, {
    redirect: "error",
  });
  if (response.status === 404) return null;
  return readJsonResponse<Packument>(
    response,
    `npm registry request for ${name}`,
  );
}

async function fetchExistingIssueTitles(options: {
  repository: string;
  token: string;
  since: string;
  fetchImpl: typeof fetch;
}): Promise<string[]> {
  const titles: string[] = [];
  for (let page = 1; ; page += 1) {
    const url = new URL(`${GITHUB_API_URL}/repos/${options.repository}/issues`);
    url.search = new URLSearchParams({
      labels: ISSUE_LABEL,
      state: "all",
      since: options.since,
      per_page: "100",
      page: String(page),
    }).toString();
    const issues = await githubRequest<
      { title?: string; pull_request?: unknown }[]
    >({
      url,
      token: options.token,
      init: { method: "GET" },
      operation: "List release issues",
      fetchImpl: options.fetchImpl,
    });
    titles.push(
      ...issues
        .filter((issue) => issue.pull_request == null && issue.title != null)
        .map((issue) => issue.title as string),
    );
    if (issues.length < 100) return titles;
  }
}

async function githubRequest<T>(options: {
  url: URL;
  token: string;
  init: RequestInit;
  operation: string;
  allowExistingLabel?: boolean;
  fetchImpl: typeof fetch;
}): Promise<T> {
  const { url, token, init, operation, allowExistingLabel, fetchImpl } =
    options;
  const response = await fetchImpl(url, {
    ...init,
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    let alreadyExists = false;
    if (response.status === 422) {
      try {
        const detail = JSON.parse(body) as {
          errors?: { code?: string }[];
          message?: string;
        };
        alreadyExists =
          detail.errors?.some((error) => error.code === "already_exists") ??
          false;
      } catch {
        alreadyExists = false;
      }
    }
    if (alreadyExists && allowExistingLabel === true) return undefined as T;
    throw new Error(
      `${operation} failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`,
    );
  }
  if (body === "") return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch (cause) {
    throw new Error(`${operation} returned invalid JSON.`, { cause });
  }
}

async function ensureIssueLabel(options: {
  repository: string;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const { repository, token, fetchImpl } = options;
  await githubRequest({
    url: new URL(`${GITHUB_API_URL}/repos/${repository}/labels`),
    token,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ISSUE_LABEL,
        color: "1d76db",
        description: "Verify newly published npm releases",
      }),
    },
    operation: "Ensure npm release issue label",
    allowExistingLabel: true,
    fetchImpl,
  });
}

/**
 * Scans npm versions and creates one issue for each unseen recent release.
 *
 * @param args Command-line arguments.
 * @param options Optional runtime inputs for tests and local execution.
 * @returns The number of package/version candidates discovered.
 */
export async function main(
  args: string[] = process.argv.slice(2),
  options: {
    cwd?: string;
    nowMs?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<number> {
  let lookbackHours = DEFAULT_LOOKBACK_HOURS;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dry-run") {
      dryRun = true;
    } else if (args[index] === "--lookback-hours") {
      const parsed = Number(args[index + 1]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--lookback-hours requires a positive number.");
      }
      lookbackHours = parsed;
      index += 1;
    } else {
      throw new Error(
        "Usage: node scripts/release/watch-npm-releases.ts [--dry-run] [--lookback-hours N]",
      );
    }
  }

  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  if (token == null || token === "") {
    if (!dryRun) {
      throw new Error("GITHUB_TOKEN is required unless --dry-run is used.");
    }
  } else if (repository == null || repository === "") {
    throw new Error("GITHUB_REPOSITORY is required when GITHUB_TOKEN is set.");
  }

  const nowMs = options.nowMs ?? Date.now();
  const lookbackMs = lookbackHours * HOUR_MS;
  const packages = readPackages(options.cwd ?? process.cwd());
  const candidates: ReleaseCandidate[] = [];
  const packageErrors: { name: string; detail: string }[] = [];
  for (const { name } of packages) {
    try {
      const packument = await fetchPackument(name, fetchImpl);
      if (packument == null) {
        process.stdout.write(
          `Skipping ${name}: npm registry returned 404 (not published yet).\n`,
        );
        continue;
      }
      for (const release of selectRecentVersions(
        packument,
        nowMs,
        lookbackMs,
      )) {
        const distTags = Object.entries(packument["dist-tags"] ?? {})
          .filter(([, version]) => version === release.version)
          .map(([tag]) => tag);
        candidates.push({
          ...release,
          name,
          body: renderReleaseIssueBody({
            name,
            version: release.version,
            publishTime: release.publishTime,
            distTags,
            integrity: release.manifest.dist?.integrity ?? "",
            tarball: release.manifest.dist?.tarball ?? "",
            attestationsUrl: release.manifest.dist?.attestations?.url ?? "",
            trustedPublisherPresent:
              release.manifest._npmUser?.trustedPublisher != null,
          }),
        });
      }
    } catch (error) {
      packageErrors.push({
        name,
        detail: sanitizeLogLine(getErrorMessage(error)),
      });
    }
  }

  let missing = candidates;
  if (token != null && token !== "" && repository != null) {
    if (!dryRun) await ensureIssueLabel({ repository, token, fetchImpl });
    const existingTitles = await fetchExistingIssueTitles({
      repository,
      token,
      since: new Date(nowMs - lookbackMs - 24 * HOUR_MS).toISOString(),
      fetchImpl,
    });
    missing = findMissingReleases(candidates, existingTitles);
  } else if (dryRun) {
    process.stdout.write(
      "GITHUB_TOKEN is not set; skipping release issue deduplication.\n",
    );
  } else {
    throw new Error("GITHUB_TOKEN is required unless --dry-run is used.");
  }

  if (dryRun) {
    for (const candidate of missing) {
      process.stdout.write(
        `Would create: ${releaseIssueTitle(candidate.name, candidate.version)}\n`,
      );
    }
  } else {
    const issueRepository = repository as string;
    const issueToken = token as string;
    let created = 0;
    for (const candidate of missing) {
      try {
        await githubRequest({
          url: new URL(`${GITHUB_API_URL}/repos/${issueRepository}/issues`),
          token: issueToken,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: releaseIssueTitle(candidate.name, candidate.version),
              body: candidate.body,
              labels: [ISSUE_LABEL],
            }),
          },
          operation: `Create release issue for ${candidate.name}@${candidate.version}`,
          fetchImpl,
        });
        created += 1;
      } catch (error) {
        packageErrors.push({
          name: `${candidate.name}@${candidate.version}`,
          detail: sanitizeLogLine(getErrorMessage(error)),
        });
      }
    }
    process.stdout.write(
      `Checked ${packages.length} packages; found ${candidates.length} recent versions; created ${created} issues.\n`,
    );
    if (packageErrors.length > 0) {
      throw new Error(
        `${packageErrors.length} package operation(s) failed: ${packageErrors
          .map(({ name, detail }) => `${name}: ${detail}`)
          .join("; ")}`,
      );
    }
    return candidates.length;
  }
  process.stdout.write(
    `Checked ${packages.length} packages; found ${candidates.length} recent versions; would create ${missing.length} issues.\n`,
  );
  if (packageErrors.length > 0) {
    throw new Error(
      `${packageErrors.length} package operation(s) failed: ${packageErrors
        .map(({ name, detail }) => `${name}: ${detail}`)
        .join("; ")}`,
    );
  }
  return candidates.length;
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
