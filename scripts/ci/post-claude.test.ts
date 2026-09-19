import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { main } from "./post-claude.ts";
import { digestDirectories } from "./trusted-scripts.ts";

const HEAD = "a".repeat(40);
const RUN_ID = "42";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

function trustedFixture() {
  const dir = mkdtempSync(join(tmpdir(), "post-claude-"));
  tempDirs.push(dir);
  const trusted = join(dir, "trusted");
  const agents = join(dir, "trusted-agents");
  mkdirSync(trusted);
  mkdirSync(join(agents, "commands"), { recursive: true });
  writeFileSync(join(trusted, "a.ts"), "a");
  writeFileSync(join(agents, "commands", "review-pr-ci.md"), "review");

  return { agents, digest: digestDirectories([trusted, agents]), dir, trusted };
}

const okFetch = () =>
  Promise.resolve(
    new Response(
      JSON.stringify([
        {
          body: `<!-- CLAUDE_REVIEW_COMPLETE -->\n<!-- CLAUDE_REVIEW_RUN:${RUN_ID} -->`,
          commit_id: HEAD,
          id: 7,
          state: "COMMENTED",
          user: { login: "github-actions[bot]" },
        },
      ]),
      { status: 200 },
    ),
  );

function gateEnv(fixture: {
  readonly agents: string;
  readonly digest: string;
  readonly trusted: string;
}): NodeJS.ProcessEnv {
  return {
    GH_TOKEN: "t",
    GITHUB_REPOSITORY: "morpho-org/sdks",
    GITHUB_RUN_ID: RUN_ID,
    HEAD_SHA: HEAD,
    MAX_ID_BEFORE: "3",
    PR_NUMBER: "1",
    SCRIPTS_DIGEST: fixture.digest,
    TRUSTED_AGENTS_DIR: fixture.agents,
    TRUSTED_SCRIPTS_DIR: fixture.trusted,
  };
}

describe("post-claude main", () => {
  test("default: verify-review checks the trusted copy, then runs the gate", async () => {
    const { agents, digest, trusted } = trustedFixture();
    const out: string[] = [];

    await main({
      argv: ["verify-review"],
      env: gateEnv({ agents, digest, trusted }),
      fetchImpl: okFetch,
      writeOutput: (m) => out.push(m),
    });

    expect(out).toEqual([
      `Trusted copies in ${trusted}, ${agents} match the snapshot.\n`,
      `Found 1 new Claude review(s) on ${HEAD}.\n`,
    ]);
  });

  test("error: a tampered trusted copy stops before the authenticated gate runs", async () => {
    const { agents, digest, trusted } = trustedFixture();
    writeFileSync(join(trusted, "a.ts"), "tampered");
    let fetched = false;

    await expect(
      main({
        argv: ["verify-review"],
        env: gateEnv({ agents, digest, trusted }),
        fetchImpl: () => {
          fetched = true;
          return okFetch();
        },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/modified after the snapshot/);
    expect(fetched).toBe(false);
  });

  test("error: rewritten review instructions stop the gate before it accepts the review", async () => {
    const { agents, digest, trusted } = trustedFixture();
    writeFileSync(join(agents, "commands", "review-pr-ci.md"), "injected");
    let fetched = false;

    await expect(
      main({
        argv: ["verify-review"],
        env: gateEnv({ agents, digest, trusted }),
        fetchImpl: () => {
          fetched = true;
          return okFetch();
        },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/modified after the snapshot/);
    expect(fetched).toBe(false);
  });

  test("default: scrub checks the trusted copy, then scrubs and records the output path", async () => {
    const { agents, digest, dir, trusted } = trustedFixture();
    const input = join(dir, "execution.json");
    writeFileSync(input, '{"token":"ghp_abcdefghijklmnopqrstuvwxyz0123"}');
    const output = join(dir, "scrubbed.json");
    const githubOutput = join(dir, "github-output");

    await main({
      argv: ["scrub", input, output],
      env: {
        GITHUB_OUTPUT: githubOutput,
        RUNNER_TEMP: dir,
        SCRIPTS_DIGEST: digest,
        SECRET_VALUES: "",
        TRUSTED_AGENTS_DIR: agents,
        TRUSTED_SCRIPTS_DIR: trusted,
      },
      writeOutput: () => {},
    });

    expect(readFileSync(output, "utf8")).toBe('{"token":"***"}');
    expect(readFileSync(githubOutput, "utf8")).toBe(`path=${output}\n`);
  });

  test("error: a tampered trusted copy stops before scrubbing", async () => {
    const { agents, digest, dir, trusted } = trustedFixture();
    writeFileSync(join(trusted, "a.ts"), "tampered");
    const input = join(dir, "execution.json");
    writeFileSync(input, '{"token":"ghp_abcdefghijklmnopqrstuvwxyz0123"}');
    const output = join(dir, "scrubbed.json");
    const githubOutput = join(dir, "github-output");

    await expect(
      main({
        argv: ["scrub", input, output],
        env: {
          GITHUB_OUTPUT: githubOutput,
          RUNNER_TEMP: dir,
          SCRIPTS_DIGEST: digest,
          SECRET_VALUES: "",
          TRUSTED_AGENTS_DIR: agents,
          TRUSTED_SCRIPTS_DIR: trusted,
        },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/modified after the snapshot/);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(githubOutput)).toBe(false);
  });

  test("error: missing trusted directories / unknown mode", async () => {
    const { digest, trusted } = trustedFixture();
    await expect(
      main({
        argv: ["verify-review"],
        env: { SCRIPTS_DIGEST: digest },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/TRUSTED_SCRIPTS_DIR/);
    // The instructions copy is not optional: dropping it would silently stop covering it.
    await expect(
      main({
        argv: ["verify-review"],
        env: { SCRIPTS_DIGEST: digest, TRUSTED_SCRIPTS_DIR: trusted },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/TRUSTED_AGENTS_DIR/);
    await expect(
      main({ argv: ["nope"], env: {}, writeOutput: () => {} }),
    ).rejects.toThrow(/Unknown mode "nope"/);
  });
});
