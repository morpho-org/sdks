import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Reads an environment variable that the workflow must bind; unset or blank is a wiring error. */
export function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

/**
 * Whether `moduleUrl` (a script's `import.meta.url`) is the module Node was launched with. Node
 * realpaths the main module, so `process.argv[1]` is realpathed too before comparing; a symlinked
 * invocation path must not silently skip `main()` and exit 0.
 */
export function isMain(
  moduleUrl: string,
  argv: readonly string[] = process.argv,
): boolean {
  const entry = argv[1];
  if (entry == null || entry === "") return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
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

/**
 * Formats an error as its message followed by every `cause` message, separated by `: `. An
 * `AggregateError` (undici's shape for connection failures, whose own message is often empty)
 * contributes its `errors` joined by `; `. Empty messages are dropped.
 */
export function describeError(error: unknown): string {
  return describeChain(error, new Set()).join(": ");
}

function describeChain(error: unknown, seen: Set<unknown>): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    const message =
      current instanceof Error ? current.message : String(current);
    if (message !== "") messages.push(message);
    if (current instanceof AggregateError) {
      const inner = current.errors
        .map((e: unknown) => describeChain(e, seen).join(": "))
        .filter((m) => m !== "");
      if (inner.length > 0) messages.push(inner.join("; "));
    }
    current = current instanceof Error ? current.cause : undefined;
  }

  return messages;
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
