import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  type BumpEvent,
  branchSlug,
  buildBumpEvent,
  collectNpmDependencies,
  dispatch,
  type FetchLike,
  fetchAllPages,
  isDuplicate,
  main,
  mergeBumpEvents,
  parseActionPins,
  readMinimumReleaseAgeMinutes,
  selectActionTarget,
  selectNpmTarget,
} from "./dependency-discovery.ts";

const NOW = new Date("2026-01-10T00:00:00Z");
const OLD = "2025-12-01T00:00:00Z";
const YOUNG = "2026-01-09T00:00:00Z"; // <4320 minutes before NOW
const MIN_AGE = 4320; // 3 days

describe("readMinimumReleaseAgeMinutes", () => {
  test("default", () => {
    expect(
      readMinimumReleaseAgeMinutes(
        "packages:\n  - packages/*\nminimumReleaseAge: 4320\n",
      ),
    ).toBe(4320);
  });

  test("behavior: defaults to 0 when absent", () => {
    expect(readMinimumReleaseAgeMinutes("packages:\n  - packages/*\n")).toBe(0);
  });

  test("behavior: accepts a trailing comment", () => {
    expect(
      readMinimumReleaseAgeMinutes("minimumReleaseAge: 4320 # 3 days"),
    ).toBe(4320);
  });

  test("error: throws on an unparseable value", () => {
    expect(() =>
      readMinimumReleaseAgeMinutes("minimumReleaseAge: abc"),
    ).toThrowError("Unparseable minimumReleaseAge in pnpm-workspace.yaml");
  });

  test("behavior: accepts a quoted value", () => {
    expect(readMinimumReleaseAgeMinutes('minimumReleaseAge: "4320"')).toBe(
      4320,
    );
  });

  test("error: throws on zero", () => {
    expect(() =>
      readMinimumReleaseAgeMinutes("minimumReleaseAge: 0"),
    ).toThrowError("Unparseable minimumReleaseAge in pnpm-workspace.yaml");
  });
});

describe("collectNpmDependencies", () => {
  test("default", () => {
    const deps = collectNpmDependencies(
      [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { viem: "^2.0.0" },
            devDependencies: { typescript: "catalog:" },
          }),
        },
        {
          path: "packages/foo/package.json",
          content: JSON.stringify({
            dependencies: { viem: "^2.0.0" },
            peerDependencies: { "@scope/pkg": "^1.0.0" },
            optionalDependencies: { local: "workspace:*" },
          }),
        },
      ],
      "packages:\n  - packages/*\n",
    );

    expect(deps.get("viem@^2.0.0")?.targets).toEqual([
      "package.json",
      "packages/foo/package.json",
    ]);
    expect(deps.has("@scope/pkg@^1.0.0")).toBe(false);
    expect([...deps.keys()]).not.toContain("typescript@catalog:");
    expect([...deps.keys()]).not.toContain("local@workspace:*");
  });

  test("behavior: skips peerDependencies entirely", () => {
    const deps = collectNpmDependencies(
      [
        {
          path: "packages/foo/package.json",
          content: JSON.stringify({
            peerDependencies: { viem: "^2.0.0" },
            dependencies: { graphql: "^16.0.0" },
          }),
        },
      ],
      "",
    );

    expect(deps.has("viem@^2.0.0")).toBe(false);
    expect(deps.has("graphql@^16.0.0")).toBe(true);
  });

  test("behavior: keeps different specs as separate entries", () => {
    const deps = collectNpmDependencies(
      [
        {
          path: "package.json",
          content: JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
        },
        {
          path: "packages/a/package.json",
          content: JSON.stringify({ dependencies: { vitest: "^3.0.0" } }),
        },
      ],
      "",
    );

    expect(deps.has("vitest@^4.0.0")).toBe(true);
    expect(deps.has("vitest@^3.0.0")).toBe(true);
  });

  test("behavior: skips link, file, git and url specs", () => {
    const deps = collectNpmDependencies(
      [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: {
              a: "link:../a",
              b: "file:./b.tgz",
              c: "git+https://example.com/c.git",
              d: "https://example.com/d.tgz",
              e: "npm:lodash@^4.0.0",
            },
          }),
        },
      ],
      "",
    );

    expect(deps.size).toBe(0);
  });

  test("behavior: includes catalog and overrides entries targeting pnpm-workspace.yaml", () => {
    const deps = collectNpmDependencies(
      [],
      [
        "catalog:",
        "  typescript: 7.0.2",
        "  vitest: ^4.1.11",
        "overrides:",
        "  axios: 1.18.1",
        "minimumReleaseAge: 4320",
      ].join("\n"),
    );

    expect(deps.get("typescript@7.0.2")?.targets).toEqual([
      "pnpm-workspace.yaml",
    ]);
    expect(deps.get("axios@1.18.1")?.targets).toEqual(["pnpm-workspace.yaml"]);
  });
});

describe("selectNpmTarget", () => {
  const versions = {
    "1.0.0": "2024-01-01T00:00:00Z",
    "1.5.0": OLD,
    "1.6.0-beta.1": OLD,
    "1.6.0": YOUNG,
    "2.0.0": OLD,
  };

  test("default", () => {
    expect(
      selectNpmTarget("^1.0.0", {
        versions,
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toEqual({
      to: "2.0.0",
      publishDate: OLD,
    });
  });

  test("behavior: allows majors", () => {
    const result = selectNpmTarget("^1.0.0", {
      versions,
      now: NOW,
      minAgeMinutes: MIN_AGE,
    });
    expect(result?.to).toBe("2.0.0");
  });

  test("behavior: skips prereleases", () => {
    const result = selectNpmTarget("^1.0.0", {
      versions: { "1.5.0": OLD, "1.6.0-beta.1": OLD },
      now: NOW,
      minAgeMinutes: MIN_AGE,
    });
    expect(result?.to).toBe("1.5.0");
  });

  test("behavior: skips versions younger than the minimum release age", () => {
    expect(
      selectNpmTarget("^1.0.0", {
        versions: { "1.5.0": OLD, "2.0.0": YOUNG },
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toEqual({ to: "1.5.0", publishDate: OLD });
  });

  test("behavior: returns null when already up to date", () => {
    expect(
      selectNpmTarget("^2.0.0", {
        versions: { "2.0.0": OLD },
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toBeNull();
  });

  test("behavior: returns null for an unparseable spec", () => {
    expect(
      selectNpmTarget("not-a-range", {
        versions,
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toBeNull();
  });
});

describe("parseActionPins", () => {
  test("default", () => {
    const pins = parseActionPins([
      {
        path: ".github/workflows/lint.yml",
        content: [
          "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
          "      - uses: ./local/action",
          "      - uses: docker://alpine:3",
          "      - uses: actions/checkout@v7 # not pinned",
        ].join("\n"),
      },
    ]);

    const pin = pins.get("actions/checkout");
    expect(pin?.sha).toBe("3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(pin?.version).toBe("v7.0.1");
    expect(pin?.targets).toEqual([".github/workflows/lint.yml"]);
    expect(pins.size).toBe(1);
  });

  test("behavior: parses major-only version comments", () => {
    const pins = parseActionPins([
      {
        path: ".github/workflows/claude.yml",
        content:
          "uses: anthropics/claude-code-action@5ef2e550a465a721f4f45e4a7d3c340c873e1dcc # v1",
      },
    ]);

    expect(pins.get("anthropics/claude-code-action")?.version).toBe("v1");
  });

  test("behavior: highest version wins regardless of file order", () => {
    const pin = ({
      name,
      sha,
      version,
    }: {
      name: string;
      sha: string;
      version: string;
    }) => ({
      path: `.github/workflows/${name}.yml`,
      content: `uses: actions/setup-node@${sha} # ${version}`,
    });
    const sha410 = "a".repeat(40);
    const sha420 = "b".repeat(40);
    for (const files of [
      [
        pin({ name: "a", sha: sha410, version: "v4.1.0" }),
        pin({ name: "b", sha: sha420, version: "v4.2.0" }),
      ],
      [
        pin({ name: "a", sha: sha420, version: "v4.2.0" }),
        pin({ name: "b", sha: sha410, version: "v4.1.0" }),
      ],
    ]) {
      const parsed = parseActionPins(files);
      expect(parsed.get("actions/setup-node")?.sha).toBe(sha420);
      expect(parsed.get("actions/setup-node")?.version).toBe("v4.2.0");
    }

    const mixed = parseActionPins([
      pin({ name: "a", sha: "c".repeat(40), version: "v1" }),
      pin({ name: "b", sha: sha420, version: "v7.0.1" }),
    ]);
    expect(mixed.get("actions/setup-node")?.version).toBe("v7.0.1");

    const sha9 = "e".repeat(40);
    for (const files of [
      [
        pin({ name: "a", sha: sha9, version: "v9" }),
        pin({ name: "b", sha: sha420, version: "v7.0.1" }),
      ],
      [
        pin({ name: "a", sha: sha420, version: "v7.0.1" }),
        pin({ name: "b", sha: sha9, version: "v9" }),
      ],
    ]) {
      const parsed = parseActionPins(files);
      expect(parsed.get("actions/setup-node")?.version).toBe("v9");
      expect(parsed.get("actions/setup-node")?.sha).toBe(sha9);
    }
  });

  test("behavior: accumulates targets across workflows", () => {
    const pin = (name: string) => ({
      path: `.github/workflows/${name}.yml`,
      content:
        "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    });
    const pins = parseActionPins([pin("a"), pin("b")]);
    expect(pins.get("actions/checkout")?.targets).toEqual([
      ".github/workflows/a.yml",
      ".github/workflows/b.yml",
    ]);
  });
});

describe("selectActionTarget", () => {
  const releases = [
    { tag: "v7.0.1", publishedAt: YOUNG, prerelease: false },
    { tag: "v7.0.0", publishedAt: OLD, prerelease: false },
    { tag: "v8.0.0-rc.1", publishedAt: OLD, prerelease: true },
    { tag: "not-semver", publishedAt: OLD, prerelease: false },
  ];

  test("default", () => {
    expect(
      selectActionTarget("v6.0.0", {
        releases,
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toEqual({
      to: "v7.0.0",
      publishDate: OLD,
    });
  });

  test("behavior: returns null when up to date", () => {
    expect(
      selectActionTarget("v7.0.1", {
        releases: [{ tag: "v7.0.1", publishedAt: OLD, prerelease: false }],
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toBeNull();
  });

  test("behavior: rejects SemVer prerelease tags even when not flagged", () => {
    expect(
      selectActionTarget("v6.0.0", {
        releases: [{ tag: "v8.0.0-rc.1", publishedAt: OLD, prerelease: false }],
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toBeNull();
  });

  test("behavior: major-only pin only selects a higher major", () => {
    const options = {
      now: NOW,
      minAgeMinutes: MIN_AGE,
    };
    expect(
      selectActionTarget("v1", {
        releases: [{ tag: "v1.2.0", publishedAt: OLD, prerelease: false }],
        ...options,
      }),
    ).toBeNull();
    expect(
      selectActionTarget("v1", {
        releases: [
          { tag: "v1.2.0", publishedAt: OLD, prerelease: false },
          { tag: "v2.0.0", publishedAt: OLD, prerelease: false },
        ],
        ...options,
      }),
    ).toEqual({ to: "v2.0.0", publishDate: OLD });
  });

  test("behavior: two-component pin compares like a version", () => {
    expect(
      selectActionTarget("v4.1", {
        releases: [
          { tag: "v4.1.0", publishedAt: OLD, prerelease: false },
          { tag: "v4.2.0", publishedAt: OLD, prerelease: false },
        ],
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toEqual({ to: "v4.2.0", publishDate: OLD });
  });

  test("behavior: returns null for a non-semver current pin", () => {
    expect(
      selectActionTarget("latest", {
        releases,
        now: NOW,
        minAgeMinutes: MIN_AGE,
      }),
    ).toBeNull();
  });
});

describe("isDuplicate", () => {
  const event = buildBumpEvent({
    ecosystem: "npm",
    package: "@morpho-org/blue-sdk",
    from: "6.0.0",
    to: "7.0.0",
    publishDate: OLD,
    targets: ["package.json"],
  });

  test("default", () => {
    expect(isDuplicate(event, { openPrTitles: [], branches: [] })).toBe(false);
  });

  test("behavior: matches a bump PR title case-insensitively", () => {
    expect(
      isDuplicate(event, {
        openPrTitles: ["Bump @morpho-org/blue-sdk from 6.0.0 to 7.0.0"],
        branches: [],
      }),
    ).toBe(true);
  });

  test("behavior: matches a devin bump branch", () => {
    expect(
      isDuplicate(event, {
        openPrTitles: [],
        branches: ["devin/1770000000-bump--morpho-org-blue-sdk-7.0.0"],
      }),
    ).toBe(true);
  });

  test("behavior: does not match a package name inside a longer name", () => {
    expect(
      isDuplicate(
        buildBumpEvent({
          ecosystem: "npm",
          package: "viem",
          from: "2.0.0",
          to: "2.1.0",
          publishDate: OLD,
          targets: ["package.json"],
        }),
        {
          openPrTitles: [
            "chore(deps): bump @morpho-org/blue-sdk-viem from 2.0.0 to 2.1.0",
          ],
          branches: [],
        },
      ),
    ).toBe(false);
  });

  test("behavior: ignores a branch for a different version", () => {
    expect(
      isDuplicate(event, {
        openPrTitles: [],
        branches: ["devin/1770000000-bump--morpho-org-blue-sdk-6.1.0"],
      }),
    ).toBe(false);
  });
});

describe("mergeBumpEvents", () => {
  const base = {
    publishDate: OLD,
    targets: ["package.json"] as readonly string[],
  };

  test("default", () => {
    const merged = mergeBumpEvents([
      buildBumpEvent({
        ...base,
        ecosystem: "npm",
        package: "graphql",
        from: "16.14.2",
        to: "17.0.2",
        targets: ["packages/b/package.json"],
      }),
      buildBumpEvent({
        ...base,
        ecosystem: "npm",
        package: "graphql",
        from: "14.0.0",
        to: "17.0.2",
        targets: ["packages/a/package.json"],
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.from).toBe("14.0.0");
    expect(merged[0]?.targets).toEqual([
      "packages/a/package.json",
      "packages/b/package.json",
    ]);
  });

  test("behavior: keeps distinct to versions as separate events", () => {
    const merged = mergeBumpEvents([
      buildBumpEvent({
        ...base,
        ecosystem: "npm",
        package: "p",
        from: "1.0.0",
        to: "2.0.0",
      }),
      buildBumpEvent({
        ...base,
        ecosystem: "npm",
        package: "p",
        from: "1.0.0",
        to: "3.0.0",
      }),
    ]);

    expect(merged).toHaveLength(2);
  });

  test("behavior: does not merge across ecosystems", () => {
    const merged = mergeBumpEvents([
      buildBumpEvent({
        ...base,
        ecosystem: "npm",
        package: "a/b",
        from: "1.0.0",
        to: "2.0.0",
      }),
      buildBumpEvent({
        ...base,
        ecosystem: "github-actions",
        package: "a/b",
        from: "v1.0.0",
        to: "v2.0.0",
        sha: "abc",
      }),
    ]);

    expect(merged).toHaveLength(2);
  });
});

describe("fetchAllPages", () => {
  test("default", async () => {
    const fetchImpl = vi.fn(
      async (
        url: string,
      ): Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      }> => ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes("page=1&")
            ? Array.from({ length: 100 }, (_, i) => i)
            : [100, 101, 102],
      }),
    );

    const items = await fetchAllPages<number>(
      "https://api.github.com/x?state=open",
      { fetchImpl, headers: {}, label: "items" },
    );

    expect(items).toHaveLength(103);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.github.com/x?state=open&page=2&per_page=100",
      { headers: {} },
    );
  });

  test("error: a failed page aborts with the label and status", async () => {
    await expect(
      fetchAllPages("https://api.github.com/x", {
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          json: async () => ({}),
        }),
        headers: {},
        label: "devin branches",
      }),
    ).rejects.toThrowError("Failed to list devin branches (status 403).");
  });
});

describe("branchSlug", () => {
  test("default", () => {
    expect(branchSlug("@morpho-org/blue-sdk")).toBe("-morpho-org-blue-sdk");
  });
});

describe("dispatch", () => {
  const event = buildBumpEvent({
    ecosystem: "npm",
    package: "viem",
    from: "2.0.0",
    to: "2.1.0",
    publishDate: OLD,
    targets: ["package.json"],
  });

  test("default", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
    await dispatch(event, {
      url: "https://hooks.example.com/x",
      secret: "s3cret",
      fetch: fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://hooks.example.com/x", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "s3cret",
      },
      body: JSON.stringify(event),
    });
  });

  test("error: non-2xx reports the status without the secret", async () => {
    await expect(
      dispatch(event, {
        url: "https://hooks.example.com/x",
        secret: "s3cret",
        fetch: async () => ({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
      }),
    ).rejects.toThrowError(/status 503/);
    await expect(
      dispatch(event, {
        url: "https://hooks.example.com/x",
        secret: "s3cret",
        fetch: async () => ({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
      }),
    ).rejects.toThrowError(/^((?!s3cret).)*$/);
  });
});

describe("main", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function fixtureRoot(
    dependencies: Record<string, string> = {
      lodash: "^4.0.0",
      "@scope/name": "^1.0.0",
    },
  ): string {
    const dir = mkdtempSync(join(tmpdir(), "dependency-discovery-"));
    dirs.push(dir);
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      "minimumReleaseAge: 4320\n",
    );
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies }));
    mkdirSync(join(dir, "packages", "x"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "x", "package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "a.yml"),
      `      - uses: actions/checkout@${"d".repeat(40)} # v7.0.1\n`,
    );
    return dir;
  }

  const ok = (body: unknown) =>
    Promise.resolve({
      ok: true as const,
      status: 200,
      json: async () => body,
    });

  function stubFetch(calls: string[]) {
    return async (url: string, _init?: Parameters<FetchLike>[1]) => {
      calls.push(url);
      if (url === "https://registry.npmjs.org/lodash") {
        return ok({
          time: {
            created: "2010-01-01T00:00:00Z",
            modified: "2026-01-01T00:00:00Z",
            "4.0.0": "2020-01-01T00:00:00Z",
            "4.5.0": "2026-01-02T00:00:00Z",
          },
        });
      }
      if (url === "https://registry.npmjs.org/%40scope%2Fname") {
        return ok({ time: { "1.0.0": "2020-01-01T00:00:00Z" } });
      }
      if (url.endsWith("/releases?per_page=30")) {
        return ok([
          {
            tag_name: "v8.0.0",
            published_at: "2026-01-01T00:00:00Z",
            prerelease: false,
          },
        ]);
      }
      if (url.endsWith("/git/ref/tags/v8.0.0")) {
        return ok({ object: { sha: "tagsha", type: "tag" } });
      }
      if (url.endsWith("/git/ref/tags/v9.0.0")) {
        return ok({ object: { sha: "lightsha", type: "commit" } });
      }
      if (url.endsWith("/git/tags/tagsha")) {
        return ok({ object: { sha: "commitsha", type: "commit" } });
      }
      if (url.includes("/pulls") || url.includes("/matching-refs")) {
        return ok([]);
      }
      throw new Error(`Unexpected URL ${url}`);
    };
  }

  test("default", async () => {
    const rootDir = fixtureRoot();
    const calls: string[] = [];
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: stubFetch(calls),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    const events = logs.map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toEqual([
      expect.objectContaining({
        ecosystem: "github-actions",
        package: "actions/checkout",
        from: "v7.0.1",
        to: "v8.0.0",
        sha: "commitsha",
      }),
      expect.objectContaining({
        ecosystem: "npm",
        package: "lodash",
        from: "4.0.0",
        to: "4.5.0",
      }),
    ]);
    expect(calls).toContain("https://registry.npmjs.org/%40scope%2Fname");
  });

  test("behavior: MAX_DISPATCH_PER_RUN caps to the oldest publishDate", async () => {
    const rootDir = fixtureRoot();
    const calls: string[] = [];
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "1" },
      fetch: stubFetch(calls),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    const events = logs
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.package).toBe("actions/checkout");
    expect(
      logs.some((line) => line.includes("MAX_DISPATCH_PER_RUN reached")),
    ).toBe(true);
  });

  test("error: throws on invalid MAX_DISPATCH_PER_RUN", async () => {
    await expect(
      main({
        env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "abc" },
        fetch: stubFetch([]),
        now: new Date("2026-02-01T00:00:00Z"),
        log: () => {},
        dryRun: true,
        rootDir: fixtureRoot(),
      }),
    ).rejects.toThrowError(
      "MAX_DISPATCH_PER_RUN must be a non-negative integer.",
    );
    await expect(
      main({
        env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "5.9" },
        fetch: stubFetch([]),
        now: new Date("2026-02-01T00:00:00Z"),
        log: () => {},
        dryRun: true,
        rootDir: fixtureRoot(),
      }),
    ).rejects.toThrowError(
      "MAX_DISPATCH_PER_RUN must be a non-negative integer.",
    );
  });

  test("behavior: a failed registry request skips the package but keeps others", async () => {
    const rootDir = fixtureRoot();
    const base = stubFetch([]);
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: async (url, init) =>
        url === "https://registry.npmjs.org/lodash"
          ? { ok: false, status: 500, json: async () => ({}) }
          : base(url, init),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    const events = logs
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.package).toBe("actions/checkout");
    expect(
      logs.some(
        (line) => line.includes("::notice::") && line.includes("skipping"),
      ),
    ).toBe(true);
  });

  test("behavior: dedupes against open PR titles and devin branches", async () => {
    const rootDir = fixtureRoot();
    const base = stubFetch([]);
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: async (url, init) => {
        if (url.includes("/pulls")) {
          return ok([{ title: "bump lodash from 4.0.0 to 4.5.0" }]);
        }
        if (url.includes("/matching-refs")) {
          return ok([
            { ref: "refs/heads/devin/123-bump-actions-checkout-v8.0.0" },
          ]);
        }
        return base(url, init);
      },
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    expect(logs.filter((line) => line.startsWith("{"))).toHaveLength(0);
  });

  test("behavior: logs a skip notice for an unparseable spec", async () => {
    const rootDir = fixtureRoot({ tape: "latest" });
    const base = stubFetch([]);
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: async (url, init) =>
        url === "https://registry.npmjs.org/tape"
          ? ok({ time: {} })
          : base(url, init),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    expect(
      logs.some(
        (line) =>
          line.includes("::notice::skipping") &&
          line.includes("unparseable spec"),
      ),
    ).toBe(true);
    // Only the action event remains.
    const events = logs
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.ecosystem).toBe("github-actions");
  });

  test("behavior: lightweight tag sha needs no dereference", async () => {
    const rootDir = fixtureRoot({});
    const calls: string[] = [];
    const base = stubFetch(calls);
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: async (url, init) =>
        url.endsWith("/releases?per_page=30")
          ? ok([
              {
                tag_name: "v9.0.0",
                published_at: "2026-01-01T00:00:00Z",
                prerelease: false,
              },
            ])
          : base(url, init),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    const events = logs
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.sha).toBe("lightsha");
    expect(calls.some((url) => url.includes("/git/tags/"))).toBe(false);
  });

  test("behavior: a failed releases request skips the action but keeps npm bumps", async () => {
    const rootDir = fixtureRoot({ lodash: "^4.0.0" });
    const base = stubFetch([]);
    const logs: string[] = [];

    await main({
      env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
      fetch: async (url, init) =>
        url.endsWith("/releases?per_page=30")
          ? { ok: false as const, status: 500, json: async () => ({}) }
          : base(url, init),
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: true,
      rootDir,
    });

    const events = logs
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as BumpEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.package).toBe("lodash");
    expect(
      logs.some(
        (line) => line.includes("::notice::") && line.includes("skipping"),
      ),
    ).toBe(true);
  });

  test("default: non-dry-run POSTs each event to the webhook", async () => {
    const rootDir = fixtureRoot({});
    const base = stubFetch([]);
    const logs: string[] = [];
    const posts: { url: string; init?: Parameters<FetchLike>[1] }[] = [];

    await main({
      env: {
        GH_TOKEN: "token",
        MAX_DISPATCH_PER_RUN: "10",
        DEVIN_DEPENDENCY_WEBHOOK_URL: "https://hooks.example.com/devin",
        DEVIN_DEPENDENCY_WEBHOOK_SECRET: "s3cret",
      },
      fetch: async (url, init) => {
        if (url === "https://hooks.example.com/devin") {
          posts.push({ url, init });
          return ok({});
        }
        return base(url, init);
      },
      now: new Date("2026-02-01T00:00:00Z"),
      log: (message) => logs.push(message),
      dryRun: false,
      rootDir,
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]?.init?.method).toBe("POST");
    expect(posts[0]?.init?.headers?.["X-Webhook-Secret"]).toBe("s3cret");
    expect((JSON.parse(posts[0]?.init?.body ?? "") as BumpEvent).package).toBe(
      "actions/checkout",
    );
    expect(logs.some((line) => line.includes("::notice::dispatched"))).toBe(
      true,
    );
  });

  test("error: non-dry-run requires DEVIN_DEPENDENCY_WEBHOOK_URL", async () => {
    await expect(
      main({
        env: { GH_TOKEN: "token", MAX_DISPATCH_PER_RUN: "10" },
        fetch: stubFetch([]),
        now: new Date("2026-02-01T00:00:00Z"),
        log: () => {},
        dryRun: false,
        rootDir: fixtureRoot(),
      }),
    ).rejects.toThrowError(
      "Missing required environment variable DEVIN_DEPENDENCY_WEBHOOK_URL.",
    );
  });
});
