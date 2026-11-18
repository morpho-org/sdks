import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  compareVersions,
  fetchRegistryState,
  main,
  parseRollbackPins,
  planPublish,
  type RegistryState,
} from "./plan-npm-publish.ts";

const tarball = "verified tarball";
const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
const pkg = { name: "@morpho-org/blue-sdk", version: "7.3.0", integrity };
const state = (overrides: Partial<RegistryState> = {}): RegistryState => ({
  versions: ["7.1.0", "7.2.0"],
  everPublished: ["7.1.0", "7.2.0"],
  integrities: {},
  latest: "7.2.0",
  ...overrides,
});

describe("compareVersions", () => {
  test.each([
    { a: "1.2.3", b: "1.2.3", sign: 0 },
    { a: "1.10.0", b: "1.9.0", sign: 1 },
    { a: "2.0.0", b: "10.0.0", sign: -1 },
    { a: "1.0.0", b: "1.0.0-beta.1", sign: 1 },
    { a: "1.0.0-beta.2", b: "1.0.0-beta.1", sign: 1 },
    { a: "1.0.0-beta.10", b: "1.0.0-beta.9", sign: 1 },
    { a: "1.0.0-alpha", b: "1.0.0-beta", sign: -1 },
    { a: "1.0.0-1", b: "1.0.0-alpha", sign: -1 },
    { a: "1.0.0-beta", b: "1.0.0-beta.1", sign: -1 },
    { a: "1.0.0-beta.1", b: "1.0.0-beta.1", sign: 0 },
    { a: "1.0.0+build.1", b: "1.0.0", sign: 0 },
  ])("compares $a with $b", ({ a, b, sign }) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  test("rejects a malformed version", () => {
    expect(() => compareVersions("v1", "1.0.0")).toThrow("Unrecognized");
  });
});

describe("planPublish", () => {
  test("publishes a package npm has never seen", () => {
    expect(planPublish(pkg, undefined)).toBe("publish");
  });

  test("publishes a version newer than latest", () => {
    expect(planPublish(pkg, state())).toBe("publish");
  });

  test("skips a version already on npm", () => {
    expect(planPublish({ ...pkg, version: "7.1.0" }, state())).toBe("skip");
  });

  test("refuses a version already on npm that latest lags behind", () => {
    const published = state({
      versions: ["7.1.0", "7.2.0", "7.3.0"],
      everPublished: ["7.1.0", "7.2.0", "7.3.0"],
    });
    expect(() => planPublish(pkg, published)).toThrow(
      "is already on npm, but latest still points to the older 7.2.0",
    );
    expect(() => planPublish(pkg, published)).toThrow("record a rollback pin");
    expect(planPublish({ ...pkg, version: "7.2.0" }, published)).toBe("skip");
    expect(planPublish({ ...pkg, version: "7.1.0" }, published)).toBe("skip");
  });

  test("refuses a version that was unpublished", () => {
    expect(() =>
      planPublish(pkg, state({ everPublished: ["7.1.0", "7.2.0", "7.3.0"] })),
    ).toThrow("refuses to reuse");
  });

  test("refuses a version that would move latest back", () => {
    expect(() =>
      planPublish(pkg, state({ versions: ["7.4.0"], latest: "7.4.0" })),
    ).toThrow("would move latest back");
  });

  test("under next, compares with the next tag only", () => {
    const pre = { ...pkg, version: "7.3.0-next.1", tag: "next" as const };
    expect(planPublish(pre, state())).toBe("publish");
    expect(planPublish(pre, state({ next: "7.3.0-next.0" }))).toBe("publish");
    expect(
      planPublish(pre, state({ latest: "7.4.0", versions: ["7.4.0"] })),
    ).toBe("publish");
    expect(() => planPublish(pre, state({ next: "7.3.0-next.2" }))).toThrow(
      "is not newer than next 7.3.0-next.2; publishing it would move next back",
    );
  });

  test("refuses an existing prerelease when next lags behind it", () => {
    const pre = { ...pkg, version: "7.3.0-next.1", tag: "next" as const };
    const published = state({
      versions: ["7.3.0-next.1"],
      everPublished: ["7.3.0-next.1"],
    });
    expect(() =>
      planPublish(pre, { ...published, next: "7.3.0-next.0" }),
    ).toThrow("but next still points to the older 7.3.0-next.0");
    expect(planPublish(pre, { ...published, next: "7.3.0-next.1" })).toBe(
      "skip",
    );
    expect(planPublish(pre, published)).toBe("skip");
  });

  test("refuses a package's first publish under next", () => {
    const pre = { ...pkg, version: "7.3.0-next.1", tag: "next" as const };
    expect(planPublish(pkg, undefined)).toBe("publish");
    expect(() => planPublish(pre, undefined)).toThrow(
      "Publish a stable version from main first.",
    );
    expect(() =>
      planPublish(
        pre,
        state({ versions: [], everPublished: ["1.0.0"], latest: undefined }),
      ),
    ).toThrow("Publish a stable version from main first.");
  });

  test("publishes when no latest tag is set", () => {
    expect(planPublish(pkg, state({ latest: undefined }))).toBe("publish");
  });

  const publishedNext = state({
    versions: ["7.2.0", pkg.version],
    everPublished: ["7.2.0", pkg.version],
    integrities: { [pkg.version]: integrity },
    next: pkg.version,
  });
  const pin = { version: "7.2.0", reason: "Investigating a regression" };

  test("promotes an existing stable next version on main without republishing", () => {
    expect(planPublish(pkg, publishedNext)).toBe("promote");
  });

  test.each([undefined, "", "sha1-legacy", "sha512-invalid"])(
    "refuses promotion without a verified SHA-512 integrity (%s)",
    (invalidIntegrity) => {
      expect(() =>
        planPublish({ ...pkg, integrity: invalidIntegrity }, publishedNext),
      ).toThrow("cannot be promoted");
    },
  );

  test.each([
    {},
    { [pkg.version]: "sha1-legacy" },
    {
      [pkg.version]: `sha512-${createHash("sha512").update("different bytes").digest("base64")}`,
    },
    { "7.2.0": integrity },
  ])("refuses missing or mismatched npm integrity %j", (integrities) => {
    expect(() => planPublish(pkg, { ...publishedNext, integrities })).toThrow(
      "cannot be promoted",
    );
  });

  test("a successful promotion is idempotent and never moves latest back", () => {
    expect(planPublish(pkg, { ...publishedNext, latest: pkg.version })).toBe(
      "skip",
    );
    expect(planPublish(pkg, { ...publishedNext, latest: "7.4.0" })).toBe(
      "skip",
    );
  });

  test.each([undefined, "7.2.0", "7.4.0-next.1"])(
    "does not infer historical next membership from %s",
    (next) => {
      expect(() => planPublish(pkg, { ...publishedNext, next })).toThrow(
        "is already on npm",
      );
    },
  );

  test("never promotes a prerelease to latest", () => {
    const version = "7.3.0-next.1";
    expect(() =>
      planPublish(
        { ...pkg, version },
        { ...publishedNext, versions: [version], next: version },
      ),
    ).toThrow("is already on npm");
  });

  test("rollback pins override next promotion, including reruns after manual rollback", () => {
    expect(planPublish({ ...pkg, pin }, publishedNext)).toBe("skip");
    expect(planPublish(pkg, publishedNext)).toBe("promote");
  });

  test.each([undefined, state(), { ...publishedNext, latest: pkg.version }])(
    "requires the pinned version to exist and match latest",
    (registry) => {
      const requested = { version: "7.1.0", reason: "rollback" };
      expect(() => planPublish({ ...pkg, pin: requested }, registry)).toThrow(
        "Apply the rollback manually",
      );
    },
  );

  test("a dangling latest tag cannot satisfy a pin", () => {
    expect(() =>
      planPublish(
        { ...pkg, pin },
        { ...publishedNext, versions: [pkg.version] },
      ),
    ).toThrow("Apply the rollback manually");
  });

  test("pins cannot hide unpublished release versions", () => {
    expect(() => planPublish({ ...pkg, pin }, state())).toThrow(
      "is not on npm",
    );
    expect(() =>
      planPublish({ ...pkg, pin }, { ...publishedNext, versions: ["7.2.0"] }),
    ).toThrow("is not on npm");
  });

  test("latest rollback pins do not block the next channel", () => {
    expect(
      planPublish(
        { ...pkg, version: "7.4.0-next.1", tag: "next", pin },
        publishedNext,
      ),
    ).toBe("publish");
  });
});

describe("parseRollbackPins", () => {
  test("accepts an empty config or explicit versions with reasons", () => {
    expect(parseRollbackPins({}).size).toBe(0);
    const pin = { version: "4.2.0", reason: "Regression" };
    expect(parseRollbackPins({ [pkg.name]: pin }).get(pkg.name)).toEqual(pin);
  });

  test.each([
    null,
    [],
    "",
    { [pkg.name]: "7.2.0" },
    { [pkg.name]: null },
    { blue: {} },
    { [pkg.name]: [] },
    { [pkg.name]: { version: "7.2.0" } },
    { [pkg.name]: { version: "7.2.0", reason: " " } },
    { [pkg.name]: { version: "7.2.0-next.1", reason: "rollback" } },
    { [pkg.name]: { version: "07.2.0", reason: "rollback" } },
    { [pkg.name]: { version: "7.2.0", reason: "rollback", typo: true } },
  ])("rejects malformed pins %j", (pins) => {
    expect(() => parseRollbackPins(pins)).toThrow();
  });
});

describe("fetchRegistryState", () => {
  test.each([
    null,
    "invalid manifest",
    {},
    { dist: null },
    { dist: {} },
    { dist: { integrity: 123 } },
  ])(
    "does not authorize promotion with malformed dist metadata %j",
    async (manifest) => {
      const registry = await fetchRegistryState(pkg.name, async () =>
        Response.json({
          "dist-tags": { latest: "7.2.0", next: pkg.version },
          versions: { "7.2.0": {}, [pkg.version]: manifest },
          time: { "7.2.0": "x", [pkg.version]: "x" },
        }),
      );
      expect(() => planPublish(pkg, registry)).toThrow("cannot be promoted");
    },
  );

  test("reads versions, history and latest from the full packument", async () => {
    let requested = "";
    const result = await fetchRegistryState(pkg.name, async (url) => {
      requested = url;
      return Response.json({
        "dist-tags": { latest: "7.2.0" },
        versions: { "7.2.0": { dist: { integrity } } },
        time: { created: "x", modified: "x", "7.1.0": "x", "7.2.0": "x" },
      });
    });
    expect(requested).toBe("https://registry.npmjs.org/@morpho-org%2Fblue-sdk");
    expect(result).toEqual({
      versions: ["7.2.0"],
      everPublished: ["7.1.0", "7.2.0"],
      integrities: { "7.2.0": integrity },
      latest: "7.2.0",
    });
  });

  test("accepts a package whose every version was unpublished", async () => {
    const result = await fetchRegistryState(pkg.name, async () =>
      Response.json({
        _id: pkg.name,
        name: pkg.name,
        time: {
          created: "x",
          modified: "x",
          unpublished: { time: "x", versions: ["7.0.0", "7.1.0"] },
        },
      }),
    );
    expect(result).toStrictEqual({
      versions: [],
      everPublished: ["7.0.0", "7.1.0"],
      integrities: {},
    });
  });

  test("merges versions listed in time with the unpublished ones", async () => {
    const result = await fetchRegistryState(pkg.name, async () =>
      Response.json({
        time: {
          created: "x",
          modified: "x",
          "6.0.0": "x",
          "7.0.0": "x",
          unpublished: { time: "x", versions: ["7.0.0", "7.1.0"] },
        },
      }),
    );
    expect(result).toStrictEqual({
      versions: [],
      everPublished: ["6.0.0", "7.0.0", "7.1.0"],
      integrities: {},
    });
  });

  test("treats 404 as a new package", async () => {
    await expect(
      fetchRegistryState(
        pkg.name,
        async () => new Response("", { status: 404 }),
      ),
    ).resolves.toBeUndefined();
  });

  test("fails closed on any other error", async () => {
    await expect(
      fetchRegistryState(
        pkg.name,
        async () => new Response("", { status: 503 }),
      ),
    ).rejects.toThrow("returned 503");
  });

  test.each([
    [{ versions: {}, "dist-tags": {} }, 'no "time" object'],
    [{ time: {}, "dist-tags": {} }, 'no "versions" object'],
    [{ versions: {}, time: {} }, 'no "dist-tags" object'],
    [{ versions: {}, time: {}, "dist-tags": "x" }, 'no "dist-tags" object'],
    [{ versions: {}, time: {}, "dist-tags": [] }, 'no "dist-tags" object'],
    [{ versions: [], time: {}, "dist-tags": {} }, 'no "versions" object'],
    [{ time: { unpublished: {} } }, "malformed unpublished tombstone"],
    [
      { time: { unpublished: { versions: [7] } } },
      "malformed unpublished tombstone",
    ],
    [
      { versions: {}, time: { unpublished: { versions: [] } } },
      "malformed unpublished tombstone",
    ],
    [
      { "dist-tags": {}, time: { unpublished: { versions: [] } } },
      "malformed unpublished tombstone",
    ],
    [
      { versions: {}, time: {}, "dist-tags": { latest: 7 } },
      "non-string latest",
    ],
    [
      { versions: {}, time: {}, "dist-tags": { latest: "7.3.0", next: 1 } },
      "non-string next",
    ],
    [
      { versions: { "7.2.0": {} }, time: {}, "dist-tags": {} },
      "versions but no latest",
    ],
  ])("fails closed on the malformed packument %j", async (body, message) => {
    await expect(
      fetchRegistryState(pkg.name, async () => Response.json(body)),
    ).rejects.toThrow(message);
  });
});

describe("main", () => {
  const tsv = (content: string) => {
    const file = join(mkdtempSync(join(tmpdir(), "plan-")), "release-set.tsv");
    const rows = content.split("\n").map((line) => {
      const fields = line.split("\t");
      if (fields.length === 3 && fields[2]) {
        const tgz = join(dirname(file), fields[2]);
        writeFileSync(tgz, tarball);
        fields[2] = tgz;
      }
      return fields.join("\t");
    });
    writeFileSync(file, rows.join("\n"));
    return file;
  };
  const registry = async (url: string) =>
    url.endsWith("%2Fblue-sdk")
      ? Response.json({
          "dist-tags": { latest: "7.3.0" },
          versions: { "7.3.0": {} },
          time: { "7.3.0": "x" },
        })
      : new Response("", { status: 404 });

  const pendingPromotion = async () =>
    Response.json({
      "dist-tags": { latest: "7.2.0", next: "7.3.0" },
      versions: { "7.2.0": {}, "7.3.0": { dist: { integrity } } },
      time: { "7.2.0": "x", "7.3.0": "x" },
    });

  test("separates promotions from new uploads and skips completed promotions on rerun", async () => {
    const file = tsv(
      "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
    );
    const promotions = `${file}.promotions`;
    const out: string[] = [];
    await main(["--promotions", promotions, file], {
      fetchFn: async (url) =>
        url.endsWith("%2Fblue-sdk") ? pendingPromotion() : registry(url),
      stdout: (text) => out.push(text),
    });
    expect(out.join("")).toBe(
      `@morpho-org/morpho-ts\t1.0.0\t${join(dirname(file), "b.tgz")}\n`,
    );
    expect(readFileSync(promotions, "utf8")).toBe(
      "@morpho-org/blue-sdk\t7.3.0\n",
    );
    await main(["--promotions", promotions, file], {
      fetchFn: registry,
      stdout: () => {},
      stderr: () => {},
    });
    expect(readFileSync(promotions, "utf8")).toBe("");
  });

  test("refuses to silently discard promotions when the output flag is missing", async () => {
    await expect(
      main([tsv("@morpho-org/blue-sdk\t7.3.0\ta.tgz\n")], {
        fetchFn: pendingPromotion,
        stdout: () => {
          throw new Error("Unexpected stdout");
        },
      }),
    ).rejects.toThrow("Pass --promotions");
  });

  test("buffers promotions until every package passes preflight", async () => {
    const file = tsv(
      "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
    );
    const promotions = `${file}.promotions`;
    const out: string[] = [];
    await expect(
      main(["--promotions", promotions, file], {
        fetchFn: async (url) =>
          url.endsWith("%2Fblue-sdk")
            ? pendingPromotion()
            : new Response("", { status: 503 }),
        stdout: (text) => out.push(text),
      }),
    ).rejects.toThrow("returned 503");
    expect(out).toEqual([]);
    expect(existsSync(promotions)).toBe(false);
  });

  test.each(["missing integrity", "mismatched integrity", "changed tarball"])(
    "writes neither plan when a promotion has %s",
    async (failure) => {
      const file = tsv(
        "@morpho-org/morpho-ts\t1.0.0\ta.tgz\n@morpho-org/blue-sdk\t7.3.0\tb.tgz\n",
      );
      if (failure === "changed tarball")
        writeFileSync(join(dirname(file), "b.tgz"), "different local bytes");
      const publishedIntegrity =
        failure === "missing integrity"
          ? undefined
          : failure === "mismatched integrity"
            ? `sha512-${createHash("sha512").update("different npm bytes").digest("base64")}`
            : integrity;
      const promotions = `${file}.promotions`;
      const out: string[] = [];
      await expect(
        main(["--promotions", promotions, file], {
          fetchFn: async (url) =>
            url.endsWith("%2Fblue-sdk")
              ? Response.json({
                  "dist-tags": { latest: "7.2.0", next: pkg.version },
                  versions: {
                    "7.2.0": {},
                    [pkg.version]: { dist: { integrity: publishedIntegrity } },
                  },
                  time: { "7.2.0": "x", [pkg.version]: "x" },
                })
              : registry(url),
          stdout: (text) => out.push(text),
        }),
      ).rejects.toThrow("cannot be promoted");
      expect(out).toEqual([]);
      expect(existsSync(promotions)).toBe(false);
    },
  );

  test("honors rollback pins while letting unrelated packages release", async () => {
    const file = tsv(
      "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
    );
    const promotions = `${file}.promotions`;
    const rollbacks = tsv(
      JSON.stringify({
        [pkg.name]: { version: "7.2.0", reason: "regression" },
      }),
    );
    const out: string[] = [];
    const err: string[] = [];
    await main(["--rollbacks", rollbacks, "--promotions", promotions, file], {
      fetchFn: async (url) =>
        url.endsWith("%2Fblue-sdk") ? pendingPromotion() : registry(url),
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    });
    expect(out.join("")).toBe(
      `@morpho-org/morpho-ts\t1.0.0\t${join(dirname(file), "b.tgz")}\n`,
    );
    expect(readFileSync(promotions, "utf8")).toBe("");
    expect(err.join("")).toContain(
      "Rollback hold: @morpho-org/blue-sdk latest stays at 7.2.0: regression",
    );
  });

  test("rejects unknown pins before writing any plan", async () => {
    const file = tsv("@morpho-org/morpho-ts\t1.0.0\ta.tgz\n");
    const rollbacks = tsv(
      JSON.stringify({
        [pkg.name]: { version: "7.2.0", reason: "regression" },
      }),
    );
    await expect(
      main(["--rollbacks", rollbacks, file], {
        fetchFn: registry,
        stdout: () => {
          throw new Error("Unexpected stdout");
        },
      }),
    ).rejects.toThrow("does not match a package");
  });

  test.each(["invalid JSON", "[]"])(
    "fails closed on invalid rollback config %s",
    async (config) => {
      await expect(
        main(["--rollbacks", tsv(config), tsv("")], { fetchFn: registry }),
      ).rejects.toThrow();
    },
  );

  test.each([[[]], [["a.tsv", "b.tsv"]]])(
    "rejects %j positionals",
    async (argv) => {
      await expect(main(argv)).rejects.toThrow("Usage:");
    },
  );

  test.each([
    ["a missing field", "@morpho-org/blue-sdk\t7.3.0\n"],
    ["an extra field", "@morpho-org/blue-sdk\t7.3.0\ta.tgz\textra\n"],
  ])("rejects a row with %s", async (_, row) => {
    await expect(main([tsv(row)], { fetchFn: registry })).rejects.toThrow(
      "Invalid release-set row",
    );
  });

  test.each([
    ["a registry error", new Response("", { status: 503 })],
    [
      "a version older than latest",
      Response.json({
        "dist-tags": { latest: "2.0.0" },
        versions: { "2.0.0": {} },
        time: { "2.0.0": "x" },
      }),
    ],
  ])("prints nothing when a later row fails on %s", async (_, response) => {
    const out: string[] = [];
    await expect(
      main(
        [
          tsv(
            "@morpho-org/morpho-ts\t1.0.0\ta.tgz\n@morpho-org/blue-sdk\t1.0.0\tb.tgz\n",
          ),
        ],
        {
          fetchFn: async (url) =>
            url.endsWith("%2Fblue-sdk")
              ? response
              : new Response("", { status: 404 }),
          stdout: (text) => out.push(text),
          stderr: () => {},
        },
      ),
    ).rejects.toThrow();
    expect(out).toEqual([]);
  });

  test("--tag next checks the next dist-tag", async () => {
    const fetchFn = async () =>
      Response.json({
        "dist-tags": { latest: "7.3.0", next: "7.4.0-next.1" },
        versions: { "7.3.0": {}, "7.4.0-next.1": {} },
        time: { "7.3.0": "x", "7.4.0-next.1": "x" },
      });
    const out: string[] = [];
    const file = tsv("@morpho-org/blue-sdk\t7.4.0-next.2\ta.tgz\n");
    await main(["--tag", "next", file], {
      fetchFn,
      stdout: (text) => out.push(text),
    });
    expect(out.join("")).toBe(
      `@morpho-org/blue-sdk\t7.4.0-next.2\t${join(dirname(file), "a.tgz")}\n`,
    );
    await expect(
      main(
        ["--tag", "next", tsv("@morpho-org/blue-sdk\t7.4.0-next.0\ta.tgz\n")],
        {
          fetchFn,
          stdout: () => {},
        },
      ),
    ).rejects.toThrow("would move next back");
    await expect(main(["--tag", "beta", tsv("")], { fetchFn })).rejects.toThrow(
      "Usage:",
    );
  });

  test("prints only new versions and reports skipped ones on stderr", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const file = tsv(
      "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
    );
    await main([file], {
      fetchFn: registry,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    });
    expect(out.join("")).toBe(
      `@morpho-org/morpho-ts\t1.0.0\t${join(dirname(file), "b.tgz")}\n`,
    );
    expect(err.join("")).toBe("Already on npm: @morpho-org/blue-sdk@7.3.0\n");
  });

  test("writes already-published rows separately from publish rows", async () => {
    const input = tsv(
      "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
    );
    const output = tsv("");
    const publishRows: string[] = [];
    await main(["--already-published-output", output, input], {
      fetchFn: registry,
      stdout: (text) => publishRows.push(text),
      stderr: () => {},
    });

    expect(publishRows.join("")).toBe(
      `@morpho-org/morpho-ts\t1.0.0\t${join(dirname(input), "b.tgz")}\n`,
    );
    expect(readFileSync(output, "utf8")).toBe(
      `@morpho-org/blue-sdk\t7.3.0\t${join(dirname(input), "a.tgz")}\n`,
    );
  });

  test("fails on an existing version ahead of latest without writing stdout", async () => {
    const out: string[] = [];
    await expect(
      main([tsv("@morpho-org/blue-sdk\t7.3.0\ta.tgz\n")], {
        fetchFn: async () =>
          Response.json({
            "dist-tags": { latest: "7.2.0" },
            versions: { "7.2.0": {}, "7.3.0": {} },
            time: { "7.2.0": "x", "7.3.0": "x" },
          }),
        stdout: (text) => out.push(text),
        stderr: () => {},
      }),
    ).rejects.toThrow(
      "is already on npm, but latest still points to the older 7.2.0",
    );
    expect(out).toEqual([]);
  });
});

test.each([null, "x"])(
  "fetchRegistryState rejects a %j packument",
  async (body) => {
    await expect(
      fetchRegistryState(pkg.name, async () => Response.json(body)),
    ).rejects.toThrow();
  },
);
