import type { MarketId } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { describe, expect, test } from "vitest";
import { LiquidityLoader } from "./loader.js";

describe("LiquidityLoader (constructor + public API)", () => {
  test("stores the client", () => {
    const { client } = createMockClient();
    const loader = new LiquidityLoader(client);
    expect(loader.client).toBe(client);
  });

  test("uses an empty parameters record by default", () => {
    const { client } = createMockClient();
    const loader = new LiquidityLoader(client);
    expect(loader.parameters).toEqual({});
  });

  test("preserves the parameters record verbatim", () => {
    const { client } = createMockClient();
    const params = {
      delay: 3600n,
      defaultMaxWithdrawalUtilization: 950000000000000000n,
    };
    const loader = new LiquidityLoader(client, params);
    expect(loader.parameters).toBe(params);
    expect(loader.parameters.delay).toBe(3600n);
    expect(loader.parameters.defaultMaxWithdrawalUtilization).toBe(
      950000000000000000n,
    );
  });

  test("exposes a fetch method", () => {
    const { client } = createMockClient();
    const loader = new LiquidityLoader(client);
    expect(typeof loader.fetch).toBe("function");
  });

  test("fetch returns a Promise", () => {
    const { client } = createMockClient();
    const loader = new LiquidityLoader(client);
    const result = loader.fetch(
      "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId,
    );
    expect(result).toBeInstanceOf(Promise);
    // We don't await — the underlying RPC call is unmocked and would throw,
    // but the Promise itself is created synchronously.
    result.catch(() => {
      /* swallow unhandled rejection */
    });
  });

  test("accepts maxWithdrawalUtilization override map", () => {
    const { client } = createMockClient();
    const overrides: Record<MarketId, bigint> = {
      ["0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId]:
        800000000000000000n,
    };
    const loader = new LiquidityLoader(client, {
      maxWithdrawalUtilization: overrides,
    });
    expect(loader.parameters.maxWithdrawalUtilization).toBe(overrides);
  });
});
