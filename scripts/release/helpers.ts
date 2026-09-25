import { isAbsolute, relative } from "node:path";

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

/**
 * Returns whether a resolved path is the base directory itself or contained within it.
 *
 * @param basePath The absolute base directory.
 * @param candidatePath The absolute path to check.
 * @returns Whether candidatePath is basePath or sits inside it.
 */
export function isPathInside(basePath: string, candidatePath: string): boolean {
  const relativePath = relative(basePath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}
