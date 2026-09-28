import { describe, expect, test, vi } from "vitest";

import {
  AGENT_LOGINS,
  countedApprovers,
  evaluate,
  isBot,
  main,
  REQUIRED_HUMAN_APPROVALS,
  STATUS_CONTEXT,
} from "./bot-review-gate.ts";
import type { FetchLike } from "./claude-review-gate.ts";

const HEAD = "c462f0c49c0f35e3cb065cf2247312502d1f8062";
const OLD_HEAD = "da7cc34a1111111111111111111111111111111111";
const ENV = {
  GH_TOKEN: "ghs_test",
  GITHUB_REPOSITORY: "morpho-org/sdks",
  GITHUB_RUN_ID: "34956932196",
  GITHUB_SERVER_URL: "https://github.com",
  PR_NUMBER: "1076",
};

interface TestReview {
  readonly body: string | null;
  readonly commit_id: string | null;
  readonly id: number;
  readonly state: string;
  readonly user: { readonly login: string; readonly type?: string } | null;
}

const review = (options: {
  readonly commitId?: string | null;
  readonly login: string | null;
  readonly state: string;
  readonly type?: string;
}): TestReview => ({
  body: null,
  commit_id: options.commitId === undefined ? HEAD : options.commitId,
  id: 1,
  state: options.state,
  user:
    options.login == null
      ? null
      : {
          login: options.login,
          ...(options.type == null ? {} : { type: options.type }),
        },
});

const approved = (login: string, commitId = HEAD): TestReview =>
  review({ commitId, login, state: "APPROVED", type: "User" });

describe("isBot", () => {
  test("identifies GitHub bot accounts and known agent logins", () => {
    expect(isBot({ login: "service-account", type: "Bot" })).toBe(true);
    expect(isBot({ login: "prd-carapulse[bot]" })).toBe(true);
    expect(isBot({ login: "devin-ai-integration" })).toBe(true);
    expect(isBot({ login: "reviewer", type: "User" })).toBe(false);
    expect(AGENT_LOGINS.has("claude-code")).toBe(true);
    expect(AGENT_LOGINS.has("hermes-agent")).toBe(true);
  });
});

describe("countedApprovers", () => {
  test("counts sorted, distinct human approvals on the current head", () => {
    expect(
      countedApprovers([approved("zoe"), approved("alice"), approved("zoe")], {
        author: "devin-ai-integration",
        headSha: HEAD,
      }),
    ).toEqual(["alice", "zoe"]);
  });

  test("ignores bot approvals", () => {
    expect(
      countedApprovers(
        [
          review({
            login: "prd-carapulse[bot]",
            state: "APPROVED",
            type: "User",
          }),
          review({ login: "typed-bot", state: "APPROVED", type: "Bot" }),
        ],
        { author: "devin-ai-integration", headSha: HEAD },
      ),
    ).toEqual([]);
  });

  test("ignores approvals on an older head commit", () => {
    expect(
      countedApprovers([approved("alice", OLD_HEAD)], {
        author: "devin-ai-integration",
        headSha: HEAD,
      }),
    ).toEqual([]);
  });

  test("uses each user's latest decisive review", () => {
    expect(
      countedApprovers(
        [
          approved("alice"),
          review({ login: "alice", state: "CHANGES_REQUESTED" }),
          approved("bob"),
          review({ login: "bob", state: "DISMISSED" }),
          review({ login: "carol", state: "CHANGES_REQUESTED" }),
          approved("carol"),
        ],
        { author: "devin-ai-integration", headSha: HEAD },
      ),
    ).toEqual(["carol"]);
  });

  test("ignores comments after approval and reviews without a user", () => {
    expect(
      countedApprovers(
        [
          approved("alice"),
          review({ login: "alice", state: "COMMENTED" }),
          review({ login: null, state: "APPROVED" }),
          review({ login: "bob", state: "PENDING" }),
        ],
        { author: "devin-ai-integration", headSha: HEAD },
      ),
    ).toEqual(["alice"]);
  });

  test("does not count the pull request author's own approval", () => {
    expect(
      countedApprovers([approved("devin-ai-integration")], {
        author: "devin-ai-integration",
        headSha: HEAD,
      }),
    ).toEqual([]);
  });
});

describe("evaluate", () => {
  test("bot-authored PR needs zero, one, and then two distinct approvals", () => {
    const author = { login: "devin-ai-integration", type: "User" };
    expect(evaluate({ author, reviews: [], headSha: HEAD })).toEqual({
      description:
        "Bot-authored PR needs 2 human approvals on the head commit, has 0",
      state: "failure",
    });
    expect(
      evaluate({ author, reviews: [approved("alice")], headSha: HEAD }),
    ).toEqual({
      description:
        "Bot-authored PR needs 2 human approvals on the head commit, has 1: alice",
      state: "failure",
    });
    expect(
      evaluate({
        author,
        reviews: [approved("bob"), approved("alice")],
        headSha: HEAD,
      }),
    ).toEqual({
      description: "Bot-authored PR approved by 2 humans: alice, bob",
      state: "success",
    });
  });

  test("a repeated approval by one human counts once", () => {
    expect(
      evaluate({
        author: { login: "claude-code" },
        reviews: [approved("alice"), approved("alice")],
        headSha: HEAD,
      }),
    ).toMatchObject({ state: "failure" });
  });

  test("human-authored PRs pass without reviews", () => {
    expect(
      evaluate({
        author: { login: "alice", type: "User" },
        reviews: [],
        headSha: HEAD,
      }),
    ).toEqual({
      description: "Human-authored PR: native review rules apply.",
      state: "success",
    });
  });

  test("truncates descriptions to GitHub's 140-character limit", () => {
    const reviewers = Array.from({ length: 12 }, (_, index) =>
      approved(
        `reviewer-${index.toString().padStart(3, "0")}-${"x".repeat(30)}`,
      ),
    );
    const result = evaluate({
      author: { login: "hermes-agent" },
      reviews: reviewers,
      headSha: HEAD,
    });

    expect(result.description.length).toBeLessThanOrEqual(140);
  });
});

describe("main", () => {
  test("posts the result to the fresh pull-request head and includes the run URL", async () => {
    const reviews = [
      {
        body: "Approved",
        commit_id: HEAD,
        id: 1,
        state: "APPROVED",
        user: { login: "alice", type: "User" },
      },
      {
        body: "Approved",
        commit_id: HEAD,
        id: 2,
        state: "APPROVED",
        user: { login: "bob", type: "User" },
      },
    ];
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "devin-ai-integration",
          type: "Bot",
          sha: HEAD,
        }),
      },
      { body: reviews },
      { body: { id: 1 } },
    ]);
    const output: string[] = [];

    await expect(
      main({
        env: ENV,
        fetchImpl,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toEqual({
      description: "Bot-authored PR approved by 2 humans: alice, bob",
      state: "success",
    });

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/repos/morpho-org/sdks/pulls/1076",
      "/repos/morpho-org/sdks/pulls/1076/reviews",
      `/repos/morpho-org/sdks/statuses/${HEAD}`,
    ]);
    expect(requests[2]?.init.method).toBe("POST");
    expect(JSON.parse(requests[2]?.init.body ?? "{}")).toEqual({
      context: STATUS_CONTEXT,
      description: "Bot-authored PR approved by 2 humans: alice, bob",
      state: "success",
      target_url: "https://github.com/morpho-org/sdks/actions/runs/34956932196",
    });
    expect(output).toEqual([
      `Published ${STATUS_CONTEXT}=success for morpho-org/sdks#1076 at ${HEAD}.\n`,
    ]);
    expect(REQUIRED_HUMAN_APPROVALS).toBe(2);
  });

  test("follows Link pagination when collecting reviews", async () => {
    const firstPage = createPageResponse(
      [approved("alice")],
      `https://api.github.com/repos/morpho-org/sdks/pulls/1076/reviews?per_page=100&page=2`,
    );
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "devin-ai-integration",
          type: "Bot",
          sha: HEAD,
        }),
      },
      firstPage,
      { body: [approved("bob")] },
      { body: { id: 1 } },
    ]);

    const result = await main({
      env: ENV,
      fetchImpl,
      writeOutput: () => {},
    });

    expect(result.state).toBe("success");
    expect(requests).toHaveLength(4);
    expect(requests[2]?.url.searchParams.get("page")).toBe("2");
  });

  test("posts an error status and rethrows after an API failure", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "devin-ai-integration",
          type: "Bot",
          sha: HEAD,
        }),
      },
      { body: { message: "temporarily unavailable" }, status: 503 },
      { body: { message: "status unavailable" }, status: 500 },
    ]);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      await expect(
        main({ env: ENV, fetchImpl, writeOutput: () => {} }),
      ).rejects.toThrow(
        "GitHub API GET /repos/morpho-org/sdks/pulls/1076/reviews failed with 503.",
      );

      expect(requests[2]?.url.pathname).toBe(
        `/repos/morpho-org/sdks/statuses/${HEAD}`,
      );
      expect(JSON.parse(requests[2]?.init.body ?? "{}")).toMatchObject({
        context: STATUS_CONTEXT,
        description:
          "Bot review gate could not evaluate: GitHub API GET /repos/morpho-org/sdks/pulls/1076/reviews failed with 503.",
        state: "error",
      });
      expect(stderr).toHaveBeenCalledWith(
        `::warning::Could not publish bot-review-gate error status: GitHub API /repos/morpho-org/sdks/statuses/${HEAD} failed with 500.\n`,
      );
    } finally {
      stderr.mockRestore();
    }
  });

  test("uses the event head SHA when the pull-request fetch fails", async () => {
    const { fetchImpl, requests } = createFetch([
      { body: { message: "temporarily unavailable" }, status: 503 },
      { body: { id: 1 } },
    ]);

    await expect(
      main({
        env: { ...ENV, EVENT_HEAD_SHA: HEAD },
        fetchImpl,
        writeOutput: () => {},
      }),
    ).rejects.toThrow(
      "GitHub API /repos/morpho-org/sdks/pulls/1076 failed with 503.",
    );

    expect(requests[1]?.url.pathname).toBe(
      `/repos/morpho-org/sdks/statuses/${HEAD}`,
    );
    expect(JSON.parse(requests[1]?.init.body ?? "{}")).toMatchObject({
      context: STATUS_CONTEXT,
      state: "error",
    });
  });

  test("does not post a fallback status when the event head SHA is invalid or absent", async () => {
    for (const env of [{ ...ENV, EVENT_HEAD_SHA: "not-a-sha" }, ENV]) {
      const { fetchImpl, requests } = createFetch([
        { body: { message: "temporarily unavailable" }, status: 503 },
      ]);

      await expect(
        main({ env, fetchImpl, writeOutput: () => {} }),
      ).rejects.toThrow(
        "GitHub API /repos/morpho-org/sdks/pulls/1076 failed with 503.",
      );
      expect(requests).toHaveLength(1);
    }
  });

  test("posts an error status after a verdict status fails", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "devin-ai-integration",
          type: "Bot",
          sha: HEAD,
        }),
      },
      { body: [] },
      { body: { message: "status unavailable" }, status: 500 },
      { body: { id: 1 } },
    ]);

    await expect(
      main({ env: ENV, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(
      `GitHub API /repos/morpho-org/sdks/statuses/${HEAD} failed with 500.`,
    );

    expect(requests[2]?.url.pathname).toBe(
      `/repos/morpho-org/sdks/statuses/${HEAD}`,
    );
    expect(requests[3]?.url.pathname).toBe(
      `/repos/morpho-org/sdks/statuses/${HEAD}`,
    );
    expect(JSON.parse(requests[2]?.init.body ?? "{}")).toMatchObject({
      context: STATUS_CONTEXT,
      state: "failure",
    });
    expect(JSON.parse(requests[3]?.init.body ?? "{}")).toMatchObject({
      context: STATUS_CONTEXT,
      state: "error",
    });
  });

  test("posts an error status and rethrows for malformed API payloads", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: { head: { sha: HEAD }, user: { login: "devin-ai-integration" } },
      },
      { body: { id: 1 } },
    ]);

    await expect(
      main({ env: ENV, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(/malformed pull request/);
    expect(JSON.parse(requests[1]?.init.body ?? "{}")).toMatchObject({
      state: "error",
      context: STATUS_CONTEXT,
    });
  });

  test("rejects malformed review entries, including a non-string user type", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "devin-ai-integration",
          type: "Bot",
          sha: HEAD,
        }),
      },
      {
        body: [
          {
            body: "Approved",
            commit_id: HEAD,
            id: 1,
            state: "APPROVED",
            user: { login: "alice", type: 1 },
          },
        ],
      },
      { body: { id: 1 } },
    ]);

    await expect(
      main({ env: ENV, fetchImpl, writeOutput: () => {} }),
    ).rejects.toThrow(/malformed review entry/);
    expect(JSON.parse(requests[2]?.init.body ?? "{}")).toMatchObject({
      state: "error",
      context: STATUS_CONTEXT,
    });
  });

  test("rejects a traversal PR number before fetching", async () => {
    const { fetchImpl, requests } = createFetch([]);

    await expect(
      main({
        env: { ...ENV, PR_NUMBER: "1/../2" },
        fetchImpl,
      }),
    ).rejects.toThrow(/Invalid PR_NUMBER/);
    expect(requests).toHaveLength(0);
  });

  test("reads and trims the PR number file when PR_NUMBER is empty", async () => {
    const { fetchImpl, requests } = createFetch([
      {
        body: pullRequest({
          login: "alice",
          type: "User",
          sha: HEAD,
        }),
      },
      { body: [] },
      { body: { id: 1 } },
    ]);
    const prNumberFile = "/runner/temp/pr-number";
    const readFiles: string[] = [];

    await main({
      env: { ...ENV, PR_NUMBER: "", PR_NUMBER_FILE: prNumberFile },
      fetchImpl,
      readFile: async (path) => {
        readFiles.push(path);
        return "42\n";
      },
      writeOutput: () => {},
    });

    expect(readFiles).toEqual([prNumberFile]);
    expect(requests[0]?.url.pathname).toBe("/repos/morpho-org/sdks/pulls/42");
  });

  test("rejects an invalid PR number file before fetching", async () => {
    const { fetchImpl, requests } = createFetch([]);

    await expect(
      main({
        env: {
          ...ENV,
          PR_NUMBER: "",
          PR_NUMBER_FILE: "/runner/temp/pr-number",
        },
        fetchImpl,
        readFile: async () => "abc",
      }),
    ).rejects.toThrow(/Invalid PR_NUMBER/);
    expect(requests).toHaveLength(0);
  });

  test("requires PR_NUMBER or PR_NUMBER_FILE", async () => {
    const { fetchImpl, requests } = createFetch([]);

    await expect(
      main({
        env: { ...ENV, PR_NUMBER: undefined, PR_NUMBER_FILE: undefined },
        fetchImpl,
      }),
    ).rejects.toThrow(
      /Missing required environment variable PR_NUMBER or PR_NUMBER_FILE/,
    );
    expect(requests).toHaveLength(0);
  });

  test("rejects when a required environment variable is missing", async () => {
    const { fetchImpl, requests } = createFetch([]);

    await expect(
      main({
        env: { ...ENV, GITHUB_RUN_ID: undefined },
        fetchImpl,
      }),
    ).rejects.toThrow(/Missing required environment variable GITHUB_RUN_ID/);
    expect(requests).toHaveLength(0);
  });
});

function pullRequest(options: {
  readonly login: string;
  readonly type: string;
  readonly sha: string;
}) {
  return {
    head: { sha: options.sha },
    user: { login: options.login, type: options.type },
  };
}

interface FakeResponse {
  readonly body: unknown;
  readonly link?: string;
  readonly status?: number;
}

function createPageResponse(body: unknown, nextUrl: string): FakeResponse {
  return {
    body,
    link: `<${nextUrl}>; rel="next"`,
  };
}

function createFetch(pages: readonly FakeResponse[]) {
  const requests: {
    readonly init: Parameters<FetchLike>[1] & { body?: string };
    readonly url: URL;
  }[] = [];
  const fetchImpl = async (
    url: URL,
    init: Parameters<FetchLike>[1] & { body?: string },
  ) => {
    requests.push({ init, url: new URL(url) });
    const page = pages[requests.length - 1];
    if (page == null) throw new Error("Unexpected extra request");

    const status = page.status ?? 200;
    const headers = new Headers();
    if (page.link != null) headers.set("link", page.link);

    return {
      headers,
      json: async () => page.body,
      ok: status >= 200 && status < 300,
      status,
    };
  };

  return { fetchImpl, requests };
}
