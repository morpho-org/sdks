import { addressesRegistry, ChainId, MarketParams } from "@morpho-org/blue-sdk";
import { randomMarket } from "@morpho-org/morpho-test";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueAbi } from "../abis.js";
import { fetchMarketParams } from "./MarketParams.js";

describe("fetchMarketParams", () => {
  test("returns the cached MarketParams when one was previously constructed (cache hit)", async () => {
    // Constructing a MarketParams seeds MarketParams._CACHE.
    const params = randomMarket({ lltv: 800000000000000000n });
    const { client } = createMockClient(mainnet);

    const result = await fetchMarketParams(params.id, client);

    expect(result).toBeInstanceOf(MarketParams);
    expect(result.id).toBe(params.id);
    expect(result.loanToken).toBe(params.loanToken);
    expect(result.collateralToken).toBe(params.collateralToken);
    expect(result.lltv).toBe(params.lltv);
  });

  test("on cache miss, fetches MarketParams from the canonical morpho contract", async () => {
    const params = randomMarket();
    // A fresh id never seeded in MarketParams._CACHE forces the RPC path.
    const freshId =
      "0xdead000000000000000000000000000000000000000000000000000000000001" as typeof params.id;

    const handle = createMockClient(mainnet);
    const morpho = addressesRegistry[ChainId.EthMainnet].morpho;
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [
        params.loanToken,
        params.collateralToken,
        params.oracle,
        params.irm,
        params.lltv,
      ],
    });

    const result = await fetchMarketParams(freshId, handle.client, {
      chainId: ChainId.EthMainnet,
    });
    expect(result).toBeInstanceOf(MarketParams);
    expect(result.loanToken).toBe(params.loanToken);
    expect(result.collateralToken).toBe(params.collateralToken);
    expect(result.lltv).toBe(params.lltv);
  });
});
