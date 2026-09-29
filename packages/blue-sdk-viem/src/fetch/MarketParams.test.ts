import {
  addressesRegistry,
  ChainId,
  type IMarketParams,
  MarketParams,
  MarketUtils,
} from "@morpho-org/blue-sdk";
import { randomMarket } from "@morpho-org/morpho-test";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueAbi } from "../abis.js";
import { MarketParamsIdMismatchError } from "../error.js";
import { fetchMarketParams } from "./MarketParams.js";

function rawMarketParams(seed: number): IMarketParams {
  const address = (offset: number) =>
    `0x${BigInt(seed * 10 + offset)
      .toString(16)
      .padStart(40, "0")}` as Address;

  return {
    loanToken: address(1),
    collateralToken: address(2),
    oracle: address(3),
    irm: address(4),
    lltv: BigInt(seed) * 1000000000000000n,
  };
}

const marketParamsTuple = (params: IMarketParams) =>
  [
    params.loanToken,
    params.collateralToken,
    params.oracle,
    params.irm,
    params.lltv,
  ] as const;

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
    const rawParams = rawMarketParams(101);
    const id = MarketUtils.getMarketId(rawParams);

    const handle = createMockClient(mainnet);
    const morpho = addressesRegistry[ChainId.EthMainnet].blue;
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: marketParamsTuple(rawParams),
    });

    const result = await fetchMarketParams(id, handle.client);
    expect(result).toBeInstanceOf(MarketParams);
    expect(result.id).toBe(id);
    expect(result.loanToken.toLowerCase()).toBe(
      rawParams.loanToken.toLowerCase(),
    );
    expect(result.collateralToken.toLowerCase()).toBe(
      rawParams.collateralToken.toLowerCase(),
    );
    expect(result.lltv).toBe(rawParams.lltv);
  });

  test("error: RPC returns params for another market", async () => {
    const requestedId = MarketUtils.getMarketId(rawMarketParams(102));
    const receivedParams = rawMarketParams(103);
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: addressesRegistry[ChainId.EthMainnet].blue,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: marketParamsTuple(receivedParams),
    });

    await expect(
      fetchMarketParams(requestedId, handle.client),
    ).rejects.toBeInstanceOf(MarketParamsIdMismatchError);
  });

  test("behavior: accepts all-zero params for an uncreated market", async () => {
    const zeroParams: IMarketParams = {
      loanToken: "0x0000000000000000000000000000000000000000",
      collateralToken: "0x0000000000000000000000000000000000000000",
      oracle: "0x0000000000000000000000000000000000000000",
      irm: "0x0000000000000000000000000000000000000000",
      lltv: 0n,
    };
    const handle = createMockClient(mainnet);
    const requestedId = MarketUtils.getMarketId(rawMarketParams(104));
    mockRead(handle, {
      address: addressesRegistry[ChainId.EthMainnet].blue,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: marketParamsTuple(zeroParams),
    });

    const params = await fetchMarketParams(requestedId, handle.client);

    expect(params.id).toBe(MarketUtils.getMarketId(zeroParams));
  });
});
