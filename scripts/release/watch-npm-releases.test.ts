import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  findMissingReleases,
  main,
  releaseIssueTitle,
  renderReleaseIssueBody,
  selectRecentVersions,
} from "./watch-npm-releases.ts";

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

function releasePackument(name: string, nowMs: number) {
  const version = "1.2.3";
  return {
    versions: {
      [version]: {
        dist: {
          integrity: "sha512-abc",
          tarball: `https://registry.npmjs.org/${name}/-/${name}-1.2.3.tgz`,
        },
      },
    },
    time: { [version]: new Date(nowMs - 60 * 60 * 1000).toISOString() },
    "dist-tags": { latest: version },
  };
}

describe("selectRecentVersions", () => {
  const nowMs = Date.parse("2026-09-29T12:00:00.000Z");
  const packument = {
    versions: {
      "1.0.0": {},
      "1.0.1": {},
      "1.0.2": {},
      "1.0.3": {},
      "1.0.5": {},
      "1.0.6": {},
    },
    time: {
      created: "2026-09-29T11:00:00.000Z",
      modified: "2026-09-29T11:59:00.000Z",
      "1.0.0": "2026-09-29T10:00:00.000Z",
      "1.0.1": "2026-09-29T11:00:00.000Z",
      "1.0.2": "2026-09-29T12:00:00.000Z",
      "1.0.3": "2026-09-29T11:30:00.000Z",
      "1.0.4": "2026-09-29T11:45:00.000Z",
      "1.0.5": "2026-09-29T12:01:00.000Z",
    },
  };

  test("includes both window boundaries and requires a matching manifest and time", () => {
    expect(
      selectRecentVersions(packument, nowMs, 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).toEqual(["1.0.1", "1.0.3", "1.0.2", "1.0.5"]);
  });

  test("ignores created and modified metadata", () => {
    expect(
      selectRecentVersions(packument, nowMs, 24 * 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).not.toContain("created");
    expect(
      selectRecentVersions(packument, nowMs, 24 * 60 * 60 * 1000).map(
        ({ version }) => version,
      ),
    ).not.toContain("modified");
  });
});

describe("release issues", () => {
  test("uses the exact release issue title", () => {
    expect(releaseIssueTitle("@morpho-org/blue-sdk", "7.1.0")).toBe(
      "npm release: @morpho-org/blue-sdk@7.1.0",
    );
  });

  test("renders all required release metadata", () => {
    const body = renderReleaseIssueBody({
      name: "@morpho-org/blue-sdk",
      version: "7.1.0",
      publishTime: "2026-09-29T12:00:00.000Z",
      distTags: ["latest"],
      integrity: "sha512-abc",
      tarball: "https://registry.npmjs.org/package.tgz",
      attestationsUrl: "https://registry.npmjs.org/attestations",
      trustedPublisherPresent: true,
    });
    expect(body).toContain("- Package: `@morpho-org/blue-sdk`");
    expect(body).toContain("- Version: `7.1.0`");
    expect(body).toContain("- Publish time: `2026-09-29T12:00:00.000Z`");
    expect(body).toContain("Dist-tags pointing to this version: `latest`");
    expect(body).toContain("- Integrity: `sha512-abc`");
    expect(body).toContain(
      "- Tarball: `https://registry.npmjs.org/package.tgz`",
    );
    expect(body).toContain(
      "- Attestations: `https://registry.npmjs.org/attestations`",
    );
    expect(body).toContain("Trusted publisher present: yes");
    expect(body).toContain("A Devin Automation verifies this release");
  });

  test("sanitizes registry values inside inline code and flags unexpected tarballs", () => {
    const body = renderReleaseIssueBody({
      name: "@morpho-org/blue-sdk",
      version: "7.1.0",
      publishTime: "2026-01-01` \n- Injected: yes",
      distTags: ["latest`", "next\n- Injected: yes"],
      integrity: "sha512-test`\n- Injected: yes",
      tarball: "https://evil.example/package.tgz`\n- Injected: yes",
      attestationsUrl: "https://registry.npmjs.org/attestations`\n",
      trustedPublisherPresent: true,
    });
    expect(body).toContain("- Publish time: `2026-01-01 - Injected: yes`");
    expect(body).toContain(
      "- Dist-tags pointing to this version: `latest, next- Injected: yes`",
    );
    expect(body).toContain("- Integrity: `sha512-test- Injected: yes`");
    expect(body).toContain(
      "- Tarball: UNEXPECTED (`https://evil.example/package.tgz- Injected: yes`)",
    );
    expect(body).toContain(
      "- Attestations: `https://registry.npmjs.org/attestations`",
    );
    expect(body).not.toContain("\n- Injected: yes");
  });

  test("deduplicates candidates by exact title", () => {
    const releases = [
      { name: "@morpho-org/blue-sdk", version: "7.1.0" },
      { name: "@morpho-org/blue-sdk", version: "7.1.1" },
    ];
    expect(
      findMissingReleases(releases, [
        "npm release: @morpho-org/blue-sdk@7.1.0",
      ]),
    ).toEqual([releases[1]]);
  });

  test("skips packages that have not been published yet", async () => {
    const name = "@morpho-org/not-published";
    const cwd = createRepository([{ directory: "not-published", name }]);
    const requests: string[] = [];
    try {
      const count = await main(["--dry-run"], {
        cwd,
        nowMs: Date.parse("2026-09-29T12:00:00.000Z"),
        env: {},
        fetchImpl: async (input) => {
          requests.push(String(input));
          return new Response("Not Found", { status: 404 });
        },
      });
      expect(count).toBe(0);
      expect(requests).toEqual([
        "https://registry.npmjs.org/@morpho-org%2fnot-published",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a missing token outside dry-run mode", async () => {
    await expect(
      main([], { env: {}, fetchImpl: async () => new Response() }),
    ).rejects.toThrow("GITHUB_TOKEN is required unless --dry-run is used.");
  });

  test("posts healthy package issues before rejecting a registry error", async () => {
    const broken = "@morpho-org/broken";
    const healthy = "@morpho-org/healthy";
    const cwd = createRepository([
      { directory: "broken", name: broken },
      { directory: "healthy", name: healthy },
    ]);
    const nowMs = Date.parse("2026-09-29T12:00:00.000Z");
    const postedTitles: string[] = [];
    try {
      await expect(
        main([], {
          cwd,
          nowMs,
          env: {
            GITHUB_TOKEN: "test-token",
            GITHUB_REPOSITORY: "morpho-org/sdks",
          },
          fetchImpl: async (input, init) => {
            const url = String(input);
            if (url.startsWith("https://registry.npmjs.org/")) {
              if (url.includes("broken")) {
                return new Response("registry unavailable", { status: 500 });
              }
              return new Response(
                JSON.stringify(releasePackument(healthy, nowMs)),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (url.endsWith("/labels")) {
              return new Response(
                JSON.stringify({ name: "npm-release-verify" }),
                {
                  status: 201,
                },
              );
            }
            if (url.includes("/issues") && init?.method === "GET") {
              return new Response("[]", { status: 200 });
            }
            if (url.endsWith("/issues") && init?.method === "POST") {
              const body = JSON.parse(String(init.body)) as { title: string };
              postedTitles.push(body.title);
              return new Response(JSON.stringify({ title: body.title }), {
                status: 201,
              });
            }
            throw new Error(`Unexpected request: ${url}`);
          },
        }),
      ).rejects.toThrow(/package operation\(s\) failed.*broken.*500/);
      expect(postedTitles).toEqual([releaseIssueTitle(healthy, "1.2.3")]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deduplicates against titles found on page two", async () => {
    const name = "@morpho-org/page-two";
    const cwd = createRepository([{ directory: "page-two", name }]);
    const nowMs = Date.parse("2026-09-29T12:00:00.000Z");
    const pagesRequested: string[] = [];
    const issuePosts: string[] = [];
    try {
      const count = await main([], {
        cwd,
        nowMs,
        env: {
          GITHUB_TOKEN: "test-token",
          GITHUB_REPOSITORY: "morpho-org/sdks",
        },
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.startsWith("https://registry.npmjs.org/")) {
            return new Response(JSON.stringify(releasePackument(name, nowMs)), {
              status: 200,
            });
          }
          if (url.endsWith("/labels")) {
            return new Response(
              JSON.stringify({ name: "npm-release-verify" }),
              {
                status: 201,
              },
            );
          }
          if (url.includes("/issues") && init?.method === "GET") {
            const page = new URL(url).searchParams.get("page") ?? "1";
            pagesRequested.push(page);
            const issues =
              page === "1"
                ? Array.from({ length: 100 }, (_, index) => ({
                    title: `existing-${index}`,
                  }))
                : [{ title: releaseIssueTitle(name, "1.2.3") }];
            return new Response(JSON.stringify(issues), { status: 200 });
          }
          if (url.endsWith("/issues") && init?.method === "POST") {
            issuePosts.push(url);
            return new Response("{}", { status: 201 });
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      });
      expect(count).toBe(1);
      expect(pagesRequested).toEqual(["1", "2"]);
      expect(issuePosts).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
