#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  collectVersionChanges,
  isAllowedVersionPath,
} from "./create-version-commit.mjs";
import { getErrorMessage, isPathInside, sanitizeLogLine } from "./helpers.mjs";

const VERSION_ARTIFACT_SCHEMA_VERSION = 1;

export function applyVersionArtifact(options = {}) {
  const artifactPath = options.artifactPath;
  if (artifactPath == null || artifactPath === "") {
    throw new Error("Version artifact path is required.");
  }

  const cwd = options.cwd ?? process.cwd();
  const artifact = readVersionArtifact(artifactPath);
  const additions = readArtifactEntries(artifact.additions, "additions");
  const deletions = readArtifactEntries(artifact.deletions, "deletions");
  const seenPaths = new Set();

  for (const entry of [...additions, ...deletions]) {
    if (seenPaths.has(entry.path)) {
      throw new Error(`Duplicate version artifact path "${entry.path}".`);
    }
    seenPaths.add(entry.path);
  }

  for (const { path } of deletions) {
    const absolutePath = resolveArtifactTarget({ cwd, path });
    rmSync(absolutePath, { force: true });
  }

  for (const { contents, path } of additions) {
    const absolutePath = resolveArtifactTarget({ cwd, path });
    const parentPath = dirname(absolutePath);
    const parentRealPath = realpathSync(parentPath);
    const basePath = realpathSync(cwd);

    if (!isPathInside(basePath, parentRealPath)) {
      throw new Error(`Invalid version artifact path "${path}".`);
    }

    if (existsSync(absolutePath) && !lstatSync(absolutePath).isFile()) {
      throw new Error(`Version artifact target is not a file "${path}".`);
    }

    writeFileSync(absolutePath, decodeBase64({ contents, path }));
  }

  const versionChanges = collectVersionChanges({ cwd });
  if (versionChanges.disallowedPaths.length > 0) {
    throw new Error(
      `Version artifact produced files outside the release allowlist:\n${formatIndentedList(versionChanges.disallowedPaths)}`,
    );
  }

  return artifact;
}

export function main(args = process.argv.slice(2), options = {}) {
  const artifactPath = args[0];
  return applyVersionArtifact({
    artifactPath,
    cwd: options.cwd ?? process.cwd(),
  });
}

function readVersionArtifact(artifactPath) {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  if (
    artifact == null ||
    typeof artifact !== "object" ||
    Array.isArray(artifact)
  ) {
    throw new Error("Version artifact must be a JSON object.");
  }

  if (artifact.schemaVersion !== VERSION_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported version artifact schema "${String(artifact.schemaVersion)}".`,
    );
  }

  return artifact;
}

function readArtifactEntries(entries, field) {
  if (!Array.isArray(entries)) {
    throw new Error(`Version artifact field "${field}" must be an array.`);
  }

  return entries.map((entry) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Version artifact field "${field}" contains non-object.`);
    }

    if (typeof entry.path !== "string") {
      throw new Error(
        `Version artifact field "${field}" contains invalid path.`,
      );
    }

    validateArtifactPath(entry.path);

    if (field === "additions" && typeof entry.contents !== "string") {
      throw new Error(
        `Version artifact addition "${entry.path}" contains invalid contents.`,
      );
    }

    return entry;
  });
}

function validateArtifactPath(path) {
  if (
    hasControlCharacter(path) ||
    path.split("/").includes("..") ||
    !isAllowedVersionPath(path)
  ) {
    throw new Error(
      `Invalid version artifact path "${sanitizeLogLine(path)}".`,
    );
  }
}

function resolveArtifactTarget(options) {
  const basePath = realpathSync(options.cwd);
  const absolutePath = resolve(basePath, options.path);

  if (!isPathInside(basePath, absolutePath)) {
    throw new Error(`Invalid version artifact path "${options.path}".`);
  }

  return absolutePath;
}

function decodeBase64(options) {
  const buffer = Buffer.from(options.contents, "base64");
  if (buffer.toString("base64") !== options.contents) {
    throw new Error(
      `Version artifact addition "${options.path}" is not canonical base64.`,
    );
  }

  return buffer;
}

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

function formatIndentedList(paths) {
  return paths.map((path) => `  ${sanitizeLogLine(path)}`).join("\n");
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `::error::${sanitizeAnnotation(getErrorMessage(error))}\n`,
    );
    process.exitCode = 1;
  }
}

function sanitizeAnnotation(message) {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
