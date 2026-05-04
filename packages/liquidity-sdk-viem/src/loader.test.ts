import type { MarketId } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { LiquidityLoader } from "./loader.js";

describe("LiquidityLoader (constructor + public API)", () => {
  test("stores the client", () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(loader.client).toBe(client);
  });

  test("uses an empty parameters record by default", () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(loader.parameters).toEqual({});
  });

  test("preserves the parameters record verbatim", () => {
    const { client } = createMockClient(mainnet);
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
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(typeof loader.fetch).toBe("function");
  });

  test("fetch returns a Promise that rejects (no RPC mocked)", async () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    // The loader needs `getBlock` (eth_getBlockByNumber) which the mock
    // client does not handle by default. The Promise must reject loudly
    // rather than silently resolving — assert that.
    await expect(
      loader.fetch(
        "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId,
      ),
    ).rejects.toThrow();
  });

  test("accepts maxWithdrawalUtilization override map", () => {
    const { client } = createMockClient(mainnet);
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
