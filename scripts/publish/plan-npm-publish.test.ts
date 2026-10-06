import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  compareVersions,
  fetchRegistryState,
  main,
  type RegistryState,
  shouldPublish,
} from "./plan-npm-publish.ts";

const pkg = { name: "@morpho-org/blue-sdk", version: "7.3.0" };
const state = (overrides: Partial<RegistryState> = {}): RegistryState => ({
  versions: ["7.1.0", "7.2.0"],
  everPublished: ["7.1.0", "7.2.0"],
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

describe("shouldPublish", () => {
  test("publishes a package npm has never seen", () => {
    expect(shouldPublish(pkg, undefined)).toBe(true);
  });

  test("publishes a version newer than latest", () => {
    expect(shouldPublish(pkg, state())).toBe(true);
  });

  test("skips a version already on npm", () => {
    expect(shouldPublish({ ...pkg, version: "7.1.0" }, state())).toBe(false);
  });

  test("refuses a version that was unpublished", () => {
    expect(() =>
      shouldPublish(pkg, state({ everPublished: ["7.1.0", "7.2.0", "7.3.0"] })),
    ).toThrow("refuses to reuse");
  });

  test("refuses a version that would move latest back", () => {
    expect(() =>
      shouldPublish(pkg, state({ versions: ["7.4.0"], latest: "7.4.0" })),
    ).toThrow("would move latest back");
  });

  test("publishes when no latest tag is set", () => {
    expect(shouldPublish(pkg, state({ latest: undefined }))).toBe(true);
  });
});

describe("fetchRegistryState", () => {
  test("reads versions, history and latest from the full packument", async () => {
    let requested = "";
    const result = await fetchRegistryState(pkg.name, async (url) => {
      requested = url;
      return Response.json({
        "dist-tags": { latest: "7.2.0" },
        versions: { "7.2.0": {} },
        time: { created: "x", modified: "x", "7.1.0": "x", "7.2.0": "x" },
      });
    });
    expect(requested).toBe("https://registry.npmjs.org/@morpho-org%2Fblue-sdk");
    expect(result).toEqual({
      versions: ["7.2.0"],
      everPublished: ["7.1.0", "7.2.0"],
      latest: "7.2.0",
    });
  });

  test("accepts a package whose every version was unpublished", async () => {
    const result = await fetchRegistryState(pkg.name, async () =>
      Response.json({
        versions: {},
        time: { created: "x", modified: "x", "7.1.0": "x" },
        "dist-tags": {},
      }),
    );
    expect(result).toStrictEqual({ versions: [], everPublished: ["7.1.0"] });
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
    [
      { versions: {}, time: {}, "dist-tags": { latest: 7 } },
      "non-string latest",
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
    writeFileSync(file, content);
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

  test.each([[[]], [["a.tsv", "b.tsv"]]])(
    "rejects %j positionals",
    async (argv) => {
      await expect(main(argv)).rejects.toThrow("Usage:");
    },
  );

  test("rejects a malformed row", async () => {
    await expect(
      main([tsv("@morpho-org/blue-sdk\t7.3.0\n")], { fetchFn: registry }),
    ).rejects.toThrow("Invalid release-set row");
  });

  test("prints only new versions and reports skipped ones on stderr", async () => {
    const out: string[] = [];
    const err: string[] = [];
    await main(
      [
        tsv(
          "@morpho-org/blue-sdk\t7.3.0\ta.tgz\n@morpho-org/morpho-ts\t1.0.0\tb.tgz\n",
        ),
      ],
      {
        fetchFn: registry,
        stdout: (text) => out.push(text),
        stderr: (text) => err.push(text),
      },
    );
    expect(out.join("")).toBe("@morpho-org/morpho-ts\t1.0.0\tb.tgz\n");
    expect(err.join("")).toBe("Already on npm: @morpho-org/blue-sdk@7.3.0\n");
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
