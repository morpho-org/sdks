import { describe, expect, test } from "vitest";

import {
  addresses,
  baseMarket,
  baseMarketParams,
  baseMarketParamsInput,
  chainId,
  marketId,
} from "../__test__/fixtures.js";
import { CBP } from "../constants.js";
import { MarketParams } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

describe("CollateralParams", () => {
  test("behavior: normalized by MarketParams", () => {
    const params = baseMarketParams();

    expect(params.collateralParams[0]).toEqual({
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      maxLif: 1298701298701298701n,
      oracle: addresses.oracle,
    });
  });
});

describe("MarketParams", () => {
  test("default", () => {
    const params = new MarketParams(baseMarketParamsInput());

    expect(params.loanToken).toBe(addresses.loanToken);
    expect(params.collateralParams[0]!.token).toBe(addresses.collateralToken);
  });
});

describe("Market", () => {
  test("default", () => {
    const market = baseMarket();

    expect(market.chainId).toBe(BigInt(chainId));
    expect(market.id).toBe(marketId);
    expect(market.params.loanToken).toBe(addresses.loanToken);
    expect(market.totalUnits).toBe(1_000n);
    expect(market.tickSpacing).toBe(4);
  });

  test("behavior: maturity helpers", () => {
    const market = baseMarket();

    expect(market.timeToMaturity(1_500n)).toBe(500n);
    expect(market.timeToMaturity(2_001n)).toBe(0n);
  });

  test("behavior: settlement fee helpers", () => {
    const market = baseMarket();

    expect(market.getSettlementFee(0n)).toBe(1n * CBP);
    expect(market.getSettlementFee(24n * 60n * 60n)).toBe(2n * CBP);
    expect(market.getSettlementFee(360n * 24n * 60n * 60n)).toBe(7n * CBP);
  });

  test("behavior: collateral lookup helpers", () => {
    const market = baseMarket();

    expect(market.getCollateralParamsByIndex(0)?.token).toBe(
      addresses.collateralToken,
    );
    expect(market.getCollateralIndexByToken(addresses.collateralToken)).toBe(0);
    expect(
      market.getCollateralParamsByToken(addresses.collateralToken)?.lltv,
    ).toBe(770000000000000000n);
    expect(market.getCollateralParamsByIndex(1)).toBeUndefined();
  });

  test("error: invalid bigint input", () => {
    expect(() =>
      MarketUtils.toId({
        market: baseMarketParamsInput(),
        chainId: "not-a-number",
      }),
    ).toThrow(SyntaxError);
  });
});

describe("MarketUtils", () => {
  test("default", () => {
    expect(MarketUtils.isLltvAllowed(770000000000000000n)).toBe(true);
    expect(MarketUtils.isLltvAllowed(123n)).toBe(false);
    expect(MarketUtils.getMaxLif(770000000000000000n)).toBe(
      1061007957559681697n,
    );
  });

  test("behavior: hash and id are deterministic", () => {
    expect(MarketUtils.hash(baseMarketParamsInput())).toMatchInlineSnapshot(
      `"0x1d1d0f30775dfa091c9b5ccd9e8ecfe512d65d99c2c503d3adca520b494db8db"`,
    );
    expect(MarketUtils.hash(baseMarket())).toMatchInlineSnapshot(
      `"0x1d1d0f30775dfa091c9b5ccd9e8ecfe512d65d99c2c503d3adca520b494db8db"`,
    );
    expect(
      MarketUtils.toId({
        market: baseMarketParamsInput(),
        chainId,
      }),
    ).toMatchInlineSnapshot(
      `"0xfc05bd0e11cc188fc51ebf82b7be4398e83ecebf3a6450a427c4b4305be77895"`,
    );
  });
});
