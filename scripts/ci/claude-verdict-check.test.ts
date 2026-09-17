import { describe, expect, test } from "vitest";

import {
  type FetchLike,
  REVIEW_AUTHOR,
  REVIEW_MARKER,
  type Review,
  runMarker,
} from "./claude-review-gate.ts";
import {
  APPROVE_VERDICT_MARKER,
  CHECK_NAME,
  determineVerdict,
  findVerdictCheckRun,
  latestReview,
  main,
  publish,
  upsertCheckRun,
  verdictCheck,
} from "./claude-verdict-check.ts";

const HEAD = "c462f0c49c0f35e3cb065cf2247312502d1f8062";
const OLD_HEAD = "da7cc34a1111111111111111111111111111111111";
const RUN_ID = "34956932196";

const review = (
  id: number,
  {
    approve = true,
    commitId = HEAD,
    runId = RUN_ID,
    state = "COMMENTED",
  }: {
    approve?: boolean;
    commitId?: string | null;
    runId?: string;
    state?: string;
  } = {},
): Review => ({
  body: `Summary\n\n<!-- ${REVIEW_MARKER} -->\n${runMarker(runId)}${
    approve ? `\n${APPROVE_VERDICT_MARKER}` : ""
  }`,
  commit_id: commitId,
  id,
  state,
  user: { login: REVIEW_AUTHOR },
});

const env = {
  GH_TOKEN: "ghs_test",
  GITHUB_REPOSITORY: "morpho-org/sdks",
  GITHUB_RUN_ID: RUN_ID,
  HEAD_SHA: HEAD,
  MAX_ID_BEFORE: "5",
  PR_NUMBER: "1076",
};

describe("determineVerdict", () => {
  test("default: the approve marker means approve", () => {
    expect(determineVerdict(review(10))).toBe("approve");
  });

  test("behavior: the marker must stand alone on its own line", () => {
    expect(
      determineVerdict({
        ...review(10, { approve: false }),
        body: `Review\n${APPROVE_VERDICT_MARKER}\nThanks`,
      }),
    ).toBe("approve");
    expect(
      determineVerdict({
        ...review(10, { approve: false }),
        body: `Review\r\n${APPROVE_VERDICT_MARKER}\r\nThanks`,
      }),
    ).toBe("approve");
    expect(
      determineVerdict({
        ...review(10, { approve: false }),
        body: "CLAUDE_VERDICT:APPROVE",
      }),
    ).toBe("changes");
    expect(
      determineVerdict({
        ...review(10, { approve: false }),
        body: "It emits <!-- CLAUDE_VERDICT:APPROVE --> when complete.",
      }),
    ).toBe("changes");
  });

  test("behavior: a changes-requested review is never approve", () => {
    expect(determineVerdict(review(10, { state: "CHANGES_REQUESTED" }))).toBe(
      "changes",
    );
  });

  test("behavior: a null body is treated as changes", () => {
    expect(determineVerdict({ ...review(10), body: null })).toBe("changes");
  });

  test("sanity: the exported marker matches the anchored line", () => {
    expect(APPROVE_VERDICT_MARKER).toMatch(
      /^<!-- CLAUDE_VERDICT:APPROVE -->[ \t\r]*$/,
    );
    expect(
      determineVerdict({ ...review(10), body: APPROVE_VERDICT_MARKER }),
    ).toBe("approve");
  });
});

describe("latestReview", () => {
  test("default: returns the highest-id review", () => {
    expect(latestReview([review(10), review(30), review(20)])?.id).toBe(30);
  });

  test("behavior: empty list is null", () => {
    expect(latestReview([])).toBeNull();
  });
});

describe("verdictCheck", () => {
  test("default: approve maps to a green check", () => {
    const check = verdictCheck("approve");
    expect(check.conclusion).toBe("success");
    expect(check.title).toContain("Approved by Claude");
    expect(check.summary).toContain("human review");
  });

  test("behavior: changes maps to a non-blocking neutral check", () => {
    const check = verdictCheck("changes");
    expect(check.conclusion).toBe("neutral");
    expect(check.title).toContain("Changes requested");
  });
});

describe("findVerdictCheckRun", () => {
  test("default: finds the GitHub Actions verdict check-run", () => {
    expect(
      findVerdictCheckRun({
        check_runs: [
          { app: { slug: "github-actions" }, id: 42, name: CHECK_NAME },
        ],
      }),
    ).toBe(42);
  });

  test("behavior: ignores runs from another app and other names", () => {
    expect(
      findVerdictCheckRun({
        check_runs: [
          { app: { slug: "other-app" }, id: 1, name: CHECK_NAME },
          { app: { slug: "github-actions" }, id: 2, name: "Other Check" },
        ],
      }),
    ).toBeNull();
  });

  test("behavior: an empty list has no existing verdict", () => {
    expect(findVerdictCheckRun({ check_runs: [] })).toBeNull();
  });

  test("behavior: entry with null app is skipped", () => {
    expect(
      findVerdictCheckRun({
        check_runs: [{ app: null, id: 7, name: CHECK_NAME }],
      }),
    ).toBeNull();
  });

  test("error: malformed payloads are rejected", () => {
    expect(() => findVerdictCheckRun({ check_runs: [{}] })).toThrow(
      /Malformed check-run entry/,
    );
    expect(() => findVerdictCheckRun({})).toThrow(
      /Malformed check-runs payload/,
    );
  });
});

describe("upsertCheckRun", () => {
  test("default: GETs then POSTs a completed check-run with the job token", async () => {
    const { fetchImpl, requests } = createFetch();

    await upsertCheckRun({
      conclusion: "success",
      fetchImpl,
      headSha: HEAD,
      repository: "morpho-org/sdks",
      summary: "all good",
      title: "✅ Approved by Claude",
      token: "ghs_test",
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe(
      "/repos/morpho-org/sdks/commits/c462f0c49c0f35e3cb065cf2247312502d1f8062/check-runs",
    );
    expect(requests[0]?.url.search).toBe(
      "?check_name=Claude%20Review%20Verdict&per_page=100",
    );
    expect(requests[0]?.init.method).toBe("GET");
    const request = requests[1];
    expect(requests.filter((item) => item.init.method === "POST")).toHaveLength(
      1,
    );
    expect(request?.url.pathname).toBe("/repos/morpho-org/sdks/check-runs");
    expect(request?.url.search).toBe("");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.headers.Authorization).toBe("Bearer ghs_test");
    const payload = JSON.parse(request?.init.body ?? "{}");
    expect(payload).toMatchObject({
      conclusion: "success",
      head_sha: HEAD,
      name: CHECK_NAME,
      output: { summary: "all good", title: "✅ Approved by Claude" },
      status: "completed",
    });
  });

  test("behavior: PATCHes an existing GitHub Actions verdict check-run", async () => {
    const { fetchImpl, requests } = createFetch({
      checkRuns: {
        check_runs: [
          { app: { slug: "github-actions" }, id: 99, name: CHECK_NAME },
        ],
      },
    });

    await upsertCheckRun({
      conclusion: "neutral",
      fetchImpl,
      headSha: HEAD,
      repository: "morpho-org/sdks",
      summary: "needs work",
      title: "🔄 Changes requested by Claude",
      token: "ghs_test",
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.url.pathname).toBe(
      "/repos/morpho-org/sdks/check-runs/99",
    );
    expect(requests[1]?.init.method).toBe("PATCH");
    expect(JSON.parse(requests[1]?.init.body ?? "{}")).toEqual({
      conclusion: "neutral",
      name: CHECK_NAME,
      output: {
        summary: "needs work",
        title: "🔄 Changes requested by Claude",
      },
      status: "completed",
    });
  });

  test("error: GET surfaces a non-2xx response", async () => {
    const { fetchImpl } = createFetch({ checkRunsStatus: 403 });

    await expect(
      upsertCheckRun({
        conclusion: "success",
        fetchImpl,
        headSha: HEAD,
        repository: "morpho-org/sdks",
        summary: "s",
        title: "t",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/GET .*check-runs failed with 403/);
  });

  test("error: PATCH surfaces a non-2xx response", async () => {
    const { fetchImpl } = createFetch({
      checkRuns: {
        check_runs: [
          { app: { slug: "github-actions" }, id: 99, name: CHECK_NAME },
        ],
      },
      patchStatus: 422,
    });

    await expect(
      upsertCheckRun({
        conclusion: "success",
        fetchImpl,
        headSha: HEAD,
        repository: "morpho-org/sdks",
        summary: "s",
        title: "t",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/PATCH .*check-runs\/99 failed with 422/);
  });

  test("error: POST surfaces a non-2xx response", async () => {
    const { fetchImpl } = createFetch({ postStatus: 422 });

    await expect(
      upsertCheckRun({
        conclusion: "success",
        fetchImpl,
        headSha: HEAD,
        repository: "morpho-org/sdks",
        summary: "s",
        title: "t",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/POST .*check-runs failed with 422/);
  });
});

describe("publish", () => {
  test("default: publishes a success check for an approving review", async () => {
    const { fetchImpl, requests } = createFetch({ reviews: [review(9)] });
    const output: string[] = [];

    await expect(
      publish({ env, fetchImpl, writeOutput: (m) => output.push(m) }),
    ).resolves.toBe("approve");

    const post = requests.find((r) => r.init.method === "POST");
    expect(JSON.parse(post?.init.body ?? "{}").conclusion).toBe("success");
    expect(output.join("")).toContain(HEAD);
  });

  test("behavior: publishes a neutral check for a changes-requested review", async () => {
    const { fetchImpl, requests } = createFetch({
      reviews: [review(9, { approve: false, state: "CHANGES_REQUESTED" })],
    });

    await expect(publish({ env, fetchImpl })).resolves.toBe("changes");

    const post = requests.find((r) => r.init.method === "POST");
    expect(JSON.parse(post?.init.body ?? "{}").conclusion).toBe("neutral");
  });

  test("behavior: reads the verdict from the latest review this run posted", async () => {
    const { fetchImpl, requests } = createFetch({
      reviews: [review(7, { approve: false }), review(9, { approve: true })],
    });

    await expect(publish({ env, fetchImpl })).resolves.toBe("approve");
    expect(requests.some((r) => r.init.method === "POST")).toBe(true);
  });

  test("behavior: updates an existing verdict check-run on rerun", async () => {
    const { fetchImpl, requests } = createFetch({
      checkRuns: {
        check_runs: [
          { app: { slug: "github-actions" }, id: 123, name: CHECK_NAME },
        ],
      },
      reviews: [review(9)],
    });

    await expect(publish({ env, fetchImpl })).resolves.toBe("approve");

    expect(requests.filter((r) => r.init.method === "POST")).toHaveLength(0);
    const patch = requests.find((r) => r.init.method === "PATCH");
    expect(patch?.url.pathname).toBe("/repos/morpho-org/sdks/check-runs/123");
  });

  test("error: fails when this run posted no review", async () => {
    const { fetchImpl, requests } = createFetch({
      reviews: [review(9, { commitId: OLD_HEAD })],
    });

    await expect(publish({ env, fetchImpl })).rejects.toThrow(
      /No review by this run/,
    );
    expect(requests.some((r) => r.init.method === "POST")).toBe(false);
  });

  test("error: a missing environment variable is not a silent skip", async () => {
    const { fetchImpl } = createFetch({ reviews: [review(9)] });

    await expect(
      publish({ env: { ...env, HEAD_SHA: "" }, fetchImpl }),
    ).rejects.toThrow(/HEAD_SHA/);
  });

  test("error: an unwired MAX_ID_BEFORE is rejected", async () => {
    const { fetchImpl } = createFetch({ reviews: [review(9)] });

    await expect(
      publish({ env: { ...env, MAX_ID_BEFORE: "" }, fetchImpl }),
    ).rejects.toThrow(/MAX_ID_BEFORE/);
  });
});

describe("main", () => {
  test("default: dispatches publish", async () => {
    const { fetchImpl } = createFetch({ reviews: [review(9)] });

    await expect(
      main({ argv: ["publish"], env, fetchImpl, writeOutput: () => {} }),
    ).resolves.toBe("approve");
  });

  test("error: unknown mode", async () => {
    await expect(main({ argv: ["nope"], env })).rejects.toThrow(
      /Unknown mode "nope"/,
    );
  });
});

interface FetchScenario {
  readonly checkRuns?: unknown;
  readonly checkRunsStatus?: number;
  readonly patchStatus?: number;
  readonly postStatus?: number;
  readonly reviews?: readonly Review[];
}

function createFetch(scenario: FetchScenario = {}) {
  const requests: {
    init: { body?: string; headers: Record<string, string>; method: string };
    url: URL;
  }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ init, url: new URL(url) });
    const headers = new Headers();

    if (url.pathname.endsWith("/reviews")) {
      return {
        headers,
        json: async () => scenario.reviews ?? [],
        ok: true,
        status: 200,
      };
    }

    if (init.method === "GET") {
      const status = scenario.checkRunsStatus ?? 200;
      return {
        headers,
        json: async () => scenario.checkRuns ?? { check_runs: [] },
        ok: status >= 200 && status < 300,
        status,
      };
    }

    if (init.method === "POST" || init.method === "PATCH") {
      const status =
        init.method === "POST"
          ? (scenario.postStatus ?? 201)
          : (scenario.patchStatus ?? 200);
      return {
        headers,
        json: async () => ({ id: 1 }),
        ok: status >= 200 && status < 300,
        status,
      };
    }

    throw new Error(`Unexpected ${init.method} ${url.pathname}`);
  };

  return { fetchImpl, requests };
}
