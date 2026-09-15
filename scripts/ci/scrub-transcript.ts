#!/usr/bin/env node
/**
 * scrub-transcript.ts — masks secrets in the Claude execution transcript before
 * `.github/workflows/claude.yml` uploads it as a failure artifact (artifacts on
 * a public repo bypass job-log redaction). Run with Node's native TypeScript support:
 *
 *   SECRET_VALUES=$'<token>\n<key>' node scripts/ci/scrub-transcript.ts <input> <output>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MASK = "***";

/**
 * Token shapes that may appear in tool output regardless of which secret was configured:
 * GitHub tokens (`ghs_` job tokens, `ghp_`/`gho_`/`ghu_`/`ghr_` user tokens, fine-grained
 * `github_pat_`), Anthropic API keys, and `Authorization` header values.
 */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /(Authorization:\s*(?:Bearer|token|Basic)\s+)[^\s"'\\]+/gi,
];

export interface ScrubOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly writeOutput?: (message: string) => void;
}

/** Masks every known secret value and every token-shaped string in a transcript. */
export function scrubTranscript(
  content: string,
  secretValues: readonly string[],
): string {
  let scrubbed = content;

  for (const value of secretValues) {
    if (value.length === 0) continue;
    scrubbed = scrubbed.split(value).join(MASK);
    // Tool output frequently JSON-encodes strings; mask that form too.
    const encoded = JSON.stringify(value).slice(1, -1);
    if (encoded !== value) scrubbed = scrubbed.split(encoded).join(MASK);
  }

  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, (_match: string, prefix?: string) =>
      typeof prefix === "string" ? `${prefix}${MASK}` : MASK,
    );
  }

  return scrubbed;
}

/**
 * Reads newline-separated secret values from `SECRET_VALUES` (each may itself be empty when the
 * corresponding secret is not configured).
 */
export function readSecretValues(env: NodeJS.ProcessEnv): string[] {
  return (env.SECRET_VALUES ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** CLI entrypoint: `node scripts/ci/scrub-transcript.ts <input> <output>`. */
export function main(options: ScrubOptions = {}): string {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput =
    options.writeOutput ??
    ((message: string) => {
      process.stdout.write(message);
    });
  const [inputPath, outputPath] = argv;

  if (
    inputPath == null ||
    inputPath === "" ||
    outputPath == null ||
    outputPath === ""
  ) {
    throw new Error("Usage: scrub-transcript.ts <input> <output>");
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  }
}
