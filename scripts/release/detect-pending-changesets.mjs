#!/usr/bin/env node

import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { sanitizeLogLine } from "./helpers.mjs";

const DEFAULT_CHANGESET_DIR = ".changeset";

export function listPendingChangesets(options = {}) {
  const changesetDir = options.changesetDir ?? DEFAULT_CHANGESET_DIR;
  if (!existsSync(changesetDir)) return [];

  const pendingChangesets = [];
  for (const entry of readdirSync(changesetDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name === "README.md") continue;
    if (!entry.name.endsWith(".md")) continue;

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
