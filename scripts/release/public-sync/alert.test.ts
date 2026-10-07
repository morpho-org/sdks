import { describe, expect, test } from "vitest";

import {
  findAbandonedSyncPr,
  findFailedRelease,
  findStaleSyncPr,
  formatAlert,
  resolveReleaseAlert,
  resolveStaleAlert,
  sendAlert,
} from "./alert.ts";
import { type GitHub, GitHubApiError } from "./github.ts";

function github(pulls: unknown[], committedAt: string): GitHub {
  return {
    async rest(path) {
      if (path.includes("/pulls?")) {
        expect(path).toContain("head=morpho-org:sync/main");
        return pulls;
      }
      return { committer: { date: committedAt } };
    },
    async graphql() {
      throw new Error("unused");
    },
  };
}

const pr = {
  number: 7,
  html_url: "https://github.com/morpho-org/sdks/pull/7",
  head: { sha: "a" },
};
const now = new Date("2026-10-06T12:00:00Z");

describe("findStaleSyncPr", () => {
  test("fails on an unreadable commit date instead of calling the PR fresh", async () => {
    await expect(
      findStaleSyncPr({
        github: github([pr], "not a date"),
        now,
        maxAgeMinutes: 60,
      }),
    ).rejects.toThrow('unreadable date "not a date"');
  });

  test("reports a PR past the threshold", async () => {
    await expect(
      findStaleSyncPr({
        github: github([pr], "2026-10-06T10:59:00Z"),
        now,
        maxAgeMinutes: 60,
      }),
    ).resolves.toEqual({ number: 7, url: pr.html_url, ageMinutes: 61 });
  });

  test("ignores a recent PR and no PR", async () => {
    await expect(
      findStaleSyncPr({
        github: github([pr], "2026-10-06T11:00:00Z"),
        now,
        maxAgeMinutes: 60,
      }),
    ).resolves.toBeUndefined();
    await expect(
      findStaleSyncPr({ github: github([], ""), now, maxAgeMinutes: 60 }),
    ).resolves.toBeUndefined();
  });
});

function releaseRuns(runs: unknown[]): GitHub {
  return {
    async rest(path) {
      expect(path).toBe(
        "repos/morpho-org/sdks/actions/workflows/release.yml/runs?branch=main&per_page=20",
      );
      return { workflow_runs: runs };
    },
    async graphql() {
      throw new Error("unused");
    },
  };
}

const run = {
  html_url: "https://github.com/morpho-org/sdks/actions/runs/9",
  head_sha: "b",
  status: "completed",
  conclusion: "failure",
  run_started_at: "2026-10-06T11:30:00Z",
};
const releaseWindow = { now, maxAgeMinutes: 60 };

describe("findFailedRelease", () => {
  test.each([
    "failure",
    "timed_out",
    "startup_failure",
    "cancelled",
    "skipped",
    "action_required",
  ])("reports a latest run that ended %s", async (conclusion) => {
    await expect(
      findFailedRelease(releaseRuns([{ ...run, conclusion }]), releaseWindow),
    ).resolves.toEqual({ url: run.html_url, sha: "b", conclusion });
  });

  test("ignores a successful, recently started or missing latest run", async () => {
    for (const runs of [
      [{ ...run, conclusion: "success" }],
      [{ ...run, status: "in_progress", conclusion: null }],
      [
        {
          ...run,
          status: "queued",
          conclusion: null,
          run_started_at: "2026-10-06T11:00:00Z",
        },
      ],
      [],
    ]) {
      await expect(
        findFailedRelease(releaseRuns(runs), releaseWindow),
      ).resolves.toBeUndefined();
    }
  });

  test("looks past a recent unfinished run to the older runs", async () => {
    const fresh = { ...run, status: "in_progress", conclusion: null };
    await expect(
      findFailedRelease(releaseRuns([fresh, run]), releaseWindow),
    ).resolves.toEqual({ url: run.html_url, sha: "b", conclusion: "failure" });
    await expect(
      findFailedRelease(
        releaseRuns([fresh, { ...run, conclusion: "success" }]),
        releaseWindow,
      ),
    ).resolves.toBeUndefined();
  });

  test.each(["queued", "waiting", "in_progress", "pending"])(
    "reports a latest run still %s past the threshold",
    async (status) => {
      await expect(
        findFailedRelease(
          releaseRuns([
            {
              ...run,
              status,
              conclusion: null,
              run_started_at: "2026-10-06T10:59:00Z",
            },
          ]),
          releaseWindow,
        ),
      ).resolves.toEqual({
        url: run.html_url,
        sha: "b",
        conclusion: status,
        stuckMinutes: 61,
      });
    },
  );

  test("reports nothing once a later run succeeds", async () => {
    await expect(
      findFailedRelease(
        releaseRuns([{ ...run, head_sha: "c", conclusion: "success" }, run]),
        releaseWindow,
      ),
    ).resolves.toBeUndefined();
  });

  test("reports a failure newer than the newest success", async () => {
    await expect(
      findFailedRelease(
        releaseRuns([run, { ...run, head_sha: "c", conclusion: "success" }]),
        releaseWindow,
      ),
    ).resolves.toEqual({ url: run.html_url, sha: "b", conclusion: "failure" });
  });

  test("doesn't report a rerun of an old run as stuck", async () => {
    await expect(
      findFailedRelease(
        releaseRuns([
          {
            ...run,
            status: "in_progress",
            conclusion: null,
            created_at: "2026-10-01T00:00:00Z",
          },
        ]),
        releaseWindow,
      ),
    ).resolves.toBeUndefined();
  });

  test("throws on a stuck run with an unreadable date", async () => {
    await expect(
      findFailedRelease(
        releaseRuns([
          {
            ...run,
            status: "queued",
            conclusion: null,
            run_started_at: "soon",
          },
        ]),
        releaseWindow,
      ),
    ).rejects.toThrow(/unreadable start time "soon"/);
  });
});

describe("resolveReleaseAlert", () => {
  test("returns a release-failed alert", async () => {
    await expect(
      resolveReleaseAlert({
        github: () => releaseRuns([run]),
        now,
        maxAgeMinutes: "60",
      }),
    ).resolves.toEqual({
      alert: {
        type: "release-failed",
        run: { url: run.html_url, sha: "b", conclusion: "failure" },
      },
    });
  });

  test("pages a watch-failed alert when the runs can't be read", async () => {
    const result = await resolveReleaseAlert({
      now,
      maxAgeMinutes: "60",
      github: () => {
        throw new Error("GH_TOKEN is not set.");
      },
    });
    expect(result.alert).toEqual({
      type: "watch-failed",
      reason: "GH_TOKEN is not set.",
    });
    expect(result.cause).toBeInstanceOf(Error);
  });

  test.each([["1h"], ["0"], [undefined]])(
    "pages a watch-failed alert on threshold %j",
    async (maxAgeMinutes) => {
      const result = await resolveReleaseAlert({
        github: () => releaseRuns([run]),
        now,
        maxAgeMinutes,
      });
      expect(result.alert).toEqual({
        type: "watch-failed",
        reason: expect.stringContaining(
          "MAX_AGE_MINUTES must be a positive integer",
        ),
      });
      expect(result.cause).toBeInstanceOf(Error);
    },
  );
});

describe("findAbandonedSyncPr", () => {
  function closed(pulls: unknown[]): GitHub {
    return {
      async rest(path) {
        if (path.includes("state=open")) return [];
        expect(path).toBe(
          "repos/morpho-org/sdks/pulls?state=closed&base=main&head=morpho-org:sync/main&sort=created&direction=desc&per_page=1",
        );
        return pulls;
      },
      async graphql() {
        throw new Error("unused");
      },
    };
  }

  test("reports the newest sync PR closed without merging", async () => {
    await expect(
      findAbandonedSyncPr(closed([{ ...pr, merged_at: null }])),
    ).resolves.toEqual({ number: 7, url: pr.html_url });
  });

  test("ignores a merged PR and no PR", async () => {
    await expect(
      findAbandonedSyncPr(
        closed([{ ...pr, merged_at: "2026-10-06T11:00:00Z" }]),
      ),
    ).resolves.toBeUndefined();
    await expect(findAbandonedSyncPr(closed([]))).resolves.toBeUndefined();
  });
});

describe("resolveStaleAlert", () => {
  test("returns an abandoned alert when no sync PR is open", async () => {
    await expect(
      resolveStaleAlert({
        github: () => ({
          async rest(path) {
            return path.includes("state=open")
              ? []
              : [{ ...pr, merged_at: null }];
          },
          async graphql() {
            throw new Error("unused");
          },
        }),
        now,
        maxAgeMinutes: "60",
      }),
    ).resolves.toEqual({
      alert: { type: "abandoned", pr: { number: 7, url: pr.html_url } },
    });
  });

  test("returns a stale alert past the threshold", async () => {
    await expect(
      resolveStaleAlert({
        github: () => github([pr], "2026-10-06T10:59:00Z"),
        now,
        maxAgeMinutes: "60",
      }),
    ).resolves.toEqual({
      alert: {
        type: "stale",
        pr: { number: 7, url: pr.html_url, ageMinutes: 61 },
      },
    });
  });

  test("returns no alert for a recent PR", async () => {
    await expect(
      resolveStaleAlert({
        github: () => github([pr], "2026-10-06T11:30:00Z"),
        now,
        maxAgeMinutes: "60",
      }),
    ).resolves.toEqual({});
  });

  test("ignores a closed unmerged PR while a recent sync PR is open", async () => {
    await expect(
      resolveStaleAlert({
        github: () => ({
          async rest(path) {
            if (path.includes("state=open")) return [pr];
            if (path.includes("state=closed")) {
              return [{ ...pr, number: 6, merged_at: null }];
            }
            return { committer: { date: "2026-10-06T11:30:00Z" } };
          },
          async graphql() {
            throw new Error("unused");
          },
        }),
        now,
        maxAgeMinutes: "60",
      }),
    ).resolves.toEqual({});
  });

  test("pages a watch-failed alert on an API error, keeping it as cause", async () => {
    const error = new GitHubApiError("GET pulls returned 502.", 502);
    const failing: GitHub = {
      async rest() {
        throw error;
      },
      async graphql() {
        throw new Error("unused");
      },
    };
    await expect(
      resolveStaleAlert({ github: () => failing, now, maxAgeMinutes: "60" }),
    ).resolves.toEqual({
      alert: { type: "watch-failed", reason: "GET pulls returned 502." },
      cause: error,
    });
  });

  test.each([["1h"], ["0"], [undefined]])(
    "pages a watch-failed alert on threshold %j",
    async (maxAgeMinutes) => {
      const result = await resolveStaleAlert({
        github: () => github([pr], "2026-10-06T10:59:00Z"),
        now,
        maxAgeMinutes,
      });
      expect(result.alert).toEqual({
        type: "watch-failed",
        reason: expect.stringContaining(
          "MAX_AGE_MINUTES must be a positive integer",
        ),
      });
      expect(result.cause).toBeInstanceOf(Error);
    },
  );

  test("pages when the client can't be built", async () => {
    const result = await resolveStaleAlert({
      github: () => {
        throw new Error("GH_TOKEN is not set.");
      },
      now,
      maxAgeMinutes: "60",
    });
    expect(result.alert).toEqual({
      type: "watch-failed",
      reason: "GH_TOKEN is not set.",
    });
  });
});

describe("formatAlert", () => {
  test("reports a failed watch with its reason", () => {
    expect(
      formatAlert(
        { type: "watch-failed", reason: "GET pulls returned 502." },
        { owner: "@o", runUrl: "https://run" },
      ),
    ).toBe(
      "@o Public sync watch failed, so a stuck sync PR or failed release may go unnoticed: GET pulls returned 502. Run: https://run",
    );
  });

  test("mentions the owner and links the run", () => {
    expect(
      formatAlert(
        { type: "failed", releaseSha: "abc" },
        { owner: "@oncall", runUrl: "https://run" },
      ),
    ).toBe(
      "@oncall Public sync failed for internal release abc: the public PR wasn't opened or updated. Check the run, fix, and rerun the failed jobs. Run: https://run",
    );
    expect(
      formatAlert(
        { type: "stale", pr: { number: 7, url: "u", ageMinutes: 90 } },
        { owner: "@o", runUrl: "r" },
      ),
    ).toContain("u has been open for 90 minutes");
  });
});

test("formatAlert reports a sync PR closed without merging", () => {
  expect(
    formatAlert(
      { type: "abandoned", pr: { number: 7, url: "u" } },
      { owner: "@o", runUrl: "r" },
    ),
  ).toBe(
    "@o Public sync PR u was closed without merging and no sync PR is open: its release won't reach npm until the next sync. Rerun the sync job of the latest internal release. Run: r",
  );
});

describe("formatAlert release-failed", () => {
  const where = { owner: "@o", runUrl: "r" };

  test("reports a stuck run with its status and age", () => {
    expect(
      formatAlert(
        {
          type: "release-failed",
          run: { url: "u", sha: "s", conclusion: "queued", stuckMinutes: 61 },
        },
        where,
      ),
    ).toBe(
      "@o Public release u has been queued for 61 minutes on public main s: its packages aren't on npm yet. Approve, unblock or cancel and rerun it; this alert repeats until a release run succeeds. Run: r",
    );
  });

  test("reports a completed failure with its conclusion", () => {
    expect(
      formatAlert(
        {
          type: "release-failed",
          run: { url: "u", sha: "s", conclusion: "failure" },
        },
        where,
      ),
    ).toBe(
      "@o Public release u ended failure on public main s: packages may be missing from npm, tags or GitHub Releases. Fix and rerun it; this alert repeats until a release run succeeds. Run: r",
    );
  });
});

describe("sendAlert", () => {
  const webhook = "https://hooks.example/alert";
  const answer = (status: number, body = "") =>
    (async () => new Response(body, { status })) as typeof fetch;

  test("posts the text, then still throws it", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response("ok");
    }) as typeof fetch;
    await expect(
      sendAlert({ text: "alert", webhook, fetchImpl }),
    ).rejects.toThrow(/^alert$/);
    expect(calls).toEqual([
      [
        webhook,
        expect.objectContaining({ method: "POST", body: '{"text":"alert"}' }),
      ],
    ]);
  });

  test("reports a non-2xx answer with its status and cut body, keeping the cause", async () => {
    const cause = new Error("watch");
    const error = await sendAlert({
      text: "alert",
      cause,
      webhook,
      fetchImpl: answer(503, "x".repeat(600)),
    }).catch((e: Error) => e);
    expect(error.message).toBe(
      `Alert webhook answered 503 "${"x".repeat(500)}", nobody was paged. alert`,
    );
    expect(error.cause).toBe(cause);
  });

  test("keeps the fetch error as cause when the call fails", async () => {
    const network = new TypeError("fetch failed");
    const fetchImpl = (async () => {
      throw network;
    }) as typeof fetch;
    const error = await sendAlert({ text: "alert", webhook, fetchImpl }).catch(
      (e: Error) => e,
    );
    expect(error.message).toBe(
      "Alert webhook call failed, nobody was paged. alert",
    );
    expect(error.cause).toBe(network);
  });

  test("aggregates the fetch and watch errors", async () => {
    const network = new TypeError("fetch failed");
    const cause = new Error("watch");
    const fetchImpl = (async () => {
      throw network;
    }) as typeof fetch;
    const error = await sendAlert({
      text: "alert",
      cause,
      webhook,
      fetchImpl,
    }).catch((e: Error) => e);
    expect(error.cause).toBeInstanceOf(AggregateError);
    expect((error.cause as AggregateError).errors).toEqual([network, cause]);
  });

  test("throws without calling anything when no webhook is set", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("ok");
    }) as typeof fetch;
    await expect(
      sendAlert({ text: "alert", webhook: "", fetchImpl }),
    ).rejects.toThrow(
      "alert (PUBLIC_SYNC_ALERT_WEBHOOK_URL isn't set: nobody was paged.)",
    );
    expect(called).toBe(false);
  });
});
