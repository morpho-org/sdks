import nock from "nock";
import { afterEach, describe, expect, test, vi } from "vitest";
import { OneInch } from "./1inch.js";
import type { SwapParams } from "./types.js";

const baseParams: SwapParams = {
  src: "0x1111111111111111111111111111111111111111",
  dst: "0x2222222222222222222222222222222222222222",
  amount: "1000",
  from: "0x3333333333333333333333333333333333333333",
  origin: "0x3333333333333333333333333333333333333333",
  slippage: "100",
  chainId: 1,
};

describe("OneInch URL builders", () => {
  test("getSwapApiPath builds /swap/v6.0/<chain>/swap", () => {
    expect(OneInch.getSwapApiPath(1)).toBe("/swap/v6.0/1/swap");
    expect(OneInch.getSwapApiPath(8453)).toBe("/swap/v6.0/8453/swap");
  });

  test("getSwapApiUrl appends to API_BASE_URL", () => {
    expect(OneInch.getSwapApiUrl(1)).toBe(
      "https://api.1inch.dev/swap/v6.0/1/swap",
    );
  });

  test("API_BASE_URL is the canonical 1inch endpoint", () => {
    expect(OneInch.API_BASE_URL).toBe("https://api.1inch.dev");
  });
});

// `describe.sequential` is required because (a) nock interceptors are
// process-global and `nock.cleanAll()` in afterEach would wipe other
// concurrent tests' interceptors, and (b) `vi.stubEnv` / `vi.unstubAllEnvs`
// mutate `process.env` globally — a concurrent test's afterEach could
// revoke the stub before the missing-API-key test's fetch reads it.
describe.sequential("OneInch.fetchSwap via nock", () => {
  afterEach(() => {
    nock.cleanAll();
    vi.unstubAllEnvs();
  });

  test("forwards search params and parses the response on 200", async () => {
    nock("https://api.1inch.dev")
      .get("/swap/v6.0/1/swap")
      .query(true)
      .reply(200, { dstAmount: "1000", tx: { to: "0xfeed" } });

    const res = await OneInch.fetchSwap(baseParams, "test-key");
    expect(res.dstAmount).toBe("1000");
  });

  test("converts slippage from basis points to percentage in the URL", async () => {
    let observedSlippage: string | null = null;
    nock("https://api.1inch.dev")
      .get("/swap/v6.0/1/swap")
      .query((q) => {
        observedSlippage = q.slippage as string;
        return true;
      })
      .reply(200, { dstAmount: "1" });

    await OneInch.fetchSwap({ ...baseParams, slippage: "100" }, "k");
    expect(observedSlippage).toBe("1"); // 100 bps -> 1%
  });

  test("throws an Error when the upstream returns a non-OK status", async () => {
    nock("https://api.1inch.dev")
      .get("/swap/v6.0/1/swap")
      .query(true)
      .reply(500, "internal");

    // Source throws via `throw Error(res.statusText)`. Pinning to Error
    // (not just any rejection) catches a regression that swaps to a
    // different shape (e.g. silently returning undefined).
    await expect(OneInch.fetchSwap(baseParams, "k")).rejects.toBeInstanceOf(
      Error,
    );
  });

  test("sends the Authorization header with the api key", async () => {
    let observedAuth: string | undefined;
    nock("https://api.1inch.dev", {
      reqheaders: {
        authorization: (val) => {
          observedAuth = val;
          return true;
        },
      },
    })
      .get("/swap/v6.0/1/swap")
      .query(true)
      .reply(200, { dstAmount: "1" });

    await OneInch.fetchSwap(baseParams, "abc123");
    expect(observedAuth).toBe("Bearer abc123");
  });

  test("skips null/undefined params", async () => {
    nock("https://api.1inch.dev")
      .get("/swap/v6.0/1/swap")
      .query((q) => {
        // optional `fee` (set to undefined) must not appear in the query.
        return q.fee == null;
      })
      .reply(200, { dstAmount: "1" });

    const res = await OneInch.fetchSwap({ ...baseParams, fee: undefined }, "k");
    expect(res.dstAmount).toBe("1");
  });

  test("non-numeric slippage encodes as 'NaN' (current behaviour pinned)", async () => {
    let observedSlippage: string | undefined;
    nock("https://api.1inch.dev")
      .get("/swap/v6.0/1/swap")
      .query((q) => {
        observedSlippage = q.slippage as string;
        return true;
      })
      .reply(200, { dstAmount: "1" });

    await OneInch.fetchSwap({ ...baseParams, slippage: "abc" }, "k");
    // `Number("abc") / 100 → NaN`, which `toString(10)` emits as "NaN".
    // Pinning the current behaviour so a refactor doesn't silently change it.
    expect(observedSlippage).toBe("NaN");
  });

  test("missing API key falls through with 'Bearer undefined' header", async () => {
    let observedAuth: string | undefined;
    // `vi.stubEnv` with `undefined` removes the env var for the duration of
    // the test; the `afterEach` `vi.unstubAllEnvs()` restores the original.
    // This avoids mutating `process.env` directly, which leaks across
    // concurrent tests under vitest's `sequence: { concurrent: true }`.
    vi.stubEnv("ONE_INCH_SWAP_API_KEY", undefined);

    nock("https://api.1inch.dev", {
      reqheaders: {
        authorization: (val) => {
          observedAuth = val;
          return true;
        },
      },
    })
      .get("/swap/v6.0/1/swap")
      .query(true)
      .reply(200, { dstAmount: "1" });

    // No second arg, no env var → apiKey = undefined.
    await OneInch.fetchSwap(baseParams);
    // Pinning the current behaviour: helper does not error on missing
    // key, just sends the literal string "undefined". Documented so a
    // future security fix that rejects missing keys can update both.
    expect(observedAuth).toBe("Bearer undefined");
  });
});
