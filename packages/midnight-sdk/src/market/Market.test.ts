import { MathLib } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { numberToHex } from "viem";
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
  MAX_COLLATERALS,
  SETTLEMENT_FEE_BREAKPOINTS,
} from "../constants.js";
import { InvalidMarketParameterError } from "../errors.js";
import { MarketParams } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

const liquidationCursorLow = 250000000000000000n;
const liquidationCursorHigh = 500000000000000000n;

describe("CollateralParams", () => {
  test("behavior: normalized by MarketParams", () => {
    const params = baseMarketParams();

    expect(params.collateralParams[0]).toEqual({
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      liquidationCursor: liquidationCursorLow,
      oracle: addresses.oracle,
    });
  });
});

describe("MarketParams", () => {
  test("default", () => {
    const params = new MarketParams(baseMarketParamsInput());

    expect(params.chainId).toBe(BigInt(chainId));
    expect(params.midnight).toBe(addresses.midnight);
    expect(params.loanToken).toBe(addresses.loanToken);
    expect(params.collateralParams[0]!.token).toBe(addresses.collateralToken);
  });

  test("behavior: from returns existing params and converts market input", () => {
    const params = baseMarketParams();

    expect(MarketParams.from(params)).toBe(params);
    expect(MarketParams.from(baseMarket()).loanToken).toBe(addresses.loanToken);
  });

  test("behavior: sorts collateral params by token", () => {
    const params = new MarketParams({
      ...baseMarketParamsInput(),
      collateralParams: [
        {
          token: addresses.receiver,
          lltv: 222n,
          liquidationCursor: 2n,
          oracle: addresses.oracle,
        },
        {
          token: addresses.taker,
          lltv: 111n,
          liquidationCursor: 1n,
          oracle: addresses.oracle,
        },
        {
          token: addresses.callback,
          lltv: 333n,
          liquidationCursor: 3n,
          oracle: addresses.oracle,
        },
      ],
    });

    expect(
      params.collateralParams.map((collateral) => collateral.token),
    ).toEqual([addresses.taker, addresses.receiver, addresses.callback]);
    expect(params.collateralParams[0]!.lltv).toBe(111n);
  });

  test("error: InvalidMarketParameterError for duplicate collateral tokens", () => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: [
            {
              token: addresses.taker,
              lltv: 111n,
              liquidationCursor: 1n,
              oracle: addresses.oracle,
            },
            {
              token: addresses.taker.toLowerCase() as `0x${string}`,
              lltv: 444n,
              liquidationCursor: 4n,
              oracle: addresses.oracle,
            },
          ],
        }),
    ).toThrow(InvalidMarketParameterError);
  });

  test("error: InvalidMarketParameterError for empty collateral params", () => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: [],
        }),
    ).toThrow(InvalidMarketParameterError);
  });

  test("error: InvalidMarketParameterError for too many collateral params", () => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: Array.from(
            { length: Number(MAX_COLLATERALS) + 1 },
            (_, index) => ({
              token: numberToHex(index + 1, { size: 20 }) as Address,
              lltv: 770000000000000000n,
              liquidationCursor: liquidationCursorLow,
              oracle: addresses.oracle,
            }),
          ),
        }),
    ).toThrow(InvalidMarketParameterError);
  });

  test.each([
    -1n,
    MathLib.WAD + 1n,
  ])("error: InvalidMarketParameterError for lltv %s", (lltv) => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: [
            {
              ...baseMarketParamsInput().collateralParams[0]!,
              lltv,
            },
          ],
        }),
    ).toThrow(InvalidMarketParameterError);
  });

  test.each([
    -1n,
    MathLib.WAD,
  ])("error: InvalidMarketParameterError for liquidation cursor %s", (liquidationCursor) => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: [
            {
              ...baseMarketParamsInput().collateralParams[0]!,
              liquidationCursor,
            },
          ],
        }),
    ).toThrow(InvalidMarketParameterError);
  });

  test.each([
    {
      name: "computed max LIF above 2 WAD",
      lltv: 0n,
      liquidationCursor: MathLib.WAD - 1n,
    },
    {
      name: "computed max LIF product above protocol bound",
      lltv: 999000000000000000n,
      liquidationCursor: MathLib.WAD / 2n,
    },
  ])("error: InvalidMarketParameterError for $name", ({
    lltv,
    liquidationCursor,
  }) => {
    expect(
      () =>
        new MarketParams({
          ...baseMarketParamsInput(),
          collateralParams: [
            {
              ...baseMarketParamsInput().collateralParams[0]!,
              lltv,
              liquidationCursor,
            },
          ],
        }),
    ).toThrow(InvalidMarketParameterError);
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
      MarketUtils.toCollateralParams({
        token: addresses.collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: "not-a-number",
        oracle: addresses.oracle,
      }),
    ).toThrow(InvalidMarketParameterError);
  });
});

describe("MarketUtils", () => {
  test("default", () => {
    expect(
      MarketUtils.toCollateralParams({
        token: addresses.collateralToken,
        lltv: "770000000000000000",
        liquidationCursor: `${liquidationCursorLow}`,
        oracle: addresses.oracle,
      }),
    ).toEqual({
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      liquidationCursor: liquidationCursorLow,
      oracle: addresses.oracle,
    });
    expect(
      MarketUtils.getLiquidationIncentiveFactor(
        770000000000000000n,
        liquidationCursorLow,
      ),
    ).toBe(1061007957559681697n);
    expect(
      MarketUtils.getLiquidationIncentiveFactor(
        { lltv: 770000000000000000n },
        liquidationCursorHigh,
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

  test("behavior: toStruct returns a copied ABI object", () => {
    const params = baseMarketParams();
    const struct = MarketUtils.toStruct(params);

    expect(struct).toEqual({
      chainId: params.chainId,
      midnight: params.midnight,
      loanToken: params.loanToken,
      collateralParams: params.collateralParams,
      maturity: params.maturity,
      rcfThreshold: params.rcfThreshold,
      enterGate: params.enterGate,
      liquidatorGate: params.liquidatorGate,
    });
    expect(struct).not.toBe(params);
    expect(struct).not.toBeInstanceOf(MarketParams);
    expect(struct.collateralParams).not.toBe(params.collateralParams);
    expect(struct.collateralParams[0]).not.toBe(params.collateralParams[0]);
  });

  test("behavior: hash and id are deterministic", () => {
    expect(MarketUtils.hash(baseMarketParamsInput())).toMatchInlineSnapshot(
      `"0xa3a2c32022b41a9af871628bdf7bd128cf4113f449cae01d4286d3a184209383"`,
    );
    expect(MarketUtils.hash(baseMarket())).toMatchInlineSnapshot(
      `"0xa3a2c32022b41a9af871628bdf7bd128cf4113f449cae01d4286d3a184209383"`,
    );
    expect(MarketUtils.toId(baseMarketParamsInput())).toMatchInlineSnapshot(
      `"0xb84c376e254e575fc4bbf9f612bc68719f73d9ac8c99c02122c705d9baa15417"`,
    );
  });

  test("behavior: hash sorts collateral params by token", () => {
    const market = {
      ...baseMarketParamsInput(),
      collateralParams: [
        {
          token: addresses.receiver,
          lltv: 222n,
          liquidationCursor: 2n,
          oracle: addresses.oracle,
        },
        {
          token: addresses.taker,
          lltv: 111n,
          liquidationCursor: 1n,
          oracle: addresses.oracle,
        },
        {
          token: addresses.callback,
          lltv: 333n,
          liquidationCursor: 3n,
          oracle: addresses.oracle,
        },
      ],
    };

    expect(MarketUtils.hash(market)).toBe(
      MarketUtils.hash(new MarketParams(market)),
    );
    expect(market.collateralParams[0]!.token).toBe(addresses.receiver);
  });
});
