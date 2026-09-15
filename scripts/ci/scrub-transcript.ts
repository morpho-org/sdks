#!/usr/bin/env node
/**
 * scrub-transcript.ts — masks secrets in the Claude execution transcript before
 * `.github/workflows/claude.yml` uploads it as a failure artifact (artifacts on
 * a public repo bypass job-log redaction). Run with Node's native TypeScript support:
 *
 *   SECRET_VALUES=$'<token>\n<key>' node scripts/ci/scrub-transcript.ts <input> <output>
 *
 * Writes `path=<output>` to `GITHUB_OUTPUT` so the upload step can be gated on it. The input path
 * comes from an output of the Claude step, which Claude's subprocesses can overwrite, so it must
 * resolve under `RUNNER_TEMP` (where the action writes the transcript) before it is read.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readRequiredEnv, sanitizeAnnotation } from "./workflow.ts";

/** Replacement written over every masked secret. */
export const MASK = "***";

/**
 * Token shapes that may appear in tool output regardless of which secret was configured:
 * GitHub tokens (classic `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, the newer `ghs_<digits>_<payload>`
 * installation format, fine-grained `github_pat_`), Anthropic API keys, and `Authorization`
 * header values in both text (`Authorization: Bearer x`) and JSON (`"Authorization":"Bearer x"`,
 * escaped or not) form.
 */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[0-9]+_[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /((?:\\?")?Authorization(?:\\?")?\s*:\s*(?:\\?")?(?:Bearer|token|Basic)\s+)[^\s"'\\]+/gi,
];

/** Injectable argv/env/output boundaries of the CLI. */
export interface ScrubOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly outputFile?: string;
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
 * Reads newline-separated secret values from `SECRET_VALUES` (each line may itself be empty when
 * the corresponding secret is not configured). The variable itself must be bound: an unset
 * `SECRET_VALUES` means the workflow wiring is broken, not that there are no secrets.
 */
export function readSecretValues(env: NodeJS.ProcessEnv): string[] {
  if (env.SECRET_VALUES == null) {
    throw new Error(
      "Missing required environment variable SECRET_VALUES (exact-value masking would be skipped).",
    );
  }

  return env.SECRET_VALUES.split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Throws unless `inputPath` resolves to a file strictly inside `allowedDir`. */
export function assertInputUnder(inputPath: string, allowedDir: string): void {
  const rel = relative(resolve(allowedDir), resolve(inputPath));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Refusing to read "${inputPath}": the transcript must live under ${allowedDir}.`,
    );
  }
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

  assertInputUnder(inputPath, readRequiredEnv(env, "RUNNER_TEMP"));
  const scrubbed = scrubTranscript(
    readFileSync(inputPath, "utf8"),
    readSecretValues(env),
  );
  writeFileSync(outputPath, scrubbed);
  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `path=${outputPath}\n`,
  );
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
    process.stderr.write(`::error::${sanitizeAnnotation(message)}\n`);
    process.exitCode = 1;
  }
}
