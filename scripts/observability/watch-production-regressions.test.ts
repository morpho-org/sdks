import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isTracked,
  listSdkPackages,
  main,
  pickSdkDependencies,
  queryBetterStack,
  resolveSdkVersions,
} from "./watch-production-regressions.ts";

const NOW_MS = Date.parse("2026-10-03T00:00:00.000Z");
const CURRENT_START_S = NOW_MS / 1000 - 86_400;
const RELEASE = "c".repeat(40);
const SDK_PACKAGES = new Set([
  "@morpho-org/morpho-sdk",
  "@morpho-org/blue-sdk",
]);
const SQL_ENV = {
  BETTERSTACK_SQL_URL: "https://eu-nbg-2-connect.betterstackdata.com",
  BETTERSTACK_SQL_USERNAME: "user",
  BETTERSTACK_SQL_PASSWORD: "secret",
};
const ENV = {
  ...SQL_ENV,
  GITHUB_TOKEN: "token",
  GITHUB_REPOSITORY: "morpho-org/sdks",
};

function outcome({
  window,
  successes,
  simulationFailures,
}: {
  window: "current" | "baseline";
  successes: number;
  simulationFailures: number;
}) {
  return JSON.stringify({
    action_type: "borrow",
    chain_id: "1",
    release: RELEASE,
    window,
    successes: String(successes),
    tx_failures: "0",
    simulation_failures: String(simulationFailures),
    bypassed_simulation_failures: "0",
    onchain_reverts: "0",
    first_seen: String(CURRENT_START_S - 86_400),
  });
}

const REGRESSED = `${outcome({ window: "baseline", successes: 990, simulationFailures: 10 })}\n${outcome({ window: "current", successes: 100, simulationFailures: 30 })}\n`;
const TITLE = "production regression: vvrm-app simulation_failure on chain 1";

function repoWithPackages(): string {
  const cwd = mkdtempSync(join(tmpdir(), "production-watch-"));
  for (const [dir, manifest] of [
    ["morpho-sdk", { name: "@morpho-org/morpho-sdk" }],
    ["internal", { name: "@morpho-org/internal", private: true }],
  ] as const) {
    const path = join(cwd, "packages", dir);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
  }
  return cwd;
}

function fakeFetch(
  handlers: Record<string, (init?: RequestInit) => Response>,
): typeof fetch & { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    calls.push({ url, init });
    const key = Object.keys(handlers).find((prefix) => url.startsWith(prefix));
    if (key == null) throw new Error(`Unexpected request ${url}`);
    return handlers[key]!(init);
  }) as typeof fetch & { calls: typeof calls };
  impl.calls = calls;
  return impl;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickSdkDependencies", () => {
  test("keeps only SDK runtime dependencies, sorted", () => {
    expect(
      pickSdkDependencies(
        {
          dependencies: {
            viem: "2.0.0",
            "@morpho-org/morpho-sdk": "6.4.0",
            "@morpho-org/blue-sdk": "7.2.0",
          },
          devDependencies: { "@morpho-org/morpho-sdk": "0.0.0" },
        },
        SDK_PACKAGES,
      ),
    ).toEqual({
      "@morpho-org/blue-sdk": "7.2.0",
      "@morpho-org/morpho-sdk": "6.4.0",
    });
    expect(pickSdkDependencies({}, SDK_PACKAGES)).toEqual({});
  });
});

describe("listSdkPackages", () => {
  test("lists public packages only", () => {
    expect([...listSdkPackages(repoWithPackages())]).toEqual([
      "@morpho-org/morpho-sdk",
    ]);
  });
});

describe("queryBetterStack", () => {
  test("fails closed without credentials", async () => {
    await expect(
      queryBetterStack("SELECT 1", { env: {}, fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(
      "BETTERSTACK_SQL_URL, BETTERSTACK_SQL_USERNAME and BETTERSTACK_SQL_PASSWORD are required.",
    );
  });

  test("posts the query with basic auth and fails on HTTP errors", async () => {
    const ok = fakeFetch({
      [SQL_ENV.BETTERSTACK_SQL_URL]: () => new Response("rows"),
    });
    await expect(
      queryBetterStack("SELECT 1", { env: SQL_ENV, fetchImpl: ok }),
    ).resolves.toBe("rows");
    expect(ok.calls[0]?.init).toMatchObject({
      method: "POST",
      body: "SELECT 1",
      headers: {
        Authorization: `Basic ${Buffer.from("user:secret").toString("base64")}`,
      },
    });

    const failing = fakeFetch({
      [SQL_ENV.BETTERSTACK_SQL_URL]: () =>
        new Response("denied", { status: 401 }),
    });
    await expect(
      queryBetterStack("SELECT 1", { env: SQL_ENV, fetchImpl: failing }),
    ).rejects.toThrow("Better Stack query failed (401).");
  });
});

describe("resolveSdkVersions", () => {
  const consumer = {
    repository: "morpho-org/morpho-apps",
    manifestPath: "apps/vvrm-app/package.json",
  };

  test("reads the manifest at the release commit", async () => {
    const fetchImpl = fakeFetch({
      "https://api.github.com/repos/morpho-org/morpho-apps/contents/": () =>
        new Response(
          JSON.stringify({
            dependencies: { "@morpho-org/morpho-sdk": "6.4.0" },
          }),
        ),
    });
    await expect(
      resolveSdkVersions(RELEASE, {
        consumer,
        sdkPackages: SDK_PACKAGES,
        token: "token",
        fetchImpl,
      }),
    ).resolves.toEqual({ packages: { "@morpho-org/morpho-sdk": "6.4.0" } });
    expect(fetchImpl.calls[0]?.url).toBe(
      `https://api.github.com/repos/morpho-org/morpho-apps/contents/apps/vvrm-app/package.json?ref=${RELEASE}`,
    );
  });

  test("reports why versions are unknown instead of guessing", async () => {
    await expect(
      resolveSdkVersions("", {
        consumer,
        sdkPackages: SDK_PACKAGES,
        token: "token",
        fetchImpl: fakeFetch({}),
      }),
    ).resolves.toEqual({ error: 'release "" is not a commit SHA' });
    await expect(
      resolveSdkVersions(RELEASE, {
        consumer,
        sdkPackages: SDK_PACKAGES,
        token: "token",
        fetchImpl: fakeFetch({
          "https://api.github.com/": () => new Response("", { status: 404 }),
        }),
      }),
    ).resolves.toEqual({ error: "GitHub contents request failed (404)" });
    await expect(
      resolveSdkVersions(RELEASE, {
        consumer,
        sdkPackages: SDK_PACKAGES,
        token: "token",
        fetchImpl: fakeFetch({
          "https://api.github.com/": () => new Response("not json"),
        }),
      }),
    ).resolves.toMatchObject({ error: expect.stringContaining("JSON") });
  });
});

describe("isTracked", () => {
  test("tracks open issues and issues closed within 48 hours", () => {
    const closed = (hoursAgo: number) => ({
      title: TITLE,
      state: "closed",
      closedAtMs: NOW_MS - hoursAgo * 3_600_000,
    });
    expect(
      isTracked(TITLE, {
        issues: [{ title: TITLE, state: "open", closedAtMs: null }],
        nowMs: NOW_MS,
      }),
    ).toBe(true);
    expect(isTracked(TITLE, { issues: [closed(47)], nowMs: NOW_MS })).toBe(
      true,
    );
    expect(isTracked(TITLE, { issues: [closed(49)], nowMs: NOW_MS })).toBe(
      false,
    );
    expect(isTracked(`${TITLE}0`, { issues: [closed(1)], nowMs: NOW_MS })).toBe(
      false,
    );
  });
});

describe("main", () => {
  function github(existing: unknown[] = []) {
    return fakeFetch({
      [SQL_ENV.BETTERSTACK_SQL_URL]: () => new Response(REGRESSED),
      "https://api.github.com/repos/morpho-org/morpho-apps/contents/": () =>
        new Response(
          JSON.stringify({
            dependencies: { "@morpho-org/morpho-sdk": "6.4.0" },
          }),
        ),
      "https://api.github.com/repos/morpho-org/sdks/issues?": () =>
        new Response(JSON.stringify(existing)),
      "https://api.github.com/repos/morpho-org/sdks/issues": () =>
        new Response("{}", { status: 201 }),
    });
  }

  test("opens one issue per new incident", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fetchImpl = github();
    await main({
      argv: [],
      cwd: repoWithPackages(),
      nowMs: NOW_MS,
      env: ENV,
      fetchImpl,
    });

    const created = fetchImpl.calls.filter(
      (call) => call.init?.method === "POST" && call.url.endsWith("/issues"),
    );
    expect(created).toHaveLength(1);
    const payload = JSON.parse(String(created[0]?.init?.body)) as {
      title: string;
      body: string;
    };
    expect(payload.title).toBe(TITLE);
    expect(payload.body).toContain("`@morpho-org/morpho-sdk@6.4.0`");
  });

  test("does not reopen a tracked incident", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fetchImpl = github([
      { title: TITLE, state: "open", closed_at: null },
    ]);
    await main({
      argv: [],
      cwd: repoWithPackages(),
      nowMs: NOW_MS,
      env: ENV,
      fetchImpl,
    });
    expect(
      fetchImpl.calls.some(
        (call) => call.init?.method === "POST" && call.url.endsWith("/issues"),
      ),
    ).toBe(false);
  });

  test("prints incidents in dry-run mode without GitHub credentials", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const input = join(repoWithPackages(), "rows.ndjson");
    writeFileSync(input, REGRESSED);
    await main({
      argv: ["--dry-run", "--input", input, "--now", "2026-10-03T00:00:00Z"],
      cwd: repoWithPackages(),
      env: {},
      fetchImpl: fakeFetch({}),
    });
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain(`## ${TITLE}`);
    expect(output).toContain(
      "SDK versions unresolved: no GitHub token to read the consumer repository",
    );
  });

  test("fails closed when the query returns no rows", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetchImpl = fakeFetch({
      [SQL_ENV.BETTERSTACK_SQL_URL]: () => new Response(""),
    });
    await expect(
      main({
        argv: [],
        cwd: repoWithPackages(),
        nowMs: NOW_MS,
        env: ENV,
        fetchImpl,
      }),
    ).rejects.toThrow("vvrm-app: no tx_outcome events in the queried windows.");
  });

  test("fails closed without GitHub credentials outside dry-run", async () => {
    await expect(
      main({ argv: [], env: SQL_ENV, fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  });

  test("rejects an invalid --now", async () => {
    await expect(main({ argv: ["--now", "later"], env: ENV })).rejects.toThrow(
      'Invalid --now "later".',
    );
  });
});
