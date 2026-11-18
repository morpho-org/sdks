import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  fetchPublishedState,
  main,
  publishTarball,
  tarballIntegrity,
} from "./publish-packages.ts";

const bytes = new TextEncoder().encode("tarball bytes");
const integrity = tarballIntegrity(bytes);
const name = "@morpho-org/blue-sdk";
const version = "7.3.0-next.1";
const tgz = join(mkdtempSync(join(tmpdir(), "publish-packages-")), "p.tgz");
writeFileSync(tgz, bytes);

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

/** Registry stub: the version document, then the packument with a `next` tag. */
const registry =
  (options: { versionDoc: () => Response; tags?: Record<string, string> }) =>
  async (url: string): Promise<Response> =>
    url.endsWith(`/${version}`)
      ? options.versionDoc()
      : json(200, {
          versions: { "7.2.0": {}, [version]: {} },
          time: { "7.2.0": "", [version]: "" },
          "dist-tags": options.tags ?? { latest: "7.2.0", next: version },
        });

function run(options: {
  npmExits: number[];
  tag?: "latest" | "next";
  fetchFn?: (url: string) => Promise<Response>;
}) {
  const calls: (readonly string[])[] = [];
  const sleeps: number[] = [];
  const result = publishTarball(
    { name, version, tgz },
    {
      tag: options.tag ?? "next",
      runNpm: (args) => {
        calls.push(args);
        return options.npmExits[calls.length - 1] ?? 1;
      },
      fetchFn: options.fetchFn ?? (async () => json(503)),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: () => {},
    },
  );
  return { result, calls, sleeps };
}

describe("tarballIntegrity", () => {
  test("matches npm's sha512 SRI format", () => {
    expect(tarballIntegrity(new TextEncoder().encode("abc"))).toBe(
      "sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==",
    );
  });
});

describe("fetchPublishedState", () => {
  const pkg = { name, version, integrity };

  test("asks for the exact version with the scope separator encoded", async () => {
    const urls: string[] = [];
    await fetchPublishedState(pkg, async (url) => {
      urls.push(url);
      return json(404);
    });
    expect(urls).toEqual([
      "https://registry.npmjs.org/@morpho-org%2Fblue-sdk/7.3.0-next.1",
    ]);
  });

  test.each([
    { case: "identical", response: json(200, { dist: { integrity } }) },
    {
      case: "different",
      response: json(200, {
        dist: { integrity: tarballIntegrity(new Uint8Array()) },
      }),
    },
    { case: "absent", response: json(404) },
  ])("reports $case", async ({ case: state, response }) => {
    await expect(fetchPublishedState(pkg, async () => response)).resolves.toBe(
      state,
    );
  });

  test.each([
    { case: "a server error", response: () => json(503) },
    { case: "no dist", response: () => json(200, {}) },
    {
      case: "a sha1 integrity",
      response: () => json(200, { dist: { integrity: "sha1-x" } }),
    },
  ])("throws on $case", async ({ response }) => {
    await expect(
      fetchPublishedState(pkg, async () => response()),
    ).rejects.toThrow();
  });
});

describe("publishTarball", () => {
  test("behavior: publishes once, with provenance, under the run's dist-tag", async () => {
    const { result, calls } = run({ npmExits: [0] });
    await result;
    expect(calls).toEqual([
      [
        "publish",
        tgz,
        "--provenance",
        "--access",
        "public",
        "--tag",
        "next",
        "--ignore-scripts",
        "--registry",
        "https://registry.npmjs.org",
      ],
    ]);
  });

  test("behavior: counts identical bytes under an up-to-date tag as published", async () => {
    const { result, calls } = run({
      npmExits: [1],
      fetchFn: registry({
        versionDoc: () => json(200, { dist: { integrity } }),
      }),
    });
    await result;
    expect(calls).toHaveLength(1);
  });

  test("behavior: fails at once when npm holds different bytes", async () => {
    const { result, calls } = run({
      npmExits: [1, 0],
      fetchFn: registry({
        versionDoc: () =>
          json(200, {
            dist: { integrity: tarballIntegrity(new Uint8Array()) },
          }),
      }),
    });
    await expect(result).rejects.toThrow("different bytes");
    expect(calls).toHaveLength(1);
  });

  test.each([
    { tag: "next", tags: { latest: "7.2.0", next: "7.3.0-next.0" } },
    { tag: "latest", tags: { latest: "7.2.0", next: version } },
  ] as const)(
    "behavior: fails when identical bytes stay under a lagging $tag tag",
    async ({ tag, tags }) => {
      const { result, calls } = run({
        npmExits: [1, 1, 1],
        tag,
        fetchFn: registry({
          versionDoc: () => json(200, { dist: { integrity } }),
          tags,
        }),
      });
      await expect(result).rejects.toThrow(`${tag} points to ${tags[tag]}`);
      expect(calls).toHaveLength(3);
    },
  );

  test("behavior: accepts identical bytes when latest is at the version", async () => {
    const { result, calls } = run({
      npmExits: [1],
      tag: "latest",
      fetchFn: registry({
        versionDoc: () => json(200, { dist: { integrity } }),
        tags: { latest: version, next: version },
      }),
    });
    await result;
    expect(calls).toHaveLength(1);
  });

  test("behavior: retries while the version is absent or unreadable, then succeeds", async () => {
    const { result, calls, sleeps } = run({ npmExits: [1, 1, 0] });
    await result;
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([30_000, 60_000]);
  });

  test("behavior: gives up after three failed tries", async () => {
    const { result, calls } = run({
      npmExits: [1, 1, 1],
      fetchFn: registry({ versionDoc: () => json(404) }),
    });
    await expect(result).rejects.toThrow("failed 3 times");
    expect(calls).toHaveLength(3);
  });
});

describe("main", () => {
  test.each([
    {
      label: "multiple rows",
      rows: `${name}\t7.1.0\t${tgz}\n${name}\t7.2.0\t${tgz}\n`,
      waits: ["7.1.0", "7.2.0"],
    },
    { label: "an empty file", rows: "", waits: [] },
  ])(
    "awaits already-published versions before publishing: $label",
    async ({ rows, waits }) => {
      const dir = mkdtempSync(join(tmpdir(), "publish-packages-"));
      const published = join(dir, "published.tsv");
      const pending = join(dir, "pending.tsv");
      writeFileSync(published, rows);
      writeFileSync(pending, `${name}\t${version}\t${tgz}\n`);
      const events: string[] = [];
      await main(["--already-published", published, pending], {
        waitForVersion: async (identity) => {
          events.push(identity.version);
        },
        runNpm: () => {
          events.push("publish");
          return 0;
        },
        log: () => {},
      });
      expect(events).toEqual([...waits, "publish", version]);
    },
  );

  test.each([
    {
      label: "malformed row",
      rows: `${name}\t7.1.0\t${tgz}\n${name}\t7.2.0\n`,
      error: "Invalid publish row",
      failWait: false,
    },
    {
      label: "visibility failure",
      rows: `${name}\t7.1.0\t${tgz}\n`,
      error: "visibility failed",
      failWait: true,
    },
  ])(
    "prevents publishing on already-published $label",
    async ({ rows, error, failWait }) => {
      const dir = mkdtempSync(join(tmpdir(), "publish-packages-"));
      const published = join(dir, "published.tsv");
      const pending = join(dir, "pending.tsv");
      writeFileSync(published, rows);
      writeFileSync(pending, `${name}\t${version}\t${tgz}\n`);
      let publishes = 0;
      await expect(
        main(["--already-published", published, pending], {
          waitForVersion: async () => {
            if (failWait) throw new Error("visibility failed");
          },
          runNpm: () => {
            publishes++;
            return 0;
          },
          log: () => {},
        }),
      ).rejects.toThrow(error);
      expect(publishes).toBe(0);
    },
  );

  test("publishes each row under the requested tag", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "publish-packages-")),
      "rows.tsv",
    );
    writeFileSync(file, `${name}\t${version}\t${tgz}\n`);
    const calls: (readonly string[])[] = [];
    const visible: string[] = [];
    await main(["--tag", "next", file], {
      waitForVersion: async (identity) => {
        visible.push(`${identity.name}@${identity.version}`);
      },
      runNpm: (args) => {
        calls.push(args);
        return 0;
      },
      log: () => {},
    });
    expect(calls.map((args) => args.slice(0, 2))).toEqual([["publish", tgz]]);
    expect(visible).toEqual([`${name}@${version}`]);
  });

  test("waits for visibility before publishing the next row", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "publish-packages-")),
      "rows.tsv",
    );
    writeFileSync(
      file,
      `${name}\t${version}\t${tgz}\n${name}\t7.4.0\t${tgz}\n`,
    );
    const events: string[] = [];
    await main([file], {
      runNpm: () => {
        events.push("publish");
        return 0;
      },
      waitForVersion: async (identity) => {
        events.push(identity.version);
      },
      log: () => {},
    });
    expect(events).toEqual(["publish", version, "publish", "7.4.0"]);
  });

  test("stops when visibility fails", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "publish-packages-")),
      "rows.tsv",
    );
    writeFileSync(
      file,
      `${name}\t${version}\t${tgz}\n${name}\t7.4.0\t${tgz}\n`,
    );
    let publishes = 0;
    await expect(
      main([file], {
        runNpm: () => {
          publishes++;
          return 0;
        },
        waitForVersion: async () => {
          throw new Error("visibility failed");
        },
        log: () => {},
      }),
    ).rejects.toThrow("visibility failed");
    expect(publishes).toBe(1);
  });

  test("does nothing for an empty set", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "publish-packages-")),
      "rows.tsv",
    );
    writeFileSync(file, "");
    await main([file], {
      runNpm: () => {
        throw new Error("unexpected publish");
      },
      waitForVersion: async () => {
        throw new Error("unexpected wait");
      },
    });
  });

  test("rejects a malformed row", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "publish-packages-")),
      "rows.tsv",
    );
    writeFileSync(file, `${name}\t${version}\n`);
    await expect(main(["--tag", "next", file])).rejects.toThrow(
      "Invalid publish row",
    );
  });
});
