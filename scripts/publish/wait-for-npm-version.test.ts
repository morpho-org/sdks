import { describe, expect, test } from "vitest";

import { waitForNpmVersion } from "./wait-for-npm-version.ts";

const name = "@morpho-org/blue-sdk";
const version = "8.0.2";

describe("waitForNpmVersion", () => {
  test("returns when the version is immediately visible to npm install", async () => {
    const requests: { url: string; headers?: HeadersInit }[] = [];
    const sleeps: number[] = [];
    await waitForNpmVersion({
      name,
      version,
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), headers: init?.headers });
        return Response.json({ versions: { [version]: {} } });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(requests).toEqual([
      {
        url: "https://registry.npmjs.org/@morpho-org%2Fblue-sdk",
        headers: { accept: "application/vnd.npm.install-v1+json" },
      },
    ]);
    expect(sleeps).toEqual([]);
  });

  test("polls until the version is visible", async () => {
    let time = 0;
    let requests = 0;
    const sleeps: number[] = [];
    await waitForNpmVersion({
      name,
      version,
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      fetchFn: async () => {
        requests++;
        if (requests === 1) return new Response("", { status: 404 });
        return Response.json({
          versions: requests < 3 ? {} : { [version]: {} },
        });
      },
    });
    expect(requests).toBe(3);
    expect(sleeps).toEqual([10_000, 10_000]);
  });

  test("continues polling after a fetch request times out", async () => {
    let time = 0;
    let requests = 0;
    const sleeps: number[] = [];
    const signals: (AbortSignal | null | undefined)[] = [];
    await waitForNpmVersion({
      name,
      version,
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      fetchFn: async (_url, init) => {
        requests++;
        signals.push(init?.signal);
        if (requests === 1) {
          throw new DOMException("The operation timed out", "TimeoutError");
        }
        return Response.json({ versions: { [version]: {} } });
      },
    });

    expect(requests).toBe(2);
    expect(sleeps).toEqual([10_000]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  test("continues polling after a response body read times out", async () => {
    let time = 0;
    let requests = 0;
    const sleeps: number[] = [];
    await waitForNpmVersion({
      name,
      version,
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      fetchFn: async () => {
        requests++;
        if (requests === 1) {
          const response = Response.json({ versions: {} });
          response.text = async () => {
            throw new DOMException("The operation was aborted", "AbortError");
          };
          return response;
        }
        return Response.json({ versions: { [version]: {} } });
      },
    });

    expect(requests).toBe(2);
    expect(sleeps).toEqual([10_000]);
  });

  test("rejects an unparseable successful response without polling again", async () => {
    let requests = 0;
    const sleeps: number[] = [];
    let error: unknown;
    try {
      await waitForNpmVersion({
        name,
        version,
        fetchFn: async () => {
          requests++;
          return new Response("<html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected an error.");
    expect(error.message).toBe(
      "GET https://registry.npmjs.org/@morpho-org%2Fblue-sdk returned an unparseable install packument.",
    );
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(requests).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test("rejects an array versions field without polling again", async () => {
    let requests = 0;
    const sleeps: number[] = [];
    await expect(
      waitForNpmVersion({
        name,
        version,
        fetchFn: async () => {
          requests++;
          return Response.json({ versions: [] });
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }),
    ).rejects.toThrow("malformed install packument");

    expect(requests).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test("times out with the last HTTP status", async () => {
    let time = 0;
    let requests = 0;
    const sleeps: number[] = [];
    await expect(
      waitForNpmVersion({
        name,
        version,
        now: () => time,
        sleep: async (ms) => {
          sleeps.push(ms);
          time += ms;
        },
        fetchFn: async () => {
          requests++;
          return new Response("", { status: 503 });
        },
      }),
    ).rejects.toThrow("last HTTP status 503");
    expect(requests).toBe(60);
    expect(time).toBe(10 * 60_000);
    expect(sleeps).toHaveLength(60);
    expect(sleeps.every((ms) => ms === 10_000)).toBe(true);
  });

  test.each([
    { description: "a non-Morpho package", name: "other/package", version },
    { description: "a malformed version", name, version: "v8.0.2" },
  ])(
    "rejects $description before making a request",
    async ({ name: invalidName, version: invalidVersion }) => {
      let requests = 0;
      await expect(
        waitForNpmVersion({
          name: invalidName,
          version: invalidVersion,
          fetchFn: async () => {
            requests++;
            return Response.json({ versions: {} });
          },
        }),
      ).rejects.toThrow("Invalid");
      expect(requests).toBe(0);
    },
  );
});
