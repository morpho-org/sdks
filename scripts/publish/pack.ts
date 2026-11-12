#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { isMain, reportCliError, writeStdout } from "../workflow.ts";
import type { TarballIdentity } from "./read-tarball-identity.ts";

/** A package that is published to npm. */
export interface PublicPackage extends TarballIdentity {
  /** Directory relative to the repository root, such as `packages/blue-sdk`. */
  readonly dir: string;
}

/**
 * Returns the npm identity of a parsed `package.json`, or `undefined` when the
 * package is private and never published.
 *
 * @param manifest - Parsed `package.json`.
 * @param location - Where the manifest came from, for error messages, such as
 *   `"packages/a/package.json" at HEAD`.
 * @returns The name and version.
 * @throws If a non-private manifest lacks a string name or version.
 */
export function publicIdentity(
  manifest: unknown,
  location: string,
): TarballIdentity | undefined {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error(`${location} must be a JSON object.`);
  }
  if ("private" in manifest && manifest.private === true) return undefined;
  if (
    !("name" in manifest) ||
    typeof manifest.name !== "string" ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error(`${location} needs a "name" and a "version".`);
  }
  return { name: manifest.name, version: manifest.version };
}

/**
 * Lists the packages under `packages/` that are published to npm.
 *
 * @param root - Repository root.
 * @returns The packages, sorted by directory.
 */
export function listPublicPackages(root: string): PublicPackage[] {
  const packages: PublicPackage[] = [];
  for (const name of readdirSync(join(root, "packages")).sort()) {
    const dir = `packages/${name}`;
    const manifestPath = join(root, dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const identity = publicIdentity(
      JSON.parse(readFileSync(manifestPath, "utf8")),
      `"${dir}/package.json"`,
    );
    if (identity) packages.push({ dir, ...identity });
  }
  return packages;
}

/**
 * Tells a SemVer prerelease (`1.2.0-next.0`) from a stable `x.y.z` version.
 *
 * @param version - Package version.
 * @returns Whether the version is `x.y.z-<prerelease>`, without build metadata.
 */
export function isPrerelease(version: string): boolean {
  return /^\d+\.\d+\.\d+-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/.test(version);
}

/**
 * Formats the git tag of a package release.
 *
 * @param pkg - The package.
 * @returns `<name>-v<version>`.
 */
export function releaseTag(pkg: TarballIdentity) {
  return `${pkg.name}-v${pkg.version}`;
}

/**
 * Finds the commit that first set a package to its current name and version on
 * the mainline, so a tag created by a later run still marks where the version
 * was set. A package renamed at an unchanged version is tagged on the rename,
 * not on an earlier commit whose manifest still holds the old name. It follows
 * a package moved between `packages/<dir>` directories at an unchanged name and
 * version back to where that version was set. On a normal run that is also the
 * commit npm provenance records; if an earlier run failed before publishing,
 * provenance records the later commit that published it instead. Only
 * first-parent history counts: a version set on a side branch is released by
 * the commit that merged it into the mainline.
 *
 * @param root - Repository root, with full history.
 * @param pkg - The package, at its current name and version.
 * @returns The commit SHA.
 * @throws If no mainline commit sets that name and version, or git fails or a
 *   historical manifest is malformed, or multiple historical directories hold
 *   the package's identity.
 */
export function releaseCommit(root: string, pkg: PublicPackage): string {
  let path = `${pkg.dir}/package.json`;
  let tip = "HEAD";
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const identityAt = (
    commit: string,
    manifestPath: string,
  ): TarballIdentity | undefined | null => {
    if (!git("ls-tree", "--name-only", commit, "--", manifestPath).trim())
      return null;
    const manifest: unknown = JSON.parse(
      git("show", `${commit}:${manifestPath}`),
    );
    return publicIdentity(manifest, `"${manifestPath}" at ${commit}`);
  };
  const isCurrent = (identity: TarballIdentity | undefined | null) =>
    identity?.name === pkg.name && identity?.version === pkg.version;
  for (;;) {
    const history = git(
      "log",
      "--first-parent",
      "--format=%H %P",
      tip,
      "--",
      path,
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" "));
    let moved = false;
    for (const [commit, parent] of history) {
      if (!commit || !isCurrent(identityAt(commit, path))) continue;
      if (!parent) return commit;
      const parentIdentity = identityAt(parent, path);
      if (isCurrent(parentIdentity)) continue;
      if (parentIdentity !== null) return commit;

      const matches = git(
        "diff",
        "--name-only",
        "--no-renames",
        "--diff-filter=D",
        parent,
        commit,
        "--",
        "packages/*/package.json",
      )
        .split("\n")
        .filter(Boolean)
        .filter((candidatePath) =>
          /^packages\/[^/]+\/package\.json$/.test(candidatePath),
        )
        .filter((candidatePath) => {
          const contents = git("show", `${parent}:${candidatePath}`);
          try {
            const manifest: unknown = JSON.parse(contents);
            return isCurrent(
              publicIdentity(manifest, `"${candidatePath}" at ${parent}`),
            );
          } catch {
            return false;
          }
        });
      if (matches.length === 0) return commit;
      if (matches.length > 1) {
        const dirs = matches
          .map((candidatePath) =>
            candidatePath.slice(0, -"/package.json".length),
          )
          .join(", ");
        throw new Error(
          `${pkg.name} ${pkg.version} moved at ${commit} from more than one directory holding that name and version (${dirs}). History can't be changed and every run recomputes this, so bump the package's version to give it a release commit after ${commit}.`,
        );
      }
      path = matches[0]!;
      tip = parent;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  throw new Error(`No commit sets ${pkg.name} to ${pkg.version}.`);
}

/**
 * Formats the file name `pnpm pack` gives a package's tarball.
 *
 * @param pkg - The package.
 * @returns `<scope>-<name>-<version>.tgz`, without the `@`.
 */
export function tarballName(pkg: Pick<PublicPackage, "name" | "version">) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
}

/**
 * `pack.ts --out <dir>` packs every public package into `<dir>` and writes
 * `<dir>/SHA256SUMS`; `pack.ts --tags [--prereleases]` prints, tab-separated,
 * the release tag of every public package at its current version (only prerelease
 * versions with `--prereleases`) and the commit that set that version.
 *
 * @param argv - Command-line arguments.
 */
function main(argv: readonly string[] = process.argv.slice(2)): void {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      out: { type: "string" },
      tags: { type: "boolean" },
      prereleases: { type: "boolean" },
    },
  });
  if (values.tags) {
    for (const pkg of listPublicPackages(".")) {
      if (values.prereleases && !isPrerelease(pkg.version)) continue;
      writeStdout(`${releaseTag(pkg)}\t${releaseCommit(".", pkg)}\n`);
    }
  } else if (values.out) {
    const out = values.out;
    // No package defines a prepack or prepare hook, so `pnpm pack` ships the built
    // `lib/` and replaces `workspace:` ranges with real versions.
    mkdirSync(out, { recursive: true });
    for (const { dir } of listPublicPackages(".")) {
      execFileSync("pnpm", ["pack", "--pack-destination", resolve(out)], {
        cwd: dir,
        stdio: ["ignore", "inherit", "inherit"],
      });
    }
    const sums = readdirSync(out)
      .filter((name) => name.endsWith(".tgz"))
      .sort()
      .map((name) => {
        const hash = createHash("sha256")
          .update(readFileSync(join(out, name)))
          .digest("hex");
        return `${hash}  ./${name}\n`;
      });
    writeFileSync(join(out, "SHA256SUMS"), sums.join(""));
  } else {
    throw new Error(
      "Usage: node scripts/publish/pack.ts --out <dir> | --tags [--prereleases]",
    );
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    reportCliError(error);
  }
}
