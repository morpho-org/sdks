import { ChainId, MarketParams } from "@morpho-org/blue-sdk";
import { randomMarket } from "@morpho-org/morpho-test";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { describe, expect, test } from "vitest";
import { blueAbi } from "../abis.js";
import { fetchMarketParams } from "./MarketParams.js";

describe("fetchMarketParams", () => {
  test("returns the cached MarketParams when one was previously constructed (cache hit)", async () => {
    // Constructing a MarketParams seeds MarketParams._CACHE.
    const params = randomMarket({ lltv: 800000000000000000n });
    const { client } = createMockClient();

    const result = await fetchMarketParams(params.id, client);

    expect(result).toBeInstanceOf(MarketParams);
    expect(result.id).toBe(params.id);
    expect(result.loanToken).toBe(params.loanToken);
    expect(result.collateralToken).toBe(params.collateralToken);
    expect(result.lltv).toBe(params.lltv);
  });

  test("respects an explicit chainId when fetching from chain (cache miss path is reachable)", async () => {
    // Construct a MarketParams to obtain a known id, then drop it from cache.
    const params = randomMarket();
    // Force a cache miss by using a fresh id that's never been seeded.
    const freshId =
      "0xdead000000000000000000000000000000000000000000000000000000000001" as typeof params.id;

    const handle = createMockClient();
    mockRead(handle, {
      address: "0xBBBbbbbBbbBBBBbBBbBBBbBbBBBbBbBbBBBbbBBb",
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

    // Note: the mockRead address is arbitrary here; the real call uses the
    // morpho address from getChainAddresses(chainId). Use chainId=EthMainnet
    // and program the canonical morpho address.
    const { addressesRegistry } = await import("@morpho-org/blue-sdk");
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
