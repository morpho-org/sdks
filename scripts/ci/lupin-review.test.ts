import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  type CommandResult,
  DELIVERY,
  fetchRevisionArgs,
  history,
  main,
  parseLineage,
  planPublication,
  publish,
  type RunCommand,
  result,
  WORKFLOW_FILE,
} from "./lupin-review.ts";

const BASE = "e3e5893e0b90db7963d24176165ac82d5f79e7b8";
const HEAD = "1d322787b8ca26d7012835e69e0730ec78e7a97d";
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lupin-review-"));
  tempDirs.push(dir);
  return dir;
}

interface Call {
  readonly args: readonly string[];
  readonly command: string;
}

/** Records every command and answers each with the next scripted result (success by default). */
function recorder(results: CommandResult[] = []): {
  calls: Call[];
  run: RunCommand;
} {
  const calls: Call[] = [];
  return {
    calls,
    run: ({ args, command }) => {
      calls.push({ args, command });
      return results.shift() ?? { status: 0, stdout: "" };
    },
  };
}

function workspace() {
  const root = makeTempDir();
  const reviewOutput = join(root, "review-output");
  const githubOutput = join(root, "github-output");
  writeFileSync(githubOutput, "");
  return {
    env: {
      GITHUB_OUTPUT: githubOutput,
      GITHUB_REPOSITORY: "morpho-org/sdks",
      GITHUB_RUN_ATTEMPT: "2",
      LUPIN: "/opt/lupin/lupin",
      PR_NUMBER: "1128",
      REVIEW_OUTPUT: reviewOutput,
      RUN_URL: "https://github.com/morpho-org/sdks/actions/runs/7",
      RUNNER_TEMP: root,
    },
    githubOutput,
    reviewOutput,
    root,
  };
}

function saveResult(reviewOutput: string): void {
  mkdirSync(join(reviewOutput, "run"), { recursive: true });
  writeFileSync(join(reviewOutput, "run", "review.json"), "{}");
}

const found = (directory: string) =>
  JSON.stringify({
    baseRevision: BASE,
    directory,
    found: true,
    revision: HEAD,
  });

describe("parseLineage", () => {
  test("default: complete lookup", () => {
    expect(parseLineage(found("/tmp/previous"))).toEqual({
      directory: "/tmp/previous",
      found: true,
      revisions: [BASE, HEAD],
    });
  });

  test("behavior: absent history keeps Lupin's reason", () => {
    expect(
      parseLineage(JSON.stringify({ found: false, reason: "no runs" })),
    ).toEqual({ found: false, reason: "no runs" });
    expect(parseLineage(JSON.stringify({ found: false }))).toEqual({
      found: false,
      reason: "no previous review",
    });
  });

  test("error: malformed lookups are treated as absent history", () => {
    expect(parseLineage("not json").found).toBe(false);
    expect(parseLineage("null").found).toBe(false);
    expect(
      parseLineage(
        JSON.stringify({ found: true, directory: "/x", revision: HEAD }),
      ),
    ).toEqual({
      found: false,
      reason: "lineage lookup omitted the previous directory or revisions",
    });
    expect(
      parseLineage(
        JSON.stringify({
          baseRevision: "main; rm -rf /",
          directory: "/x",
          found: true,
          revision: HEAD,
        }),
      ).found,
    ).toBe(false);
  });
});

describe("planPublication", () => {
  test("default: a saved result is published as feedback", () => {
    expect(
      planPublication({
        hasResult: true,
        reviewResult: "failure",
        runDirectory: "/r",
        startResult: "success",
      }),
    ).toEqual({ kind: "comment", runDirectory: "/r" });
  });

  test("behavior: no result records a failed or cancelled run", () => {
    const plan = (reviewResult: string, startResult: string) =>
      planPublication({
        hasResult: false,
        reviewResult,
        runDirectory: "/r",
        startResult,
      });
    expect(plan("failure", "success")).toEqual({
      kind: "status",
      state: "failed",
    });
    expect(plan("", "failure")).toEqual({ kind: "status", state: "failed" });
    expect(plan("cancelled", "success")).toEqual({
      kind: "status",
      state: "cancelled",
    });
    expect(plan("skipped", "cancelled")).toEqual({
      kind: "status",
      state: "cancelled",
    });
  });
});

describe("history", () => {
  test("default: fetches both revisions and supplies the previous review", () => {
    const { env, githubOutput, reviewOutput, root } = workspace();
    const previous = join(root, "review-previous");
    const { calls, run } = recorder([{ status: 0, stdout: found(previous) }]);

    expect(history({ env, run, writeOutput: () => {} }).found).toBe(true);
    expect(calls).toEqual([
      {
        args: [
          "lineage",
          "fetch",
          "1128",
          "--repo",
          "morpho-org/sdks",
          "--workflow",
          WORKFLOW_FILE,
          "--output",
          previous,
        ],
        command: "/opt/lupin/lupin",
      },
      { args: fetchRevisionArgs(BASE), command: "git" },
      { args: fetchRevisionArgs(HEAD), command: "git" },
    ]);
    expect(readFileSync(githubOutput, "utf8")).toBe(`previous=${previous}\n`);
    expect(
      JSON.parse(readFileSync(join(reviewOutput, "lineage.json"), "utf8")),
    ).toMatchObject({ found: true });
  });

  test("behavior: unreachable revisions review without history", () => {
    const { env, githubOutput, reviewOutput } = workspace();
    const { run } = recorder([
      { status: 0, stdout: found("/p") },
      { status: 0, stdout: "" },
      { status: 128, stdout: "" },
    ]);
    const messages: string[] = [];

    expect(history({ env, run, writeOutput: (m) => messages.push(m) })).toEqual(
      {
        found: false,
        reason: "previous review revisions are no longer reachable",
      },
    );
    expect(readFileSync(githubOutput, "utf8")).toBe("");
    expect(messages.join("")).toMatch(/No previous review supplied/);
    expect(
      JSON.parse(readFileSync(join(reviewOutput, "lineage.json"), "utf8")),
    ).toMatchObject({ found: false });
  });

  test("behavior: a failed lookup is recorded, not fatal", () => {
    const { env, githubOutput } = workspace();
    const { calls, run } = recorder([{ status: 1, stdout: "" }]);

    expect(history({ env, run, writeOutput: () => {} })).toEqual({
      found: false,
      reason: "lineage lookup failed",
    });
    expect(calls).toHaveLength(1);
    expect(readFileSync(githubOutput, "utf8")).toBe("");
  });

  test("error: unset wiring fails before any lookup", () => {
    const { env } = workspace();
    const { calls, run } = recorder();
    const { LUPIN: _, ...missing } = env;

    expect(() => history({ env: missing, run })).toThrow(/LUPIN/);
    expect(calls).toHaveLength(0);
  });
});

describe("result", () => {
  test("default: a saved result is exposed to the publisher", () => {
    const { env, githubOutput, reviewOutput } = workspace();
    saveResult(reviewOutput);

    expect(result({ env })).toBe(true);
    expect(readFileSync(githubOutput, "utf8")).toBe("present=true\n");
  });

  test("behavior: a missing result is not exposed", () => {
    const { env, githubOutput } = workspace();

    expect(result({ env })).toBe(false);
    expect(readFileSync(githubOutput, "utf8")).toBe("");
  });
});

describe("publish", () => {
  const target = [
    "--repo",
    "morpho-org/sdks",
    "--pr",
    "1128",
    "--run-url",
    "https://github.com/morpho-org/sdks/actions/runs/7",
    "--attempt",
    "2",
  ];

  test("default: posts feedback without a formal verdict", () => {
    const { env, reviewOutput } = workspace();
    saveResult(reviewOutput);
    const { calls, run } = recorder();

    expect(publish({ env, run }).kind).toBe("comment");
    expect(calls).toEqual([
      {
        args: [
          "comment",
          join(reviewOutput, "run"),
          ...target,
          "--delivery",
          DELIVERY,
        ],
        command: "/opt/lupin/lupin",
      },
    ]);
    expect(DELIVERY).toBe("comment");
  });

  test("behavior: no result records the cancelled run", () => {
    const { env, reviewOutput } = workspace();
    const { calls, run } = recorder();

    publish({ env: { ...env, REVIEW_RESULT: "cancelled" }, run });
    expect(calls).toEqual([
      {
        args: [
          "comment-status",
          ...target,
          "--state",
          "cancelled",
          "--output",
          join(reviewOutput, "run"),
        ],
        command: "/opt/lupin/lupin",
      },
    ]);
  });

  test("error: failed delivery records a failed status and fails the job", () => {
    const { env, reviewOutput } = workspace();
    saveResult(reviewOutput);
    const { calls, run } = recorder([{ status: 1, stdout: "" }]);

    expect(() => publish({ env, run })).toThrow(/could not publish/);
    expect(calls.map((call) => call.args[0])).toEqual([
      "comment",
      "comment-status",
    ]);
    expect(calls[1]?.args).toContain("failed");
  });

  test("error: an unrecorded status fails the job", () => {
    const { env } = workspace();
    const { run } = recorder([{ status: 1, stdout: "" }]);

    expect(() => publish({ env, run })).toThrow(/failed review status/);
  });
});

describe("main", () => {
  test("error: unknown mode", () => {
    expect(() => main({ argv: ["deploy"] })).toThrow(/Unknown mode "deploy"/);
    expect(() => main({ argv: [] })).toThrow(/Unknown mode ""/);
  });
});
