#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getErrorMessage } from "../release/helpers.mjs";

export const MASK = "***";

/**
 * Token shapes that may appear in tool output regardless of which secret was configured:
 * GitHub tokens (`ghs_` job tokens, `ghp_`/`gho_`/`ghu_`/`ghr_` user tokens, fine-grained
 * `github_pat_`), Anthropic API keys, and `Authorization` header values.
 */
export const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /(Authorization:\s*(?:Bearer|token|Basic)\s+)[^\s"'\\]+/gi,
];

/**
 * Masks every known secret value and every token-shaped string in a transcript.
 *
 * @param {string} content The raw transcript.
 * @param {readonly string[]} secretValues Exact secret values to mask (empty strings are ignored).
 * @returns {string} The scrubbed transcript.
 */
export function scrubTranscript(content, secretValues) {
  let scrubbed = content;

  for (const value of secretValues) {
    if (value.length === 0) continue;
    scrubbed = scrubbed.split(value).join(MASK);
    // Tool output frequently JSON-encodes strings; mask that form too.
    const encoded = JSON.stringify(value).slice(1, -1);
    if (encoded !== value) scrubbed = scrubbed.split(encoded).join(MASK);
  }

  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, (_match, prefix) =>
      typeof prefix === "string" ? `${prefix}${MASK}` : MASK,
    );
  }

  return scrubbed;
}

/**
 * Reads newline-separated secret values from `SECRET_VALUES` (each may itself be empty when the
 * corresponding secret is not configured).
 *
 * @param {NodeJS.ProcessEnv} env The environment.
 * @returns {string[]} The non-empty secret values.
 */
export function readSecretValues(env) {
  return (env.SECRET_VALUES ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * CLI entrypoint: `node scripts/ci/scrub-transcript.mjs <input> <output>` with `SECRET_VALUES`
 * in the environment.
 *
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, writeOutput?: (message: string) => void }} options Runtime options.
 * @returns {string} The output path.
 */
export function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput =
    options.writeOutput ?? ((message) => process.stdout.write(message));
  const [inputPath, outputPath] = argv;

  if (
    inputPath == null ||
    inputPath === "" ||
    outputPath == null ||
    outputPath === ""
  ) {
    throw new Error("Usage: scrub-transcript.mjs <input> <output>");
  }

  const scrubbed = scrubTranscript(
    readFileSync(inputPath, "utf8"),
    readSecretValues(env),
  );
  writeFileSync(outputPath, scrubbed);
  writeOutput(`Scrubbed transcript written to ${outputPath}.\n`);

  return outputPath;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`::error::${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
