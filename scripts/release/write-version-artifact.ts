#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import {
  collectVersionChanges,
  type VersionChanges,
} from "./create-version-commit.ts";
import { getErrorMessage, sanitizeLogLine } from "./helpers.ts";

const VERSION_ARTIFACT_SCHEMA_VERSION = 1;

/** Serialized version-change artifact passed between the version PR and publish workflows. */
export interface VersionArtifact {
  additions: VersionChanges["additions"];
  deletions: VersionChanges["deletions"];
  schemaVersion: number;
}

export function writeVersionArtifact(
  options: { artifactPath?: string; cwd?: string } = {},
): VersionArtifact {
  const artifactPath = options.artifactPath;
  if (artifactPath == null || artifactPath === "") {
    throw new Error("Version artifact path is required.");
  }

  const cwd = options.cwd ?? process.cwd();
  const versionChanges = collectVersionChanges({ cwd });
  if (versionChanges.disallowedPaths.length > 0) {
    throw new Error(
      `Versioning produced files outside the release allowlist:\n${formatIndentedList(versionChanges.disallowedPaths)}`,
    );
  }

  const artifact = {
    additions: versionChanges.additions,
    deletions: versionChanges.deletions,
    schemaVersion: VERSION_ARTIFACT_SCHEMA_VERSION,
  };

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return artifact;
}

export function main(
  args: string[] = process.argv.slice(2),
  options: { cwd?: string } = {},
): VersionArtifact {
  const artifactPath = args[0];
  return writeVersionArtifact({
    artifactPath,
    cwd: options.cwd ?? process.cwd(),
  });
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
