import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  cleanup,
  countNewReviews,
  type FetchLike,
  getMaxReviewId,
  type IssueComment,
  listIssueComments,
  listReviews,
  main,
  parseMaxIdBefore,
  parseNextLink,
  REVIEW_AUTHOR,
  REVIEW_MARKER,
  type Review,
  runMarker,
  selectClaudeReviews,
  selectRunTrackingComments,
  snapshot,
  verify,
} from "./claude-review-gate.ts";

const HEAD = "c462f0c49c0f35e3cb065cf2247312502d1f8062";
const OLD_HEAD = "da7cc34a1111111111111111111111111111111111";
const RUN_ID = "34956932196";
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

const claudeReview = (
  id: number,
  {
    commitId = HEAD,
    runId = RUN_ID,
    state = "COMMENTED",
  }: { commitId?: string | null; runId?: string; state?: string } = {},
): Review => ({
  body: `Summary\n\n<!-- ${REVIEW_MARKER} -->\n${runMarker(runId)}\n<!-- CLAUDE_VERDICT:APPROVE -->`,
  commit_id: commitId,
  id,
  state,
  user: { login: REVIEW_AUTHOR },
});

const pendingClaudeReview = (id: number, commitId = HEAD): Review => ({
  ...claudeReview(id, { commitId }),
  state: "PENDING",
});

const humanReview = (id: number, commitId = HEAD): Review => ({
  body: `LGTM <!-- ${REVIEW_MARKER} -->`,
  commit_id: commitId,
  id,
  state: "APPROVED",
  user: { login: "0xbulma" },
});

const botPlaceholder = (id: number, commitId = HEAD): Review => ({
  body: "Claude Code is working…",
  commit_id: commitId,
  id,
  state: "COMMENTED",
  user: { login: REVIEW_AUTHOR },
});

const trackingComment = (
  id: number,
  {
    login = REVIEW_AUTHOR,
    runId = RUN_ID,
  }: { login?: string; runId?: string } = {},
): IssueComment => ({
  body: `### PR Review in progress\n\n- [ ] Validate CI environment and PR state\n\n[View job run](https://github.com/morpho-org/sdks/actions/runs/${runId})`,
  id,
  user: { login },
});

const env = {
  GH_TOKEN: "ghs_test",
  GITHUB_REPOSITORY: "morpho-org/sdks",
  GITHUB_RUN_ID: RUN_ID,
  HEAD_SHA: HEAD,
  PR_NUMBER: "1076",
};
const countOptions = { headSha: HEAD, maxIdBefore: 10, runId: RUN_ID };

describe("parseNextLink", () => {
  test("default", () => {
    expect(
      parseNextLink(
        '<https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=3>; rel="last"',
      )?.href,
    ).toBe(
      "https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=2",
    );
  });

  test('behavior: middle page lists rel="prev" before rel="next"', () => {
    expect(
      parseNextLink(
        '<https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=1>; rel="prev", <https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=3>; rel="next", <https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=4>; rel="last", <https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=1>; rel="first"',
      )?.href,
    ).toBe(
      "https://api.github.com/repositories/1/pulls/1076/reviews?per_page=100&page=3",
    );
  });

  test("behavior: last page", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(
      parseNextLink(
        '<https://api.github.com/repositories/1/pulls/1076/reviews?page=1>; rel="prev"',
      ),
    ).toBeNull();
  });
});

describe("selectClaudeReviews", () => {
  test("default", () => {
    const reviews = [
      claudeReview(1),
      humanReview(2),
      botPlaceholder(3),
      { body: null, commit_id: HEAD, id: 4, state: "COMMENTED", user: null },
    ];

    expect(selectClaudeReviews(reviews).map((review) => review.id)).toEqual([
      1,
    ]);
  });

  test("behavior: REQUEST_CHANGES verdicts count like COMMENT ones", () => {
    expect(
      selectClaudeReviews([
        claudeReview(1, { state: "CHANGES_REQUESTED" }),
        claudeReview(2, { state: "APPROVED" }),
      ]).map((review) => review.id),
    ).toEqual([1, 2]);
    expect(
      countNewReviews(
        [claudeReview(11, { state: "CHANGES_REQUESTED" })],
        countOptions,
      ),
    ).toBe(1);
  });

  test("behavior: unsubmitted PENDING drafts never count", () => {
    expect(
      selectClaudeReviews([pendingClaudeReview(1), claudeReview(2)]).map(
        (review) => review.id,
      ),
    ).toEqual([2]);
  });
});

describe("getMaxReviewId", () => {
  test("default", () => {
    expect(
      getMaxReviewId([claudeReview(10), claudeReview(30), claudeReview(20)]),
    ).toBe(30);
  });

  test("behavior: ignores foreign marked reviews and returns 0 without any", () => {
    expect(getMaxReviewId([])).toBe(0);
    expect(getMaxReviewId([humanReview(99), botPlaceholder(98)])).toBe(0);
  });
});

describe("countNewReviews", () => {
  test("default", () => {
    expect(
      countNewReviews([claudeReview(10), claudeReview(11)], countOptions),
    ).toBe(1);
  });

  test("behavior: a stale review from an earlier run does not count", () => {
    expect(countNewReviews([claudeReview(10)], countOptions)).toBe(0);
  });

  test("behavior: a review on a different head does not count", () => {
    expect(
      countNewReviews([claudeReview(11, { commitId: OLD_HEAD })], countOptions),
    ).toBe(0);
  });

  test("behavior: a review whose commit was garbage-collected does not count", () => {
    expect(
      countNewReviews([claudeReview(11, { commitId: null })], countOptions),
    ).toBe(0);
  });

  test("behavior: a marked review by another user does not count", () => {
    expect(countNewReviews([humanReview(11)], countOptions)).toBe(0);
  });

  test("behavior: a review posted by a concurrent run on the same head does not count", () => {
    expect(
      countNewReviews(
        [claudeReview(11, { runId: "999" }), claudeReview(12, { runId: "" })],
        countOptions,
      ),
    ).toBe(0);
  });
});

describe("selectRunTrackingComments", () => {
  test("default", () => {
    const comments = [
      trackingComment(1),
      trackingComment(2, { runId: "999" }),
      trackingComment(3, { login: "0xbulma" }),
      { body: null, id: 4, user: { login: REVIEW_AUTHOR } },
      { body: "@codex review", id: 5, user: { login: REVIEW_AUTHOR } },
    ];

    expect(
      selectRunTrackingComments(comments, RUN_ID).map((c) => c.id),
    ).toEqual([1]);
  });

  test("behavior: a run id that merely prefixes another does not match", () => {
    expect(
      selectRunTrackingComments(
        [trackingComment(1, { runId: `${RUN_ID}7` })],
        RUN_ID,
      ),
    ).toEqual([]);
  });

  test("behavior: a non-digit suffix after the run id still matches", () => {
    expect(
      selectRunTrackingComments(
        [
          {
            body: `Claude Code is working…\n\n[View job run](https://github.com/morpho-org/sdks/actions/runs/${RUN_ID}/attempts/2)`,
            id: 1,
            user: { login: REVIEW_AUTHOR },
          },
        ],
        RUN_ID,
      ).map((c) => c.id),
    ).toEqual([1]);
  });

  test("error: rejects a non-numeric run id", () => {
    expect(() => selectRunTrackingComments([trackingComment(1)], ".*")).toThrow(
      /Invalid GITHUB_RUN_ID/,
    );
  });

  test("behavior: a finalized comment with the same run link is retained", () => {
    expect(
      selectRunTrackingComments(
        [
          {
            body: `**PR Review complete** ✅\n\nPosted the formal review.\n\n[View job](https://github.com/morpho-org/sdks/actions/runs/${RUN_ID})`,
            id: 1,
            user: { login: REVIEW_AUTHOR },
          },
        ],
        RUN_ID,
      ),
    ).toEqual([]);
  });
});

describe("cleanup", () => {
  test("default: deletes every tracking comment of the run", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: [trackingComment(1), trackingComment(2, { runId: "999" })],
        next: true,
      },
      { body: [trackingComment(3)] },
      { body: null, status: 204 },
      { body: null, status: 204 },
    ]);
    const output: string[] = [];

    await expect(
      cleanup({ env, fetchImpl, writeOutput: (m) => output.push(m) }),
    ).resolves.toBe(2);
    expect(requests.map((r) => `${r.init.method} ${r.url.pathname}`)).toEqual([
      "GET /repos/morpho-org/sdks/issues/1076/comments",
      "GET /repos/morpho-org/sdks/issues/1076/comments",
      "DELETE /repos/morpho-org/sdks/issues/comments/1",
      "DELETE /repos/morpho-org/sdks/issues/comments/3",
    ]);
    expect(output.join("")).toBe(
      `Deleted 2 tracking comment(s) of run ${RUN_ID}.\n`,
    );
  });

  test("behavior: nothing to delete", async () => {
    const { fetchImpl, requests } = createFetch([{ body: [] }]);

    await expect(
      cleanup({ env, fetchImpl, writeOutput: () => {} }),
    ).resolves.toBe(0);
    expect(requests).toHaveLength(1);
  });

  test("error: a failed DELETE is reported", async () => {
    const { fetchImpl } = createFetch([
      { body: [trackingComment(1)] },
      { body: null, status: 403 },
    ]);

    await expect(
      cleanup({ env, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(/DELETE .*comments\/1 failed with 403/);
  });

  test("error: GITHUB_RUN_ID must be bound", async () => {
    const { fetchImpl } = createFetch([]);
    const { GITHUB_RUN_ID: _unused, ...envWithoutRunId } = env;

    await expect(
      cleanup({ env: envWithoutRunId, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(/GITHUB_RUN_ID/);
  });
});

describe("listIssueComments", () => {
  test("error: rejects a malformed comment entry", async () => {
    const { fetchImpl } = createFetch([{ body: [{ id: "1" }] }]);

    await expect(
      listIssueComments({
        fetchImpl,
        prNumber: "1076",
        repository: "morpho-org/sdks",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/malformed comment entry/);
  });
});

describe("parseMaxIdBefore", () => {
  test("default", () => {
    expect(parseMaxIdBefore("42")).toBe(42);
  });

  test("error: rejects an unwired snapshot output", () => {
    expect(() => parseMaxIdBefore(undefined)).toThrow(/Missing MAX_ID_BEFORE/);
    expect(() => parseMaxIdBefore("")).toThrow(/Missing MAX_ID_BEFORE/);
  });

  test("error: rejects non-integer values", () => {
    expect(() => parseMaxIdBefore("-1")).toThrow(/Invalid MAX_ID_BEFORE/);
    expect(() => parseMaxIdBefore("abc")).toThrow(/Invalid MAX_ID_BEFORE/);
  });
});

describe("listReviews", () => {
  test("default: follows Link pagination and sends the job token", async () => {
    const { fetchImpl, requests } = createFetch([
      { body: [claudeReview(1)], next: true },
      { body: [claudeReview(2)] },
    ]);

    const reviews = await listReviews({
      fetchImpl,
      prNumber: "1076",
      repository: "morpho-org/sdks",
      token: "ghs_test",
    });

    expect(reviews.map((review) => review.id)).toEqual([1, 2]);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe(
      "/repos/morpho-org/sdks/pulls/1076/reviews",
    );
    expect(requests[0]?.init.headers.Authorization).toBe("Bearer ghs_test");
    expect(requests[1]?.url.searchParams.get("page")).toBe("2");
  });

  test("error: surfaces API failures instead of an empty list", async () => {
    const { fetchImpl } = createFetch([{ status: 502, body: {} }]);

    await expect(
      listReviews({
        fetchImpl,
        prNumber: "1076",
        repository: "morpho-org/sdks",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/failed with 502/);
  });

  test("error: rejects a non-array payload", async () => {
    const { fetchImpl } = createFetch([{ body: { message: "nope" } }]);

    await expect(
      listReviews({
        fetchImpl,
        prNumber: "1076",
        repository: "morpho-org/sdks",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/non-array/);
  });

  test("behavior: accepts a garbage-collected review whose commit_id is null", async () => {
    const { fetchImpl } = createFetch([
      { body: [{ ...claudeReview(1), commit_id: null }, claudeReview(2)] },
    ]);

    const reviews = await listReviews({
      fetchImpl,
      prNumber: "1076",
      repository: "morpho-org/sdks",
      token: "ghs_test",
    });

    expect(reviews.map((r) => r.commit_id)).toEqual([null, HEAD]);
  });

  test("error: rejects a review entry with a malformed shape", async () => {
    const { fetchImpl } = createFetch([
      { body: [{ ...claudeReview(1), id: "1" }] },
    ]);

    await expect(
      listReviews({
        fetchImpl,
        prNumber: "1076",
        repository: "morpho-org/sdks",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/malformed review entry/);
  });
});

describe("snapshot", () => {
  test("default: writes the highest existing Claude review id to GITHUB_OUTPUT", async () => {
    const outputFile = join(createTempDir(), "output");
    const { fetchImpl } = createFetch([
      { body: [claudeReview(5), humanReview(50), claudeReview(7)] },
    ]);
    const output: string[] = [];

    await expect(
      snapshot({
        env,
        fetchImpl,
        outputFile,
        writeOutput: (message) => {
          output.push(message);
        },
      }),
    ).resolves.toBe(7);
    expect(readFileSync(outputFile, "utf8")).toBe("max_id=7\n");
    expect(output.join("")).toContain("7");
  });

  test("behavior: no prior review writes 0", async () => {
    const outputFile = join(createTempDir(), "output");
    const { fetchImpl } = createFetch([{ body: [] }]);

    await snapshot({ env, fetchImpl, outputFile, writeOutput: () => {} });

    expect(readFileSync(outputFile, "utf8")).toBe("max_id=0\n");
  });

  test("behavior: falls back to GITHUB_OUTPUT when no outputFile is injected", async () => {
    const outputFile = join(createTempDir(), "output");
    const { fetchImpl } = createFetch([{ body: [claudeReview(5)] }]);

    await snapshot({
      env: { ...env, GITHUB_OUTPUT: outputFile },
      fetchImpl,
      writeOutput: () => {},
    });

    expect(readFileSync(outputFile, "utf8")).toBe("max_id=5\n");
  });

  test("error: no output sink", async () => {
    const { fetchImpl } = createFetch([{ body: [] }]);

    await expect(
      snapshot({ env, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(/GITHUB_OUTPUT/);
  });

  test("error: missing environment", async () => {
    const { fetchImpl } = createFetch([{ body: [] }]);

    await expect(
      snapshot({ env: { ...env, PR_NUMBER: "" }, fetchImpl }),
    ).rejects.toThrow(/PR_NUMBER/);
  });
});

describe("verify", () => {
  test("default: passes when a new review exists on the head", async () => {
    const { fetchImpl } = createFetch([
      { body: [claudeReview(5), claudeReview(9)] },
    ]);
    const output: string[] = [];

    await expect(
      verify({
        env: { ...env, MAX_ID_BEFORE: "5" },
        fetchImpl,
        writeOutput: (message) => {
          output.push(message);
        },
      }),
    ).resolves.toBe(1);
    expect(output.join("")).toContain(
      `Found 1 new Claude review(s) on ${HEAD}`,
    );
  });

  test("error: fails when Claude posted nothing", async () => {
    const { fetchImpl } = createFetch([{ body: [] }]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "0" }, fetchImpl }),
    ).rejects.toThrow(/without posting a formal review/);
  });

  test("error: fails when only a stale review from an earlier run exists", async () => {
    const { fetchImpl } = createFetch([{ body: [claudeReview(5)] }]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(/without posting a formal review/);
  });

  test("error: fails when the review targets another head", async () => {
    const { fetchImpl } = createFetch([
      { body: [claudeReview(9, { commitId: OLD_HEAD })] },
    ]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(/without posting a formal review/);
  });

  test("error: fails when the review was posted by another run", async () => {
    const { fetchImpl } = createFetch([
      { body: [claudeReview(9, { runId: "1" })] },
    ]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(new RegExp(`carrying ${runMarker(RUN_ID)}`));
  });

  test("error: GITHUB_RUN_ID must be bound", async () => {
    const { fetchImpl } = createFetch([{ body: [claudeReview(9)] }]);
    const { GITHUB_RUN_ID: _unused, ...envWithoutRunId } = env;

    await expect(
      verify({ env: { ...envWithoutRunId, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(/GITHUB_RUN_ID/);
  });

  test("error: an API failure is reported as such, not as a missing review", async () => {
    const { fetchImpl } = createFetch([{ status: 500, body: {} }]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(/failed with 500/);
  });
});

describe("main", () => {
  test("default: dispatches modes", async () => {
    const { fetchImpl } = createFetch([{ body: [claudeReview(9)] }]);

    await expect(
      main({
        argv: ["verify"],
        env: { ...env, MAX_ID_BEFORE: "0" },
        fetchImpl,
        writeOutput: () => {},
      }),
    ).resolves.toBe(1);
  });

  test("behavior: snapshot mode", async () => {
    const { fetchImpl } = createFetch([{ body: [claudeReview(7)] }]);
    const dir = mkdtempSync(join(tmpdir(), "claude-review-gate-main-"));
    const outputFile = join(dir, "output");

    try {
      await expect(
        main({
          argv: ["snapshot"],
          env,
          fetchImpl,
          outputFile,
          writeOutput: () => {},
        }),
      ).resolves.toBe(7);
      expect(readFileSync(outputFile, "utf8")).toBe("max_id=7\n");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("behavior: cleanup mode", async () => {
    const { fetchImpl } = createFetch([
      { body: [trackingComment(1)] },
      { body: null, status: 204 },
    ]);

    await expect(
      main({ argv: ["cleanup"], env, fetchImpl, writeOutput: () => {} }),
    ).resolves.toBe(1);
  });

  test("error: unknown mode", async () => {
    await expect(main({ argv: ["nope"], env })).rejects.toThrow(
      /Unknown mode "nope"/,
    );
  });
});

interface FakePage {
  readonly body: unknown;
  readonly next?: boolean;
  readonly status?: number;
}

function createFetch(pages: readonly FakePage[]) {
  const requests: {
    init: { headers: Record<string, string>; method: string };
    url: URL;
  }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const page = pages[requests.length];
    requests.push({ init, url: new URL(url) });
    if (page == null) throw new Error("Unexpected extra request");

    const status = page.status ?? 200;
    const headers = new Headers();
    if (page.next) {
      const next = new URL(url);
      next.searchParams.set("page", String(requests.length + 1));
      headers.set("link", `<${next.href}>; rel="next"`);
    }

    return {
      headers,
      json: async () => page.body,
      ok: status >= 200 && status < 300,
      status,
    };
  };

  return { fetchImpl, requests };
}

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "claude-review-gate-"));
  tempDirs.push(tempDir);
  return tempDir;
}
