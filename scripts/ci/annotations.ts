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
