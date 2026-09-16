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
} from "./create-version-commit.ts";
import { getErrorMessage, isPathInside, sanitizeLogLine } from "./helpers.ts";

const VERSION_ARTIFACT_SCHEMA_VERSION = 1;

interface RawVersionArtifact {
  additions?: unknown;
  deletions?: unknown;
  schemaVersion: unknown;
}

interface VersionArtifactEntry {
  contents?: string;
  path: string;
}

interface VersionArtifactAddition extends VersionArtifactEntry {
  contents: string;
}

export function applyVersionArtifact(
  options: { artifactSource?: unknown; cwd?: string } = {},
): RawVersionArtifact {
  const cwd = options.cwd ?? process.cwd();
  const artifact = readVersionArtifact(options.artifactSource);
  const additions = readArtifactEntries(artifact.additions, "additions");
  const deletions = readArtifactEntries(artifact.deletions, "deletions");
  const seenPaths = new Set<string>();

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

export function main(
  args: string[] = process.argv.slice(2),
  options: { artifactSource?: unknown; cwd?: string } = {},
): RawVersionArtifact {
  if (args.length > 0) {
    throw new Error("Version artifact path arguments are not supported.");
  }

  return applyVersionArtifact({
    artifactSource: options.artifactSource ?? readFileSync(0, "utf8"),
    cwd: options.cwd ?? process.cwd(),
  });
}

function readVersionArtifact(artifactSource: unknown): RawVersionArtifact {
  if (typeof artifactSource !== "string" || artifactSource === "") {
    throw new Error("Version artifact source is required.");
  }

  const artifact = JSON.parse(artifactSource) as unknown;

  if (
    artifact == null ||
    typeof artifact !== "object" ||
    Array.isArray(artifact)
  ) {
    throw new Error("Version artifact must be a JSON object.");
  }

  const record = artifact as RawVersionArtifact;

  if (record.schemaVersion !== VERSION_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported version artifact schema "${String(record.schemaVersion)}".`,
    );
  }

  return record;
}

function readArtifactEntries(
  entries: unknown,
  field: "additions",
): VersionArtifactAddition[];
function readArtifactEntries(
  entries: unknown,
  field: "deletions",
): VersionArtifactEntry[];
function readArtifactEntries(
  entries: unknown,
  field: string,
): VersionArtifactEntry[] {
  if (!Array.isArray(entries)) {
    throw new Error(`Version artifact field "${field}" must be an array.`);
  }

  return entries.map((entry) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Version artifact field "${field}" contains non-object.`);
    }

    const record = entry as { contents?: unknown; path?: unknown };

    if (typeof record.path !== "string") {
      throw new Error(
        `Version artifact field "${field}" contains invalid path.`,
      );
    }

    validateArtifactPath(record.path);

    if (field === "additions" && typeof record.contents !== "string") {
      throw new Error(
        `Version artifact addition "${record.path}" contains invalid contents.`,
      );
    }

    return {
      contents: record.contents as string | undefined,
      path: record.path,
    };
  });
}

function validateArtifactPath(path: string): void {
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

function resolveArtifactTarget(options: { cwd: string; path: string }): string {
  const basePath = realpathSync(options.cwd);
  const absolutePath = resolve(basePath, options.path); // nosec

  if (!isPathInside(basePath, absolutePath)) {
    throw new Error(`Invalid version artifact path "${options.path}".`);
  }

  return absolutePath;
}

function decodeBase64(options: { contents: string; path: string }): Buffer {
  const buffer = Buffer.from(options.contents, "base64");
  if (buffer.toString("base64") !== options.contents) {
    throw new Error(
      `Version artifact addition "${options.path}" is not canonical base64.`,
    );
  }

  return buffer;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

function formatIndentedList(paths: string[]): string {
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

function sanitizeAnnotation(message: string): string {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
