import { describe, expect, test } from "vitest";

import { findStaleSyncPr, formatAlert, resolveStaleAlert } from "./alert.ts";
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

describe("resolveStaleAlert", () => {
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
      "@o Public sync watch failed, so a stuck sync PR may go unnoticed: GET pulls returned 502. Run: https://run",
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
