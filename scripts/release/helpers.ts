/**
 * Parses a scoped Morpho npm package and strict semver release specification.
 *
 * @param spec The CLI argument in `<name>@<version>` form.
 * @returns The validated package name and version.
 */
export function parseReleaseSpec(spec: string): {
  name: string;
  version: string;
} {
  const separator = spec.lastIndexOf("@");
  if (separator <= 0 || separator === spec.length - 1) {
    throw new Error("Expected a release spec in <name>@<version> form.");
  }
  const name = spec.slice(0, separator);
  const version = spec.slice(separator + 1);
  if (!/^@morpho-org\/[a-z0-9._-]+$/.test(name)) {
    throw new Error("Package name must be in the @morpho-org scope.");
  }
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Version must be a strict semver version.");
  }
  return { name, version };
}

/**
 * Returns the message of a thrown value, coercing non-Error values to a string.
 *
 * @param error The thrown value.
 * @returns The error message.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Replaces control characters so a value is safe to print in a log line.
 *
 * @param value The raw value.
 * @returns The value with every control character replaced by "?".
 */
export function sanitizeLogLine(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    sanitized +=
      codePoint != null && (codePoint <= 0x1f || codePoint === 0x7f)
        ? "?"
        : character;
  }

  return sanitized;
}
