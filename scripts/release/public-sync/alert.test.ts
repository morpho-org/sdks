import { describe, expect, test } from "vitest";

import { findStaleSyncPr, formatAlert } from "./alert.ts";
import type { GitHub } from "./github.ts";

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

describe("formatAlert", () => {
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
