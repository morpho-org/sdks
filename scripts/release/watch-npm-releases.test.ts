import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import {
  main,
  releaseIssueTitle,
  selectRecentVersions,
} from "./watch-npm-releases.ts";

const NOW_MS = Date.parse("2026-09-29T12:00:00.000Z");
const ENV = {
  GITHUB_TOKEN: "test-token",
  GITHUB_REPOSITORY: "morpho-org/sdks",
};
const ISSUE_BODY =
  "Opened by npm-release-watch (SDK-1264). A Devin Automation verifies this release and comments here.\n\nhttps://www.npmjs.com/package/@morpho-org/blue-sdk/v/1.2.3";

function createRepository(
  packages: { directory: string; name: string }[],
): string {
  const cwd = mkdtempSync(join(tmpdir(), "npm-release-watch-test-"));
  for (const { directory, name } of packages) {
    const packageDirectory = join(cwd, "packages", directory);
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "package.json"),
      JSON.stringify({ name, private: false }),
    );
  }
  return cwd;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function releasePackument(
  nowMs: number,
  versions: string[] = ["1.2.3"],
): {
  versions: Record<string, object>;
  time: Record<string, string>;
} {
  return {
    versions: Object.fromEntries(versions.map((version) => [version, {}])),
    time: Object.fromEntries(
      versions.map((version, index) => [
        version,
        new Date(nowMs - (versions.length - index) * 1_000).toISOString(),
      ]),
    ),
  };
}

describe("selectRecentVersions", () => {
  test("includes the lower boundary and sorts by publish time", () => {
    const lowerBound = NOW_MS - 48 * 60 * 60 * 1000;
    expect(
      selectRecentVersions(
        {
          versions: {
            "1.0.0": {},
            "1.0.1": {},
            "1.0.3": {},
          },
          time: {
            created: new Date(lowerBound).toISOString(),
            modified: new Date(lowerBound + 1).toISOString(),
            "1.0.0": new Date(lowerBound + 60_000).toISOString(),
            "1.0.1": new Date(lowerBound - 1).toISOString(),
            "1.0.3": new Date(lowerBound).toISOString(),
            "missing-manifest": new Date(lowerBound + 120_000).toISOString(),
          },
        },
        NOW_MS,
      ),
    ).toEqual(["1.0.3", "1.0.0"]);
  });

  test.each([
    ["missing", {}],
    ["unparsable", { "1.0.0": "not-a-date" }],
  ])("throws for a %s publish time", (_case, time) => {
    expect(() =>
      selectRecentVersions({ versions: { "1.0.0": {} }, time }, NOW_MS),
    ).toThrow("Missing or unparsable publish time for 1.0.0.");
  });

  test("requires plain time and versions objects", () => {
    expect(() =>
      selectRecentVersions({ versions: { "1.0.0": {} } }, NOW_MS),
    ).toThrow("plain objects");
    expect(() =>
      selectRecentVersions(
        {
          versions: {},
          time: [] as unknown as Record<string, string>,
        },
        NOW_MS,
      ),
    ).toThrow("plain objects");
    expect(() =>
      selectRecentVersions(
        {
          versions: [] as unknown as Record<string, unknown>,
          time: {},
        },
        NOW_MS,
      ),
    ).toThrow("plain objects");
  });
});

describe("release issues", () => {
  test("uses the exact release issue title", () => {
    expect(releaseIssueTitle("@morpho-org/blue-sdk", "7.1.0")).toBe(
      "npm release: @morpho-org/blue-sdk@7.1.0",
    );
  });

  test("creates an issue per unseen release with only the fixed title and body", async () => {
    const name = "@morpho-org/blue-sdk";
    const cwd = createRepository([{ directory: "blue-sdk", name }]);
    const requests: { url: string; init?: RequestInit }[] = [];
    try {
      await main({
        cwd,
        nowMs: NOW_MS,
        env: ENV,
        fetchImpl: async (input, init) => {
          const url = String(input);
          requests.push({ url, init });
          if (url.startsWith("https://registry.npmjs.org/")) {
            return url.endsWith(name.replaceAll("/", "%2f"))
              ? jsonResponse(releasePackument(NOW_MS, ["1.2.3", "2.0.0"]))
              : new Response("Not Found", { status: 404 });
          }
          if (init?.method === "POST") return jsonResponse({ number: 1 }, 201);
          return jsonResponse([]);
        },
      });
      const posts = requests.filter(({ init }) => init?.method === "POST");
      expect(posts).toHaveLength(2);
      expect(posts.map(({ init }) => JSON.parse(String(init?.body)))).toEqual([
        {
          title: "npm release: @morpho-org/blue-sdk@1.2.3",
          body: ISSUE_BODY,
        },
        {
          title: "npm release: @morpho-org/blue-sdk@2.0.0",
          body: ISSUE_BODY.replaceAll("1.2.3", "2.0.0"),
        },
      ]);
      expect(requests.every(({ init }) => init?.redirect === "error")).toBe(
        true,
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("watches retired packages absent from the workspace", async () => {
    const retired = "@morpho-org/bundler-sdk-viem";
    const workspacePackage = "@morpho-org/workspace-only";
    const cwd = createRepository([
      { directory: "workspace-only", name: workspacePackage },
    ]);
    const retiredUrlSuffix = retired.replaceAll("/", "%2f");
    const registryUrls: string[] = [];
    const createdTitles: string[] = [];
    try {
      await main({
        cwd,
        nowMs: NOW_MS,
        env: ENV,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.startsWith("https://registry.npmjs.org/")) {
            registryUrls.push(url);
            return url.endsWith(retiredUrlSuffix)
              ? jsonResponse(releasePackument(NOW_MS))
              : new Response("Not Found", { status: 404 });
          }
          if (init?.method === "POST") {
            createdTitles.push(JSON.parse(String(init.body)).title as string);
            return jsonResponse({ number: 2 }, 201);
          }
          return jsonResponse([]);
        },
      });
      expect(
        registryUrls.filter((url) => url.endsWith(retiredUrlSuffix)),
      ).toHaveLength(1);
      expect(createdTitles).toEqual([releaseIssueTitle(retired, "1.2.3")]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deduplicates page-two issues and ignores pull requests", async () => {
    const name = "@morpho-org/blue-sdk";
    const cwd = createRepository([{ directory: "blue-sdk", name }]);
    const listUrls: URL[] = [];
    const createdTitles: string[] = [];
    const firstPage = [
      {
        title: releaseIssueTitle(name, "1.2.3"),
        pull_request: { url: "https://api.github.com/pulls/1" },
      },
      ...Array.from({ length: 99 }, (_, index) => ({
        title: `other-${index}`,
      })),
    ];
    try {
      await main({
        cwd,
        nowMs: NOW_MS,
        env: ENV,
        fetchImpl: async (input, init) => {
          const url = new URL(String(input));
          if (url.origin === "https://registry.npmjs.org") {
            return url.pathname.endsWith(name.replaceAll("/", "%2f"))
              ? jsonResponse(releasePackument(NOW_MS, ["1.2.3", "2.0.0"]))
              : new Response("Not Found", { status: 404 });
          }
          if (init?.method === "POST") {
            createdTitles.push(JSON.parse(String(init.body)).title as string);
            return jsonResponse({ number: 2 }, 201);
          }
          listUrls.push(url);
          return jsonResponse(
            url.searchParams.get("page") === "1"
              ? firstPage
              : [{ title: releaseIssueTitle(name, "2.0.0") }],
          );
        },
      });
      expect(listUrls).toHaveLength(2);
      expect(listUrls.map((url) => url.searchParams.get("page"))).toEqual([
        "1",
        "2",
      ]);
      for (const url of listUrls) {
        expect(url.searchParams.get("creator")).toBe("github-actions[bot]");
        expect(url.searchParams.get("state")).toBe("all");
      }
      expect(createdTitles).toEqual([releaseIssueTitle(name, "1.2.3")]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips registry 404s and logs that the package is not published", async () => {
    const name = "@morpho-org/not-published";
    const cwd = createRepository([{ directory: "not-published", name }]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await main({
        cwd,
        nowMs: NOW_MS,
        env: ENV,
        fetchImpl: async () => new Response("Not Found", { status: 404 }),
      });
      expect(
        stdout.mock.calls.map(([chunk]) => String(chunk)).join(""),
      ).toContain(`Skipping ${name}: not published yet.`);
    } finally {
      stdout.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("posts healthy releases before rejecting a registry failure", async () => {
    const broken = "@morpho-org/broken";
    const healthy = "@morpho-org/healthy";
    const cwd = createRepository([
      { directory: "broken", name: broken },
      { directory: "healthy", name: healthy },
    ]);
    const createdTitles: string[] = [];
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input, init) => {
            const url = String(input);
            if (url.startsWith("https://registry.npmjs.org/")) {
              if (url.endsWith(broken.replaceAll("/", "%2f"))) {
                return new Response("unavailable", { status: 500 });
              }
              return url.endsWith(healthy.replaceAll("/", "%2f"))
                ? jsonResponse(releasePackument(NOW_MS))
                : new Response("Not Found", { status: 404 });
            }
            if (init?.method === "POST") {
              createdTitles.push(JSON.parse(String(init.body)).title as string);
              return jsonResponse({ number: 3 }, 201);
            }
            return jsonResponse([]);
          },
        }),
      ).rejects.toThrow(broken);
      expect(createdTitles).toEqual([releaseIssueTitle(healthy, "1.2.3")]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates healthy issues after collecting a missing publish-time error", async () => {
    const missingTime = "@morpho-org/missing-time";
    const healthy = "@morpho-org/healthy";
    const cwd = createRepository([
      { directory: "missing-time", name: missingTime },
      { directory: "healthy", name: healthy },
    ]);
    const createdTitles: string[] = [];
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input, init) => {
            const url = String(input);
            if (url.startsWith("https://registry.npmjs.org/")) {
              if (url.endsWith(missingTime.replaceAll("/", "%2f"))) {
                return jsonResponse({ versions: { "1.0.0": {} }, time: {} });
              }
              return url.endsWith(healthy.replaceAll("/", "%2f"))
                ? jsonResponse(releasePackument(NOW_MS))
                : new Response("Not Found", { status: 404 });
            }
            if (init?.method === "POST") {
              createdTitles.push(JSON.parse(String(init.body)).title as string);
              return jsonResponse({ number: 3 }, 201);
            }
            return jsonResponse([]);
          },
        }),
      ).rejects.toThrow("Missing or unparsable publish time for 1.0.0.");
      expect(createdTitles).toEqual([releaseIssueTitle(healthy, "1.2.3")]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects issue-list failure without attempting issue creation", async () => {
    const name = "@morpho-org/blue-sdk";
    const cwd = createRepository([{ directory: "blue-sdk", name }]);
    let postCount = 0;
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input, init) => {
            if (init?.method === "POST") {
              postCount += 1;
              return jsonResponse({ number: 4 }, 201);
            }
            if (String(input).startsWith("https://registry.npmjs.org/")) {
              return String(input).endsWith(name.replaceAll("/", "%2f"))
                ? jsonResponse(releasePackument(NOW_MS))
                : new Response("Not Found", { status: 404 });
            }
            return new Response("Unavailable", { status: 500 });
          },
        }),
      ).rejects.toThrow("GitHub issue listing failed (500)");
      expect(postCount).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("collects invalid registry JSON", async () => {
    const name = "@morpho-org/invalid-json";
    const cwd = createRepository([{ directory: "invalid-json", name }]);
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input) =>
            String(input).endsWith(name.replaceAll("/", "%2f"))
              ? new Response("{", { status: 200 })
              : new Response("Not Found", { status: 404 }),
        }),
      ).rejects.toThrow(name);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects invalid release versions without creating issues", async () => {
    const name = "@morpho-org/blue-sdk";
    const cwd = createRepository([{ directory: "blue-sdk", name }]);
    let postCount = 0;
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input, init) => {
            if (init?.method === "POST") postCount += 1;
            if (init?.method === "POST")
              return jsonResponse({ number: 4 }, 201);
            if (String(input).startsWith("https://registry.npmjs.org/")) {
              return String(input).endsWith(name.replaceAll("/", "%2f"))
                ? jsonResponse(releasePackument(NOW_MS, ["1.0.0 @here"]))
                : new Response("Not Found", { status: 404 });
            }
            return jsonResponse([]);
          },
        }),
      ).rejects.toThrow(`${name}@1.0.0 @here`);
      expect(postCount).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("continues after a failed issue creation and rejects with its status", async () => {
    const name = "@morpho-org/blue-sdk";
    const cwd = createRepository([{ directory: "blue-sdk", name }]);
    const attemptedTitles: string[] = [];
    try {
      await expect(
        main({
          cwd,
          nowMs: NOW_MS,
          env: ENV,
          fetchImpl: async (input, init) => {
            if (init?.method !== "POST") {
              const url = String(input);
              if (url.startsWith("https://registry.npmjs.org/")) {
                return url.endsWith(name.replaceAll("/", "%2f"))
                  ? jsonResponse(releasePackument(NOW_MS, ["1.2.3", "2.0.0"]))
                  : new Response("Not Found", { status: 404 });
              }
              return jsonResponse([]);
            }
            const title = JSON.parse(String(init.body)).title as string;
            attemptedTitles.push(title);
            return title.endsWith("1.2.3")
              ? new Response("response body must not be reported", {
                  status: 500,
                })
              : jsonResponse({ number: 5 }, 201);
          },
        }),
      ).rejects.toThrow("GitHub issue creation failed (500)");
      expect(attemptedTitles).toEqual([
        releaseIssueTitle(name, "1.2.3"),
        releaseIssueTitle(name, "2.0.0"),
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("requires token and repository before making any fetch", async () => {
    let fetchCount = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse([]);
    };
    await expect(main({ env: {}, fetchImpl })).rejects.toThrow(
      "GITHUB_TOKEN is required",
    );
    await expect(
      main({ env: { GITHUB_TOKEN: "test-token" }, fetchImpl }),
    ).rejects.toThrow("GITHUB_REPOSITORY is required");
    expect(fetchCount).toBe(0);
  });
});
