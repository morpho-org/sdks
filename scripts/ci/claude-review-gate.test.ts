import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  countNewReviews,
  type FetchLike,
  getMaxReviewId,
  listReviews,
  main,
  parseMaxIdBefore,
  parseNextLink,
  REVIEW_AUTHOR,
  REVIEW_MARKER,
  type Review,
  selectClaudeReviews,
  snapshot,
  verify,
} from "./claude-review-gate.ts";

const HEAD = "c462f0c49c0f35e3cb065cf2247312502d1f8062";
const OLD_HEAD = "da7cc34a1111111111111111111111111111111111";
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

const claudeReview = (id: number, commitId = HEAD): Review => ({
  body: `Summary\n\n<!-- ${REVIEW_MARKER} -->\n<!-- CLAUDE_VERDICT:APPROVE -->`,
  commit_id: commitId,
  id,
  user: { login: REVIEW_AUTHOR },
});

const humanReview = (id: number, commitId = HEAD): Review => ({
  body: `LGTM <!-- ${REVIEW_MARKER} -->`,
  commit_id: commitId,
  id,
  user: { login: "0xbulma" },
});

const botPlaceholder = (id: number, commitId = HEAD): Review => ({
  body: "Claude Code is working…",
  commit_id: commitId,
  id,
  user: { login: REVIEW_AUTHOR },
});

const env = {
  GH_TOKEN: "ghs_test",
  GITHUB_REPOSITORY: "morpho-org/sdks",
  HEAD_SHA: HEAD,
  PR_NUMBER: "1076",
};

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
      { body: null, commit_id: HEAD, id: 4, user: null },
    ];

    expect(selectClaudeReviews(reviews).map((review) => review.id)).toEqual([
      1,
    ]);
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
      countNewReviews([claudeReview(10), claudeReview(11)], {
        headSha: HEAD,
        maxIdBefore: 10,
      }),
    ).toBe(1);
  });

  test("behavior: a stale review from an earlier run does not count", () => {
    expect(
      countNewReviews([claudeReview(10)], { headSha: HEAD, maxIdBefore: 10 }),
    ).toBe(0);
  });

  test("behavior: a review on a different head does not count", () => {
    expect(
      countNewReviews([claudeReview(11, OLD_HEAD)], {
        headSha: HEAD,
        maxIdBefore: 10,
      }),
    ).toBe(0);
  });

  test("behavior: a marked review by another user does not count", () => {
    expect(
      countNewReviews([humanReview(11)], { headSha: HEAD, maxIdBefore: 10 }),
    ).toBe(0);
  });
});

describe("parseMaxIdBefore", () => {
  test("default", () => {
    expect(parseMaxIdBefore("42")).toBe(42);
  });

  test("behavior: missing snapshot means 0", () => {
    expect(parseMaxIdBefore(undefined)).toBe(0);
    expect(parseMaxIdBefore("")).toBe(0);
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
    const { fetchImpl } = createFetch([{ body: [claudeReview(9, OLD_HEAD)] }]);

    await expect(
      verify({ env: { ...env, MAX_ID_BEFORE: "5" }, fetchImpl }),
    ).rejects.toThrow(/without posting a formal review/);
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
