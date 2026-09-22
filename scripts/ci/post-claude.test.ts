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
import { digestDirectory } from "./trusted-scripts.ts";

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
  mkdirSync(trusted);
  writeFileSync(join(trusted, "a.ts"), "a");

  return { dir, digest: digestDirectory(trusted), trusted };
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

function gateEnv(trusted: string, digest: string): NodeJS.ProcessEnv {
  return {
    GH_TOKEN: "t",
    GITHUB_REPOSITORY: "morpho-org/sdks",
    GITHUB_RUN_ID: RUN_ID,
    HEAD_SHA: HEAD,
    MAX_ID_BEFORE: "3",
    PR_NUMBER: "1",
    SCRIPTS_DIGEST: digest,
    TRUSTED_SCRIPTS_DIR: trusted,
  };
}

describe("post-claude main", () => {
  test("default: verify-review checks the trusted copy, then runs the gate", async () => {
    const { digest, trusted } = trustedFixture();
    const out: string[] = [];

    await main({
      argv: ["verify-review"],
      env: gateEnv(trusted, digest),
      fetchImpl: okFetch,
      writeOutput: (m) => out.push(m),
    });

    expect(out).toEqual([
      `Trusted scripts in ${trusted} match the snapshot.\n`,
      `Found 1 new Claude review(s) on ${HEAD}.\n`,
    ]);
  });

  test("default: cleanup-tracking checks the trusted copy, then deletes the run's comments", async () => {
    const { digest, trusted } = trustedFixture();
    const requests: string[] = [];
    const out: string[] = [];

    await main({
      argv: ["cleanup-tracking"],
      env: gateEnv(trusted, digest),
      fetchImpl: async (url, init) => {
        requests.push(`${init.method} ${url.pathname}`);
        if (init.method === "DELETE")
          return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify([
            {
              body: `[View job run](https://github.com/morpho-org/sdks/actions/runs/${RUN_ID})`,
              id: 9,
              user: { login: "github-actions[bot]" },
            },
          ]),
          { status: 200 },
        );
      },
      writeOutput: (m) => out.push(m),
    });

    expect(requests).toEqual([
      "GET /repos/morpho-org/sdks/issues/1/comments",
      "DELETE /repos/morpho-org/sdks/issues/comments/9",
    ]);
    expect(out[1]).toBe(`Deleted 1 tracking comment(s) of run ${RUN_ID}.\n`);
  });

  test("error: a tampered trusted copy stops before the authenticated gate runs", async () => {
    const { digest, trusted } = trustedFixture();
    writeFileSync(join(trusted, "a.ts"), "tampered");
    let fetched = false;

    await expect(
      main({
        argv: ["verify-review"],
        env: gateEnv(trusted, digest),
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
    const { digest, dir, trusted } = trustedFixture();
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
        TRUSTED_SCRIPTS_DIR: trusted,
      },
      writeOutput: () => {},
    });

    expect(readFileSync(output, "utf8")).toBe('{"token":"***"}');
    expect(readFileSync(githubOutput, "utf8")).toBe(`path=${output}\n`);
  });

  test("error: a tampered trusted copy stops before scrubbing", async () => {
    const { digest, dir, trusted } = trustedFixture();
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
          TRUSTED_SCRIPTS_DIR: trusted,
        },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/modified after the snapshot/);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(githubOutput)).toBe(false);
  });

  test("error: missing TRUSTED_SCRIPTS_DIR / unknown mode", async () => {
    const { digest } = trustedFixture();
    await expect(
      main({
        argv: ["verify-review"],
        env: { SCRIPTS_DIGEST: digest },
        writeOutput: () => {},
      }),
    ).rejects.toThrow(/TRUSTED_SCRIPTS_DIR/);
    await expect(
      main({ argv: ["nope"], env: {}, writeOutput: () => {} }),
    ).rejects.toThrow(/Unknown mode "nope"/);
  });
});
