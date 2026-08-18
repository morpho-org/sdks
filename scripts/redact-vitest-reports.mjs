#!/usr/bin/env node

import {
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REDACTION = "<redacted-rpc-url>";
const RPC_SECRET_ENV_NAMES = [
  "MAINNET_RPC_URL",
  "BASE_RPC_URL",
  "ARBITRUM_RPC_URL",
];

/** Error thrown when Vitest reports cannot be sanitized for upload. */
export class VitestReportSanitizationError extends Error {
  /**
   * Creates a report-sanitization error.
   *
   * @param {string} message Actionable description of the failure.
   * @param {ErrorOptions} [options] Standard error options with the original cause.
   */
  constructor(message, options) {
    super(message, options);
    this.name = "VitestReportSanitizationError";
  }
}

/**
 * Redacts raw, normalized, serialized, and identifying URL fragments.
 *
 * @param {string} content Report contents to sanitize.
 * @param {readonly string[]} secrets Secret values that must not remain.
 * @returns {{ content: string, replacements: number }} Sanitized content and replacement count.
 * @example
 * ```js
 * redactSecrets('request failed for "https://rpc.example/key"', [
 *   "https://rpc.example/key",
 * ]);
 * ```
 */
export function redactSecrets(content, secrets) {
  const representations = new Set();
  for (const secret of secrets) {
    if (secret === "") continue;
    const serializedValues = new Set([secret]);
    try {
      const url = new URL(secret);
      serializedValues.add(url.href);
      serializedValues.add(url.hostname);
      if (url.host !== url.hostname) serializedValues.add(url.host);
      if (url.username) serializedValues.add(url.username);
      if (url.password) serializedValues.add(url.password);
      const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
      if (lastPathSegment) serializedValues.add(lastPathSegment);
      for (const value of url.searchParams.values()) {
        if (value) serializedValues.add(value);
      }
    } catch {
      // Non-URL secrets still need their raw serialization variants redacted.
    }

    for (const value of serializedValues) {
      representations.add(value);
      representations.add(JSON.stringify(value).slice(1, -1));
      representations.add(encodeURIComponent(value));
    }
  }

  let redacted = content;
  let replacements = 0;
  for (const representation of [...representations].sort(
    (left, right) => right.length - left.length,
  )) {
    const occurrences = redacted.split(representation).length - 1;
    if (occurrences === 0) continue;
    replacements += occurrences;
    redacted = redacted.replaceAll(representation, REDACTION);
  }

  return { content: redacted, replacements };
}

/**
 * Recursively sanitizes every regular file in a Vitest blob-report directory.
 *
 * @param {string} directory Report directory to sanitize.
 * @param {readonly string[]} secrets Secret values that must not be uploaded.
 * @returns {{ files: number, replacements: number }} Scanned file and replacement counts.
 * @throws {VitestReportSanitizationError} When reports cannot be read or rewritten.
 * @example
 * ```js
 * sanitizeVitestReports("vitest-reports", [process.env.MAINNET_RPC_URL]);
 * ```
 */
export function sanitizeVitestReports(directory, secrets) {
  const protectedSecrets = [...new Set(secrets.filter(Boolean))];
  if (protectedSecrets.length === 0) {
    throw new VitestReportSanitizationError(
      "No RPC credentials were provided for report redaction. Do not upload the Vitest report.",
    );
  }

  let files = 0;
  let replacements = 0;

  try {
    const reportRoot = realpathSync(resolve(directory));
    const pendingDirectories = [reportRoot];
    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.pop();
      if (currentDirectory === undefined) break;

      for (const entry of readdirSync(currentDirectory, {
        withFileTypes: true,
      })) {
        const path = realpathSync(resolve(currentDirectory, entry.name));
        const relativePath = relative(reportRoot, path);
        if (
          relativePath === ".." ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath)
        ) {
          throw new VitestReportSanitizationError(
            `Report entry at "${path}" is outside "${reportRoot}". Do not upload the Vitest report.`,
          );
        }
        if (entry.isDirectory()) {
          pendingDirectories.push(path);
          continue;
        }
        if (!entry.isFile()) {
          throw new VitestReportSanitizationError(
            `Unsupported report entry at "${path}". Do not upload the Vitest report.`,
          );
        }

        const original = readFileSync(path, "utf8");
        const result = redactSecrets(original, protectedSecrets);
        if (result.content !== original) writeFileSync(path, result.content);
        files += 1;
        replacements += result.replacements;
      }
    }
  } catch (error) {
    if (error instanceof VitestReportSanitizationError) throw error;
    throw new VitestReportSanitizationError(
      `Could not sanitize reports in "${directory}". Do not upload the Vitest report.`,
      { cause: error },
    );
  }

  if (files === 0) {
    throw new VitestReportSanitizationError(
      `No Vitest reports were found in "${directory}". Do not upload an unverified artifact.`,
    );
  }

  return { files, replacements };
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const directory = process.argv[2];
    if (directory === undefined) {
      throw new VitestReportSanitizationError(
        "Pass the Vitest report directory as the first argument.",
      );
    }

    const missingSecrets = RPC_SECRET_ENV_NAMES.filter(
      (name) => !process.env[name],
    );
    if (missingSecrets.length > 0) {
      throw new VitestReportSanitizationError(
        `Missing required RPC credentials: ${missingSecrets.join(", ")}. Do not upload the Vitest report.`,
      );
    }

    const result = sanitizeVitestReports(
      directory,
      RPC_SECRET_ENV_NAMES.map((name) => process.env[name] ?? ""),
    );
    process.stdout.write(
      `Sanitized ${result.files} Vitest report file(s); redacted ${result.replacements} credential occurrence(s).\n`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sanitization failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
