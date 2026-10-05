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

/** A package that is published to npm. */
export interface PublicPackage {
  /** Directory relative to the repository root, such as `packages/blue-sdk`. */
  readonly dir: string;
  readonly name: string;
  readonly version: string;
}

/**
 * Returns the npm identity of a parsed `package.json`, or `undefined` when the
 * package is private and never published.
 *
 * @param manifest - Parsed `package.json`.
 * @returns The name and version.
 * @throws If a non-private manifest lacks a string name or version.
 */
export function publicIdentity(
  manifest: unknown,
): { name: string; version: string } | undefined {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("package.json must be an object.");
  }
  if ("private" in manifest && manifest.private === true) return undefined;
  if (
    !("name" in manifest) ||
    typeof manifest.name !== "string" ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error("A public package.json needs a string name and version.");
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
    );
    if (identity) packages.push({ dir, ...identity });
  }
  return packages;
}

/**
 * Formats the git tag of a package release.
 *
 * @param pkg - The package.
 * @returns `<name>-v<version>`.
 */
export function releaseTag(pkg: Pick<PublicPackage, "name" | "version">) {
  return `${pkg.name}-v${pkg.version}`;
}

/**
 * Packs every public package into `out` and writes `out/SHA256SUMS`. No package
 * defines a prepack or prepare hook, so `pnpm pack` ships the built `lib/` and
 * replaces `workspace:` ranges with real versions.
 *
 * @param root - Repository root, already built.
 * @param out - Output directory.
 */
function packPublicPackages(root: string, out: string): void {
  mkdirSync(out, { recursive: true });
  for (const { dir } of listPublicPackages(root)) {
    execFileSync("pnpm", ["pack", "--pack-destination", resolve(out)], {
      cwd: join(root, dir),
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
}

/**
 * `pack.ts --out <dir>` packs every public package; `pack.ts --tags` prints the
 * release tag of every public package at its current version.
 *
 * @param argv - Command-line arguments.
 */
function main(argv: readonly string[] = process.argv.slice(2)): void {
  const { values } = parseArgs({
    args: [...argv],
    options: { out: { type: "string" }, tags: { type: "boolean" } },
  });
  if (values.tags) {
    for (const pkg of listPublicPackages(".")) {
      writeStdout(`${releaseTag(pkg)}\n`);
    }
  } else if (values.out) {
    packPublicPackages(".", values.out);
  } else {
    throw new Error("Usage: node scripts/publish/pack.ts --out <dir> | --tags");
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    reportCliError(error);
  }
}
