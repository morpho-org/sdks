#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import type { PublicTreeManifest } from "../public-snapshot/generate.ts";

type FileMode = PublicTreeManifest["files"][number]["mode"];
const MODES: readonly string[] = ["100644", "100755", "120000"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows `public-tree.json` read from an artifact. Paths must be relative,
 * normalized and free of `..`, so checks never read outside `tree/`.
 *
 * @param value - Parsed JSON.
 * @returns The manifest.
 */
export function parseManifest(value: unknown): PublicTreeManifest {
  if (
    !isRecord(value) ||
    typeof value.sourceCommit !== "string" ||
    typeof value.treeHash !== "string" ||
    !Array.isArray(value.files)
  ) {
    throw new Error(
      'public-tree.json needs "sourceCommit", "treeHash" and "files".',
    );
  }
  for (const file of value.files) {
    if (
      !isRecord(file) ||
      typeof file.path !== "string" ||
      typeof file.sha256 !== "string" ||
      typeof file.mode !== "string" ||
      !MODES.includes(file.mode) ||
      file.path === "" ||
      file.path.startsWith("/") ||
      posix.normalize(file.path) !== file.path ||
      file.path.split("/").includes("..")
    ) {
      throw new Error(`Invalid manifest entry ${JSON.stringify(file)}.`);
    }
  }
  return value as unknown as PublicTreeManifest;
}

/** Every non-directory entry under `dir`, with the git mode it has on disk. */
function listEntries(dir: string): Map<string, FileMode | "other"> {
  const entries = new Map<string, FileMode | "other">();
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const path = relative(dir, full).split(sep).join("/");
      if (stat.isSymbolicLink()) entries.set(path, "120000");
      else if (stat.isFile())
        entries.set(path, stat.mode & 0o111 ? "100755" : "100644");
      else entries.set(path, "other");
    }
  };
  walk(dir);
  return entries;
}

/**
 * Checks a gate artifact before sync: `tree/` must hold exactly the entries in
 * `public-tree.json`, with the same type, executable bit and SHA-256, and every
 * tarball must match `tarballs/SHA256SUMS`. Throws on the first difference.
 *
 * @param dir - Artifact directory, as assembled by the public-snapshot workflow.
 * @returns The verified manifest.
 */
export function verifyArtifact(dir: string): PublicTreeManifest {
  const manifestPath = join(dir, "public-tree.json");
  const sumsPath = join(dir, "tarballs", "SHA256SUMS");
  for (const path of [manifestPath, sumsPath]) {
    if (!existsSync(path)) throw new Error(`Artifact is missing "${path}".`);
  }
  const manifest = parseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  const treeDir = join(dir, "tree");
  const sha256 = (content: Buffer | string) =>
    createHash("sha256").update(content).digest("hex");

  const entries = listEntries(treeDir);
  for (const file of manifest.files) {
    const mode = entries.get(file.path);
    if (mode === undefined) {
      throw new Error(`"${file.path}" is in the manifest but not in the tree.`);
    }
    if (mode !== file.mode) {
      throw new Error(
        `"${file.path}" has mode ${mode}, but the manifest says ${file.mode}.`,
      );
    }
    const full = join(treeDir, file.path);
    const content = mode === "120000" ? readlinkSync(full) : readFileSync(full);
    if (sha256(content) !== file.sha256) {
      throw new Error(`"${file.path}" differs from the manifest.`);
    }
  }
  const expected = new Set(manifest.files.map(({ path }) => path));
  for (const path of entries.keys()) {
    if (!expected.has(path)) {
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
