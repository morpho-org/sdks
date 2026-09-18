#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, isPathInside } from "./helpers.ts";

const DEFAULT_PACKAGES_DIR = "packages";
const PACKAGE_TAG_SEPARATORS = ["-v", "@"];
const VERSION_HEADING_RE =
  /^##\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?(?:\s|$).*/gm;

/** A package being released: manifest name, published version, and changelog path. */
export interface ReleasePackage {
  readonly changelogPath: string;
  readonly name: string;
  readonly version: string;
}

interface ReadReleasePackagesOptions {
  packagesDir?: string;
}

interface GitHubReleaseBodyOptions extends ReadReleasePackagesOptions {
  packages?: ReleasePackage[];
  tag: string;
}

export function readReleasePackages(
  options: ReadReleasePackagesOptions = {},
): ReleasePackage[] {
  const packagesDir = options.packagesDir ?? DEFAULT_PACKAGES_DIR;
  const packagesRoot = resolve(packagesDir);
  const packages: ReleasePackage[] = [];

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = resolve(packagesRoot, entry.name, "package.json");
    if (!isPathInside(packagesRoot, packageJsonPath)) continue;
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    if (typeof packageJson.name !== "string" || packageJson.name === "")
      continue;
    if (typeof packageJson.version !== "string" || packageJson.version === "")
      continue;

    const changelogPath = resolve(packagesRoot, entry.name, "CHANGELOG.md");
    if (!isPathInside(packagesRoot, changelogPath)) continue;

    packages.push({
      name: packageJson.name,
      version: packageJson.version,
      changelogPath,
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function matchReleaseTag(options: {
  packages: ReleasePackage[];
  tag: string;
}): ReleasePackage {
  const matches: ReleasePackage[] = [];

  for (const releasePackage of options.packages) {
    for (const separator of PACKAGE_TAG_SEPARATORS) {
      if (options.tag === getPackageTag({ releasePackage, separator })) {
        matches.push(releasePackage);
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(`Cannot map tag "${options.tag}" to a package.`);
  }

  if (matches.length > 1) {
    const names = matches
      .map((releasePackage) => `"${releasePackage.name}"`)
      .join(", ");
    throw new Error(`Tag "${options.tag}" is ambiguous; matches ${names}.`);
  }

  return matches[0]!;
}

export function extractVersionSection(options: {
  changelog: string;
  version: string;
}): string | undefined {
  const heading = new RegExp(
    `^##\\s+${escapeRegExp(options.version)}(?:\\s|$).*`,
    "m",
  );
  const match = heading.exec(options.changelog);
  if (match == null) return undefined;

  const sectionStart = match.index;
  const searchStart = sectionStart + match[0].length;
  const nextVersionHeading = findNextVersionHeading({
    changelog: options.changelog,
    start: searchStart,
  });
  const sectionEnd = nextVersionHeading?.index ?? options.changelog.length;

  return `${options.changelog.slice(sectionStart, sectionEnd).trim()}\n`;
}

export function buildGitHubReleaseBody(
  options: GitHubReleaseBodyOptions,
): string {
  const packages = options.packages ?? readReleasePackages(options);
  const packagesRoot = resolve(options.packagesDir ?? DEFAULT_PACKAGES_DIR);
  const releasePackage = matchReleaseTag({ tag: options.tag, packages });
  const changelogPath = resolve(releasePackage.changelogPath);

  if (
    !isPathInside(packagesRoot, changelogPath) ||
    !existsSync(changelogPath)
  ) {
    throw new Error(`Cannot find a changelog for "${releasePackage.name}".`);
  }

  const changelog = readFileSync(changelogPath, "utf8");
  const section = extractVersionSection({
    changelog,
    version: releasePackage.version,
  });

  if (section == null) {
    throw new Error(
      `Cannot find version "${releasePackage.version}" in ${changelogPath}.`,
    );
  }

  return section;
}

export function writeGitHubReleaseBody(
  options: GitHubReleaseBodyOptions & { bodyFile: string },
): void {
  writeFileSync(options.bodyFile, buildGitHubReleaseBody(options));
}

export function main(
  args: string[] = process.argv.slice(2),
  options: ReadReleasePackagesOptions & { packages?: ReleasePackage[] } = {},
): void {
  const [tag, bodyFile] = args;
  if (tag == null || bodyFile == null) {
    throw new Error(
      "Usage: node scripts/release/github-release-body.ts <tag> <body-file>",
    );
  }

  writeGitHubReleaseBody({ ...options, tag, bodyFile });
}

function getPackageTag(options: {
  releasePackage: ReleasePackage;
  separator: string;
}): string {
  return `${options.releasePackage.name}${options.separator}${options.releasePackage.version}`;
}

function findNextVersionHeading(options: {
  changelog: string;
  start: number;
}): RegExpExecArray | undefined {
  VERSION_HEADING_RE.lastIndex = options.start;
  return VERSION_HEADING_RE.exec(options.changelog) ?? undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
