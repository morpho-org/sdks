#!/usr/bin/env node

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getErrorMessage, sanitizeLogLine } from "./helpers.mjs";

const DEFAULT_CHANGESET_DIR = ".changeset";
const PRE_STATE_FILE = "pre.json";

// In Changesets prerelease ("pre") mode, `changeset version` does NOT delete
// the consumed `.changeset/*.md` files; it records their ids in
// `pre.json.changesets` and leaves the markdown in place so the eventual stable
// release can regenerate a complete changelog. Those recorded changesets are
// already rolled into a published prerelease, so they must not count as pending
// work — otherwise the publish step, gated on `has_changesets == false`, would
// never fire on `next`. In "exit" mode the recorded changesets still drive the
// final stable version, so they remain pending.
function readPrereleasedChangesetIds(changesetDir) {
  const preStatePath = join(changesetDir, PRE_STATE_FILE);
  if (!existsSync(preStatePath)) return new Set();

  let preState;
  try {
    preState = JSON.parse(readFileSync(preStatePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid Changesets pre state "${preStatePath}": ${getErrorMessage(error)}`,
    );
  }

  if (
    preState == null ||
    preState.mode !== "pre" ||
    !Array.isArray(preState.changesets)
  ) {
    return new Set();
  }

  return new Set(preState.changesets);
}

export function listPendingChangesets(options = {}) {
  const changesetDir = options.changesetDir ?? DEFAULT_CHANGESET_DIR;
  if (!existsSync(changesetDir)) return [];

  const prereleasedIds = readPrereleasedChangesetIds(changesetDir);
  const pendingChangesets = [];
  for (const entry of readdirSync(changesetDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name === "README.md") continue;
    if (!entry.name.endsWith(".md")) continue;
    if (prereleasedIds.has(entry.name.slice(0, -".md".length))) continue;

    pendingChangesets.push(join(changesetDir, entry.name));
  }

  return pendingChangesets.sort();
}

export function getGitHubOutput(pendingChangesets) {
  const hasChangesets = pendingChangesets.length > 0 ? "true" : "false";
  return `has_changesets=${hasChangesets}\n`;
}

export function reportPendingChangesets(options = {}) {
  const pendingChangesets = listPendingChangesets(options);
  const outputFile = options.outputFile ?? process.env.GITHUB_OUTPUT;
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));

  if (outputFile != null && outputFile !== "") {
    appendFileSync(outputFile, getGitHubOutput(pendingChangesets));
  }

  if (pendingChangesets.length > 0) {
    writeOutput("Pending changesets:\n");
    writeOutput(`${pendingChangesets.map(sanitizeLogLine).join("\n")}\n`);
  }

  return pendingChangesets;
}

export function main(options = {}) {
  return reportPendingChangesets(options);
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
