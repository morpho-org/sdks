#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  generatePublicSnapshot,
  type PublicTreeManifest,
} from "../public-snapshot/generate.ts";
import { listPublicPackages } from "./public-packages.ts";

type FileMode = PublicTreeManifest["files"][number]["mode"];
const MODES = [
  "100644",
  "100755",
  "120000",
] as const satisfies readonly FileMode[];

/**
 * Narrows `public-tree.json` read from an artifact. Paths must be relative,
 * normalized and free of `..`, so checks never read outside `tree/`.
 *
 * @param value - Parsed JSON.
 * @returns The manifest.
 */
export function parseManifest(value: unknown): PublicTreeManifest {
  if (
    typeof value !== "object" ||
    value === null ||
    !("sourceCommit" in value) ||
    typeof value.sourceCommit !== "string" ||
    !("treeHash" in value) ||
    typeof value.treeHash !== "string" ||
    !("files" in value) ||
    !Array.isArray(value.files)
  ) {
    throw new Error(
      'public-tree.json needs "sourceCommit", "treeHash" and "files".',
    );
  }
  const files = value.files.map((file: unknown) => {
    const mode =
      typeof file === "object" && file !== null && "mode" in file
        ? MODES.find((known) => known === file.mode)
        : undefined;
    if (
      typeof file !== "object" ||
      file === null ||
      mode === undefined ||
      !("path" in file) ||
      typeof file.path !== "string" ||
      !("sha256" in file) ||
      typeof file.sha256 !== "string" ||
      file.path === "" ||
      file.path.startsWith("/") ||
      posix.normalize(file.path) !== file.path ||
      file.path.split("/").includes("..")
    ) {
      throw new Error(`Invalid manifest entry ${JSON.stringify(file)}.`);
    }
    return { path: file.path, mode, sha256: file.sha256 };
  });
  return { sourceCommit: value.sourceCommit, treeHash: value.treeHash, files };
}

/**
 * Checks a gate artifact before sync: `tree/` must hold exactly the entries in
 * `public-tree.json`, with the same type, executable bit and SHA-256, and every
 * tarball must match `tarballs/SHA256SUMS`, with exactly one tarball per public
 * package of the verified tree. Throws on the first difference.
 *
 * With `source`, the tree is also regenerated from git at that commit and its
 * `public-tree.json` must match byte for byte, which ties the artifact to the
 * commit instead of only to itself.
 *
 * @param dir - Artifact directory, as assembled by the public-snapshot workflow.
 * @param source - Repository and commit the artifact must come from.
 * @returns The verified manifest.
 */
export function verifyArtifact(
  dir: string,
  source?: { readonly repo: string; readonly sha: string },
): PublicTreeManifest {
  const manifestPath = join(dir, "public-tree.json");
  const sumsPath = join(dir, "tarballs", "SHA256SUMS");
  for (const path of [manifestPath, sumsPath]) {
    if (!existsSync(path)) throw new Error(`Artifact is missing "${path}".`);
  }
  const manifest = parseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  if (source) {
    const scratch = mkdtempSync(join(tmpdir(), "public-tree-expected-"));
    try {
      const outDir = join(scratch, "out");
      generatePublicSnapshot({ ...source, outDir });
      const expected = readFileSync(join(outDir, "public-tree.json"));
      if (!expected.equals(readFileSync(manifestPath))) {
        throw new Error(
          `public-tree.json doesn't match the tree generated from ${source.sha}.`,
        );
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  const treeDir = join(dir, "tree");

  // Every non-directory entry, with the git mode it has on disk.
  const entries = new Map<string, FileMode | "other">();
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const path = relative(treeDir, full).split(sep).join("/");
      if (stat.isSymbolicLink()) entries.set(path, "120000");
      else if (stat.isFile())
        entries.set(path, stat.mode & 0o111 ? "100755" : "100644");
      else entries.set(path, "other");
    }
  };
  walk(treeDir);
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
    if (createHash("sha256").update(content).digest("hex") !== file.sha256) {
      throw new Error(`"${file.path}" differs from the manifest.`);
    }
  }
  const expected = new Set(manifest.files.map(({ path }) => path));
  for (const path of entries.keys()) {
    if (!expected.has(path)) {
      throw new Error(`"${path}" is in the tree but not in the manifest.`);
    }
  }

  const sums = new Map<string, string>();
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    if (line === "") continue;
    const match = /^([0-9a-f]{64}) [ *](?:\.\/)?([^/]+\.tgz)$/.exec(line);
    if (!match?.[1] || !match[2] || sums.has(match[2])) {
      throw new Error(`Invalid SHA256SUMS line ${JSON.stringify(line)}.`);
    }
    sums.set(match[2], match[1]);
  }
  // The gates job ran dependency code, so nothing but tarballs may ride along.
  const tarballs: string[] = [];
  for (const name of readdirSync(join(dir, "tarballs"))) {
    if (name === "SHA256SUMS") continue;
    if (
      !name.endsWith(".tgz") ||
      !lstatSync(join(dir, "tarballs", name)).isFile()
    ) {
      throw new Error(`Unexpected "${name}" in tarballs/.`);
    }
    tarballs.push(name);
  }
  if (tarballs.length === 0) throw new Error("Artifact has no tarballs.");
  // The gates job chose what to pack, so the set must come from the verified tree.
  const expectedTarballs = listPublicPackages(treeDir)
    .map(({ tarball }) => tarball)
    .sort();
  if (tarballs.sort().join("\n") !== expectedTarballs.join("\n")) {
    throw new Error(
      `Tarballs [${tarballs.join(", ")}] don't match the public packages [${expectedTarballs.join(", ")}].`,
    );
  }
  for (const name of tarballs) {
    const content = readFileSync(join(dir, "tarballs", name));
    if (sums.get(name) !== createHash("sha256").update(content).digest("hex")) {
      throw new Error(`Tarball "${name}" doesn't match SHA256SUMS.`);
    }
  }
  if (sums.size !== tarballs.length) {
    throw new Error("SHA256SUMS lists tarballs that aren't in the artifact.");
  }
  return manifest;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { dir: { type: "string" }, sha: { type: "string" } },
  });
  if (!values.dir || !values.sha)
    throw new Error(
      "Usage: verify-artifact.ts --dir <artifact> --sha <commit>",
    );
  const manifest = verifyArtifact(values.dir, { repo: ".", sha: values.sha });
  console.log(
    `Artifact OK: ${manifest.files.length} files, tree ${manifest.treeHash}, from ${manifest.sourceCommit}.`,
  );
}
