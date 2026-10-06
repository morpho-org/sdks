#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/** A non-private package of the public tree that clean-copy.sh packs. */
export interface PublicPackage {
  /** Package directory, relative to the tree root. */
  readonly dir: string;
  readonly name: string;
  readonly version: string;
  /** File name `pnpm pack` gives the tarball. */
  readonly tarball: string;
}

/**
 * Lists the packages of a public tree that get packed: every
 * `packages/<name>/package.json` without `"private": true`.
 *
 * @param tree - Root of the public tree.
 * @returns Public packages, sorted by directory.
 * @throws If a public manifest has no string `name` or `version`.
 */
export function listPublicPackages(tree: string): PublicPackage[] {
  const packages: PublicPackage[] = [];
  for (const entry of readdirSync(join(tree, "packages")).sort()) {
    const dir = `packages/${entry}`;
    const path = join(tree, dir, "package.json");
    if (!existsSync(path)) continue;
    const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof manifest === "object" &&
      manifest !== null &&
      "private" in manifest &&
      manifest.private === true
    ) {
      continue;
    }
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("name" in manifest) ||
      typeof manifest.name !== "string" ||
      !("version" in manifest) ||
      typeof manifest.version !== "string"
    ) {
      throw new Error(`"${dir}/package.json" needs a "name" and a "version".`);
    }
    const { name, version } = manifest;
    const tarball = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
    packages.push({ dir, name, version, tarball });
  }
  return packages;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { tree: { type: "string" } } });
  if (!values.tree) throw new Error("Usage: public-packages.ts --tree <dir>");
  // NUL-separated, for `read -d ''` in clean-copy.sh.
  for (const { dir } of listPublicPackages(values.tree)) {
    process.stdout.write(`${dir}\0`);
  }
}
