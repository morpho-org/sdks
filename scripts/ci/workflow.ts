/** Reads an environment variable that the workflow must bind; unset or blank is a wiring error. */
export function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
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
