import { describe, expect, test } from "vitest";

import {
  addresses,
  baseMarket,
  baseMarketParams,
  baseMarketParamsInput,
  chainId,
  marketId,
} from "../__test__/fixtures.js";
import {
  CBP,
  LIQUIDATION_CURSOR_HIGH,
  LIQUIDATION_CURSOR_LOW,
  SETTLEMENT_FEE_BREAKPOINTS,
} from "../constants.js";
import { MarketParams } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

describe("CollateralParams", () => {
  test("behavior: normalized by MarketParams", () => {
    const params = baseMarketParams();

    expect(params.collateralParams[0]).toEqual({
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      maxLif: 1061007957559681697n,
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
    expect(
      MarketUtils.getLiquidationIncentiveFactor(
        770000000000000000n,
        LIQUIDATION_CURSOR_LOW,
      ),
    ).toBe(1061007957559681697n);
    expect(
      MarketUtils.getLiquidationIncentiveFactor(
        { lltv: 770000000000000000n },
        LIQUIDATION_CURSOR_HIGH,
      ),
    ).toBe(1129943502824858757n);
    expect(
      MarketUtils.getSettlementFee({
        settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
        timeToMaturity: 0n,
      }),
    ).toBe(1n * CBP);
    expect(
      MarketUtils.getSettlementFee({
        settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
        timeToMaturity: SETTLEMENT_FEE_BREAKPOINTS[1]! / 2n,
      }),
    ).toBe(1500000000000n);
    expect(
      MarketUtils.getSettlementFee({
        settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
        timeToMaturity: SETTLEMENT_FEE_BREAKPOINTS[6]! + 1n,
      }),
    ).toBe(7n * CBP);
  });

  test("behavior: hash and id are deterministic", () => {
    expect(MarketUtils.hash(baseMarketParamsInput())).toMatchInlineSnapshot(
      `"0xa0dfe829d404251173c3ca4c9da385b1d08459a8c4dee1bc86a8d747e241b653"`,
    );
    expect(MarketUtils.hash(baseMarket())).toMatchInlineSnapshot(
      `"0xa0dfe829d404251173c3ca4c9da385b1d08459a8c4dee1bc86a8d747e241b653"`,
    );
    expect(
      MarketUtils.toId({
        market: baseMarketParamsInput(),
        chainId,
      }),
    ).toMatchInlineSnapshot(
      `"0xf922c8934f33a203afd0546f9b7870f69b287a2204f2a90313e36171749409be"`,
    );
  });
});
