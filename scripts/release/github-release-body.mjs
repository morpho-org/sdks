#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PACKAGES_DIR = "packages";
const PACKAGE_TAG_SEPARATORS = ["@", "-v"];
const VERSION_HEADING_RE =
  /^##\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?(?:\s|$).*/gm;

export function readReleasePackages(options = {}) {
  const packagesDir = options.packagesDir ?? DEFAULT_PACKAGES_DIR;
  const packages = [];

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = join(packagesDir, entry.name, "package.json");
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name !== "string" || packageJson.name === "")
      continue;
    if (typeof packageJson.version !== "string" || packageJson.version === "")
      continue;

    packages.push({
      name: packageJson.name,
      version: packageJson.version,
      changelogPath: join(packagesDir, entry.name, "CHANGELOG.md"),
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function matchReleaseTag(options) {
  const matches = [];

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

  return matches[0];
}

export function extractVersionSection(options) {
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

export function buildGitHubReleaseBody(options) {
  const packages = options.packages ?? readReleasePackages(options);
  const releasePackage = matchReleaseTag({ tag: options.tag, packages });

  if (!existsSync(releasePackage.changelogPath)) {
    throw new Error(`Cannot find a changelog for "${releasePackage.name}".`);
  }

  const changelog = readFileSync(releasePackage.changelogPath, "utf8");
  const section = extractVersionSection({
    changelog,
    version: releasePackage.version,
  });

  if (section == null) {
    throw new Error(
      `Cannot find version "${releasePackage.version}" in ${releasePackage.changelogPath}.`,
    );
  }

  return section;
}

export function writeGitHubReleaseBody(options) {
  writeFileSync(options.bodyFile, buildGitHubReleaseBody(options));
}

export function main(args = process.argv.slice(2)) {
  const [tag, bodyFile] = args;
  if (tag == null || bodyFile == null) {
    throw new Error(
      "Usage: node scripts/release/github-release-body.mjs <tag> <body-file>",
    );
  }

  writeGitHubReleaseBody({ tag, bodyFile });
}

function getPackageTag(options) {
  return `${options.releasePackage.name}${options.separator}${options.releasePackage.version}`;
}

function findNextVersionHeading(options) {
  VERSION_HEADING_RE.lastIndex = options.start;
  return VERSION_HEADING_RE.exec(options.changelog) ?? undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
