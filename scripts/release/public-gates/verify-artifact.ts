#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import type { PublicTreeManifest } from "../public-snapshot/generate.ts";
import { readTree } from "./scan.ts";

/**
 * Checks a gate artifact before sync: `tree/` must hold exactly the files in
 * `public-tree.json` with the same modes and SHA-256, and every tarball must match
 * `tarballs/SHA256SUMS`. Throws on the first difference.
 *
 * @param dir - Artifact directory, as written by the public-snapshot workflow.
 * @returns The verified manifest.
 */
export function verifyArtifact(dir: string): PublicTreeManifest {
  const manifestPath = join(dir, "public-tree.json");
  const sumsPath = join(dir, "tarballs", "SHA256SUMS");
  for (const path of [manifestPath, sumsPath]) {
    if (!existsSync(path)) throw new Error(`Artifact is missing "${path}".`);
  }
  const manifest: PublicTreeManifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  );
  const treeDir = join(dir, "tree");
  const sha256 = (content: Buffer | string) =>
    createHash("sha256").update(content).digest("hex");

  const expected = new Map(manifest.files.map((file) => [file.path, file]));
  const regular = new Set(readTree(treeDir).map(({ path }) => path));
  for (const file of manifest.files) {
    const full = join(treeDir, file.path);
    if (file.mode === "120000") {
      if (sha256(readlinkSync(full)) !== file.sha256) {
        throw new Error(`Symlink "${file.path}" differs from the manifest.`);
      }
      continue;
    }
    if (!regular.has(file.path)) {
      throw new Error(`"${file.path}" is in the manifest but not in the tree.`);
    }
    if (sha256(readFileSync(full)) !== file.sha256) {
      throw new Error(`"${file.path}" differs from the manifest.`);
    }
  }
  for (const path of regular) {
    if (expected.get(path)?.mode === "120000" || !expected.has(path)) {
      throw new Error(`"${path}" is in the tree but not in the manifest.`);
    }
  }

  const sums = new Map(
    readFileSync(sumsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", name = ""] = line.split(/\s+\*?/);
        return [name.replace(/^\.\//, ""), hash];
      }),
  );
  const tarballs = readdirSync(join(dir, "tarballs")).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (tarballs.length === 0) throw new Error("Artifact has no tarballs.");
  for (const name of tarballs) {
    const content = readFileSync(join(dir, "tarballs", name));
    if (sums.get(name) !== sha256(content)) {
      throw new Error(`Tarball "${name}" doesn't match SHA256SUMS.`);
    }
  }
  if (sums.size !== tarballs.length) {
    throw new Error("SHA256SUMS lists tarballs that aren't in the artifact.");
  }
  return manifest;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { dir: { type: "string" } } });
  if (!values.dir)
    throw new Error("Usage: verify-artifact.ts --dir <artifact>");
  const manifest = verifyArtifact(values.dir);
  console.log(
    `Artifact OK: ${manifest.files.length} files, tree ${manifest.treeHash}, from ${manifest.sourceCommit}.`,
  );
}
