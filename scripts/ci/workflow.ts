/** Reads an environment variable that the workflow must bind; unset or blank is a wiring error. */
export function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

/** Default `writeOutput` sink for the CLI dispatchers. */
export function writeStdout(message: string): void {
  process.stdout.write(message);
}

/**
 * Terminal error handler for the CLI entry shims: reports the failure as a workflow `::error::`
 * annotation (including the `cause` chain, e.g. the DNS/socket error behind undici's `fetch failed`)
 * and marks the process as failed without cutting off pending stdio flushes.
 */
export function reportCliError(error: unknown): void {
  process.stderr.write(
    `::error::${sanitizeAnnotation(describeError(error))}\n`,
  );
  process.exitCode = 1;
}

/** Formats an error as its message followed by every `cause` message, separated by `: `. */
export function describeError(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }

  return messages.join(": ");
}

/**
 * Percent-encodes the characters that would terminate a GitHub workflow-command annotation
 * (`::error::…`), so a multi-line message is reported whole instead of truncated.
 */
export function sanitizeAnnotation(message: string): string {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
