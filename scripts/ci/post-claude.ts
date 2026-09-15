/**
 * post-claude.ts — the single command the post-Claude workflow steps run. Sequencing the trusted-copy
 * integrity check before the authenticated gate (or the scrubber) is CI pass/fail orchestration, so it
 * lives here, tested, rather than as ordered shell lines in `.github/workflows/claude.yml`.
 *
 *   node post-claude.ts verify-review              # trusted-scripts verify, then claude-review-gate verify
 *   node post-claude.ts scrub <input> <output>     # trusted-scripts verify, then scrub-transcript
 *
 * Reads `TRUSTED_SCRIPTS_DIR` and `SCRIPTS_DIGEST` from the environment for the integrity check; the
 * remaining variables are those of the delegated command.
 */
import { pathToFileURL } from "node:url";

import { type FetchLike, main as gateMain } from "./claude-review-gate.ts";
import { main as scrubMain } from "./scrub-transcript.ts";
import { verify as verifyTrusted } from "./trusted-scripts.ts";
import { readRequiredEnv, reportCliError, writeStdout } from "./workflow.ts";

/** Injectable argv/env/output boundaries of the CLI. */
export interface PostClaudeOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  /** Overrides `fetch` for the review gate (tests). */
  readonly fetchImpl?: FetchLike;
  readonly outputFile?: string;
  readonly writeOutput?: (message: string) => void;
}

/** Runs the integrity check, then dispatches to the requested post-Claude command. */
export async function main(options: PostClaudeOptions = {}): Promise<void> {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? writeStdout;
  const [mode, ...rest] = argv;

  if (mode !== "verify-review" && mode !== "scrub") {
    throw new Error(
      `Unknown mode "${mode ?? ""}". Usage: post-claude.ts <verify-review | scrub <input> <output>>`,
    );
  }

  const trustedDir = readRequiredEnv(env, "TRUSTED_SCRIPTS_DIR");
  verifyTrusted(trustedDir, readRequiredEnv(env, "SCRIPTS_DIGEST"));
  writeOutput(`Trusted scripts in ${trustedDir} match the snapshot.\n`);

  if (mode === "verify-review") {
    await gateMain({ ...options, argv: ["verify"], env, writeOutput });
    return;
  }
  scrubMain({ ...options, argv: rest, env, writeOutput });
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(reportCliError);
}
