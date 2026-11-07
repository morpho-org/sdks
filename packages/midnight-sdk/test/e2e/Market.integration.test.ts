import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { midnightAbi } from "../../src/abis.js";
import { fetchMarket, fetchMarketParams } from "../../src/fetch/Market.js";
import { MarketUtils } from "../../src/market/MarketUtils.js";
import { midnightMarket } from "./fixtures.js";
import { test } from "./setup.js";

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");

describe("fetchMarketParams on fork", () => {
  test("returns the params whose hash is the requested market id", async ({
    client,
  }) => {
    const params = await fetchMarketParams(client, {
      marketId: midnightMarket.id,
    });

    expect(params.chainId).toBe(BigInt(ChainId.BaseMainnet));
    expect(params.midnight).toBe(midnight);
    expect(params.collateralParams.length).toBeGreaterThan(0);
    expect(MarketUtils.toId(params)).toBe(midnightMarket.id);
  });
});

describe("fetchMarket on fork", () => {
  test("hydrates the requested market with its onchain state", async ({
    client,
  }) => {
    const [market, params, state] = await Promise.all([
      fetchMarket(client, { marketId: midnightMarket.id }),
      fetchMarketParams(client, { marketId: midnightMarket.id }),
      readContract(client, {
        address: midnight,
        abi: midnightAbi,
        functionName: "marketState",
        args: [midnightMarket.id],
      }),
    ]);
    const outputs = midnightAbi.find(
      (item) => item.type === "function" && item.name === "marketState",
    )!.outputs;
    const raw = Object.fromEntries(
      outputs.map(({ name }, i) => [name, state[i]]),
    );

    expect(market.id).toBe(midnightMarket.id);
    expect(market.params).toEqual(params);
    expect(market.totalUnits).toBeGreaterThan(0n);
    expect({
      totalUnits: market.totalUnits,
      lossFactor: market.lossFactor,
      withdrawable: market.withdrawable,
      continuousFeeCredit: market.continuousFeeCredit,
      settlementFeeCbps: market.settlementFeeCbps,
      continuousFee: market.continuousFee,
      tickSpacing: market.tickSpacing,
    }).toEqual({
      totalUnits: raw.totalUnits,
      lossFactor: raw.lossFactor,
      withdrawable: raw.withdrawable,
      continuousFeeCredit: raw.continuousFeeCredit,
      settlementFeeCbps: [0, 1, 2, 3, 4, 5, 6].map(
        (i) => raw[`settlementFeeCbp${i}`],
      ),
      continuousFee: raw.continuousFee,
      tickSpacing: raw.tickSpacing,
    });
  });
});
