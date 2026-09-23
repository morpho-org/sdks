import { describe, expect, test, vi } from "vitest";

import {
  branchSlug,
  buildBumpEvent,
  collectNpmDependencies,
  dispatch,
  fetchAllPages,
  isDuplicate,
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
