import {
  addressesRegistry,
  ChainId,
  MarketIdMismatchError,
  MarketParams,
  MarketUtils,
  UnknownMarketParamsError,
} from "@morpho-org/blue-sdk";
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
    const params = {
      loanToken: "0x1000000000000000000000000000000000000001",
      collateralToken: "0x2000000000000000000000000000000000000002",
      oracle: "0x3000000000000000000000000000000000000003",
      irm: "0x4000000000000000000000000000000000000004",
      lltv: 800000000000000000n,
    } as const;
    const freshId = MarketUtils.getMarketId(params);

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

  test("accepts an uppercase spelling of the requested market id", async () => {
    const params = {
      loanToken: "0x1100000000000000000000000000000000000001",
      collateralToken: "0x2200000000000000000000000000000000000002",
      oracle: "0x3300000000000000000000000000000000000003",
      irm: "0x4400000000000000000000000000000000000004",
      lltv: 800000000000000000n,
    } as const;
    const id = MarketUtils.getMarketId(params);
    const uppercaseId = `0x${id.slice(2).toUpperCase()}` as typeof id;
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: addressesRegistry[ChainId.EthMainnet].morpho,
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

    const result = await fetchMarketParams(uppercaseId, handle.client);

    expect(result.id).toBe(id);
  });

  test("rejects mismatched RPC params before caching them", async () => {
    const params = {
      loanToken: "0x5000000000000000000000000000000000000005",
      collateralToken: "0x6000000000000000000000000000000000000006",
      oracle: "0x7000000000000000000000000000000000000007",
      irm: "0x8000000000000000000000000000000000000008",
      lltv: 700000000000000000n,
    } as const;
    const actualId = MarketUtils.getMarketId(params);
    const requestedId =
      "0xdead000000000000000000000000000000000000000000000000000000000002" as typeof actualId;
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

    await expect(
      fetchMarketParams(requestedId, handle.client, {
        chainId: ChainId.EthMainnet,
      }),
    ).rejects.toThrow(MarketIdMismatchError);
    expect(() => MarketParams.get(actualId)).toThrow(UnknownMarketParamsError);
  });
});
