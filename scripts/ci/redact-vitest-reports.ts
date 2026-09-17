#!/usr/bin/env node
/**
 * redact-vitest-reports.ts — masks fork RPC credentials in Vitest blob reports before
 * `.github/workflows/test.yml` uploads them as a failure artifact. Artifacts on a public repo
 * bypass job-log secret redaction, and a fork shard's serialized diagnostics can embed the RPC
 * URL/API key through any channel — Anvil stderr, but also a viem transport error relaying an
 * upstream backend failure (rate limit, auth, timeout), which `@morpho-org/test`'s own
 * Anvil-diagnostic redaction never sees. This step scrubs the report independently and the upload
 * is gated on it, so a report is only ever published once proven clean. Run with Node's native
 * TypeScript support:
 *
 *   SECRET_VALUES=$'<url>\n<url>' node scripts/ci/redact-vitest-reports.ts <input-dir> <output-dir>
 *
 * Writes sanitized copies to `<output-dir>` and `path=<output-dir>` to `GITHUB_OUTPUT` only when at
 * least one report file was scrubbed; a hard crash that leaves no report is a benign no-op (no path,
 * no upload). A fork shard (`EXPECT_RPC_SECRETS=true`) with no secrets to redact is a wiring error
 * that fails the step rather than uploading an unscrubbed report.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { readSecretValues, SECRET_PATTERNS } from "./scrub-transcript.ts";
import {
  isMain,
  readRequiredEnv,
  reportCliError,
  writeStdout,
} from "./workflow.ts";

/** Replacement written over every redacted credential occurrence. */
export const REDACTION = "<redacted-secret>";

/**
 * Minimum length for a credential fragment derived from a secret URL (path segment, query value,
 * basic-auth username or password) to be redacted on its own. Guards against blanking short,
 * non-secret URL parts such as `/v2` or `chain=1` — a 1-character password would otherwise mask
 * every digit in the report; the host is never redacted, so failure reports still say which
 * chain's fork broke.
 */
export const MIN_DERIVED_SECRET_LENGTH = 8;

/**
 * Every string form of a single secret that must not survive into an uploaded report: the raw
 * value, and — when it parses as a URL — its credential-bearing fragments (basic-auth username and
 * password of meaningful length, the base64 HTTP Basic authorization value they form, long query
 * values, and the API-key path segment). Percent-encoded fragments additionally contribute their
 * decoded form (e.g. `KEY%2FSECRET0123` also masks `KEY/SECRET0123`). Each is expanded to its raw,
 * JSON-escaped, and percent-encoded representations, since a blob report may embed any of them.
 *
 * @param secret Secret value to enumerate (typically a fork RPC URL).
 * @returns The set of concrete strings to search for and redact.
 * @example
 * ```ts
 * secretRepresentations("https://eth-mainnet.example/v2/KEY0123456789");
 * // includes the URL, "KEY0123456789", and their JSON-escaped/percent-encoded forms
 * ```
 */
export function secretRepresentations(secret: string): Set<string> {
  const values = new Set<string>();
  if (secret === "") return values;
  values.add(secret);

  const decodeComponent = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      // Malformed percent escapes decode as themselves.
      return value;
    }
  };
  const addDerived = (fragment: string): void => {
    if (fragment.length < MIN_DERIVED_SECRET_LENGTH) return;
    values.add(fragment);
    const decoded = decodeComponent(fragment);
    if (decoded !== fragment && decoded.length >= MIN_DERIVED_SECRET_LENGTH)
      values.add(decoded);
  };

  try {
    const url = new URL(secret);
    if (url.username !== "" || url.password !== "") {
      // The HTTP Basic authorization value derived from the credentials.
      values.add(
        Buffer.from(
          `${decodeComponent(url.username)}:${decodeComponent(url.password)}`,
        ).toString("base64"),
      );
    }
    addDerived(url.username);
    addDerived(url.password);
    for (const value of url.searchParams.values())
      if (value.length >= MIN_DERIVED_SECRET_LENGTH) values.add(value);
    const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
    if (lastPathSegment != null) addDerived(lastPathSegment);
  } catch {
    // A non-URL secret only needs its raw serialization variants redacted.
  }

  const representations = new Set<string>();
  for (const value of values) {
    representations.add(value);
    representations.add(JSON.stringify(value).slice(1, -1));
    representations.add(encodeURIComponent(value));
  }

  return representations;
}

/**
 * Redacts every representation of every secret from a report's contents.
 *
 * Representations are replaced longest-first so a full URL is masked before its own fragments,
 * keeping the replacement count meaningful. The replacement token contains no JSON metacharacters,
 * so a valid JSON report stays valid. After the exact-value pass, {@link SECRET_PATTERNS} masks
 * token-shaped strings (GitHub/Anthropic tokens, JWTs, `Authorization` header values) that appear
 * without a configured secret, as `scrubTranscript` does.
 *
 * @param content Report contents to sanitize.
 * @param secrets Secret values that must not remain (empty entries are ignored).
 * @returns The sanitized content and the number of occurrences replaced.
 * @example
 * ```ts
 * redactSecrets('failed for "https://rpc.example/v2/KEY0123456789"', [
 *   "https://rpc.example/v2/KEY0123456789",
 * ]);
 * ```
 */
export function redactSecrets(
  content: string,
  secrets: readonly string[],
): { content: string; replacements: number } {
  const representations = new Set<string>();
  for (const secret of secrets)
    for (const representation of secretRepresentations(secret))
      representations.add(representation);

  let redacted = content;
  let replacements = 0;
  for (const representation of [...representations].sort(
    (left, right) => right.length - left.length,
  )) {
    if (representation === "") continue;
    const parts = redacted.split(representation);
    const occurrences = parts.length - 1;
    if (occurrences === 0) continue;
    replacements += occurrences;
    redacted = parts.join(REDACTION);
  }

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (_match: string, prefix?: string) => {
      replacements += 1;
      return typeof prefix === "string" ? `${prefix}${REDACTION}` : REDACTION;
    });
  }

  return { content: redacted, replacements };
}

/** Inputs of {@link sanitizeReports}. */
export interface SanitizeReportsOptions {
  /** Directory the Vitest blob reporter wrote to. */
  readonly inputDir: string;
  /** Directory to write sanitized copies into; must not already exist (fail-closed). */
  readonly outputDir: string;
  /** Secret values that must not be uploaded (empty entries are ignored). */
  readonly secrets: readonly string[];
}

/**
 * Sanitizes every regular file in a Vitest blob-report directory, writing the scrubbed copies into a
 * fresh output directory that must not already exist — the artifact upload ships the whole directory,
 * so a pre-existing one could publish pre-planted, unscrubbed files. A missing or empty input
 * directory is a benign no-op — a hard test crash can leave no report — and non-regular entries
 * (symlinks, sub-directories) are skipped rather than followed, so only real report files are ever
 * published.
 *
 * @param options Input/output directories and the secrets to redact.
 * @returns The number of files scrubbed and the total credential occurrences redacted.
 * @throws {Error} When the output directory already exists, a report cannot be read, or a sanitized
 *   copy cannot be written (fail-closed).
 * @example
 * ```ts
 * sanitizeReports({
 *   inputDir: "vitest-reports",
 *   outputDir: "vitest-reports-sanitized",
 *   secrets: [process.env.MAINNET_RPC_URL ?? ""],
 * });
 * ```
 */
export function sanitizeReports(options: SanitizeReportsOptions): {
  files: number;
  replacements: number;
} {
  const { inputDir, outputDir, secrets } = options;
  if (!existsSync(inputDir)) return { files: 0, replacements: 0 };

  const reportFiles = readdirSync(inputDir, { withFileTypes: true }).filter(
    (entry) => entry.isFile(),
  );
  if (reportFiles.length === 0) return { files: 0, replacements: 0 };

  mkdirSync(outputDir);

  let files = 0;
  let replacements = 0;
  for (const entry of reportFiles) {
    const original = readFileSync(join(inputDir, entry.name), "utf8");
    const result = redactSecrets(original, secrets);
    // `wx` refuses a pre-existing file at the destination, so nothing outside this run is published.
    writeFileSync(join(outputDir, entry.name), result.content, { flag: "wx" });
    files += 1;
    replacements += result.replacements;
  }

  return { files, replacements };
}

/** Injectable argv/env/output boundaries of the CLI. */
export interface RedactOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly outputFile?: string;
  readonly writeOutput?: (message: string) => void;
}

/** CLI entrypoint: `node scripts/ci/redact-vitest-reports.ts <input-dir> <output-dir>`. */
export function main(options: RedactOptions = {}): string | undefined {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const [inputDir, outputDir] = argv;

  if (
    inputDir == null ||
    inputDir === "" ||
    outputDir == null ||
    outputDir === ""
  ) {
    throw new Error("Usage: redact-vitest-reports.ts <input-dir> <output-dir>");
  }

  const secrets = readSecretValues(env);
  if (env.EXPECT_RPC_SECRETS === "true" && secrets.length === 0) {
    throw new Error(
      "EXPECT_RPC_SECRETS is set but no RPC credentials were provided to redact. Refusing to upload a fork report that was not scrubbed.",
    );
  }

  const { files, replacements } = sanitizeReports({
    inputDir,
    outputDir,
    secrets,
  });
  if (files === 0) {
    writeOutput(
      `No Vitest report files found in "${inputDir}"; nothing to upload.\n`,
    );
    return undefined;
  }

  appendFileSync(
    options.outputFile ?? readRequiredEnv(env, "GITHUB_OUTPUT"),
    `path=${outputDir}\n`,
  );
  writeOutput(
    `Sanitized ${files} Vitest report file(s); redacted ${replacements} credential occurrence(s).\n`,
  );

  return outputDir;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    reportCliError(error);
  }
}
