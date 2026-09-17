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
  createCheckRun,
  determineVerdict,
  latestReview,
  main,
  publish,
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
    approve ? `\n<!-- ${APPROVE_VERDICT_MARKER} -->` : ""
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

  test("behavior: a REQUEST_CHANGES review has no approve marker", () => {
    expect(
      determineVerdict(
        review(10, { approve: false, state: "CHANGES_REQUESTED" }),
      ),
    ).toBe("changes");
  });

  test("behavior: a null body is treated as changes", () => {
    expect(determineVerdict({ ...review(10), body: null })).toBe("changes");
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

describe("createCheckRun", () => {
  test("default: POSTs a completed check-run with the job token", async () => {
    const { fetchImpl, requests } = createFetch();

    await createCheckRun({
      conclusion: "success",
      fetchImpl,
      headSha: HEAD,
      repository: "morpho-org/sdks",
      summary: "all good",
      title: "✅ Approved by Claude",
      token: "ghs_test",
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.url.pathname).toBe("/repos/morpho-org/sdks/check-runs");
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

  test("error: surfaces a non-2xx response", async () => {
    const { fetchImpl } = createFetch({ postStatus: 403 });

    await expect(
      createCheckRun({
        conclusion: "success",
        fetchImpl,
        headSha: HEAD,
        repository: "morpho-org/sdks",
        summary: "s",
        title: "t",
        token: "ghs_test",
      }),
    ).rejects.toThrow(/failed with 403/);
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

    if (init.method === "POST") {
      const status = scenario.postStatus ?? 201;
      return {
        headers,
        json: async () => ({ id: 1 }),
        ok: status >= 200 && status < 300,
        status,
      };
    }

    return {
      headers,
      json: async () => scenario.reviews ?? [],
      ok: true,
      status: 200,
    };
  };

  return { fetchImpl, requests };
}
