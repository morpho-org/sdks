import { describe, expect, test } from "vitest";

import {
  addresses,
  baseMarket,
  baseMarketInput,
} from "../__test__/fixtures.js";
import { MarketUtils } from "./MarketUtils.js";

describe("Market", () => {
  test("default", () => {
    const market = baseMarket();

    expect(market.toStruct().collateralParams[0]!.token).toBe(
      addresses.collateralToken,
    );
    expect(Object.isFrozen(market)).toBe(true);
  });

  test("error: invalid bigint input", () => {
    expect(() =>
      MarketUtils.toId({
        market: baseMarketInput(),
        chainId: "not-a-number",
        midnight: addresses.midnight,
      }),
    ).toThrow(SyntaxError);
  });
});

describe("MarketUtils", () => {
  test("default", () => {
    expect(MarketUtils.isLltvAllowed(770000000000000000n)).toBe(true);
    expect(MarketUtils.isLltvAllowed(123n)).toBe(false);
    expect(MarketUtils.getMaxSettlementFee(0)).toBe(14_000000000000n);
    expect(MarketUtils.getMaxLif(770000000000000000n)).toBe(
      1061007957559681697n,
    );
  });

  test("behavior: hash and id are deterministic", () => {
    expect(MarketUtils.hashMarket(baseMarketInput())).toMatchInlineSnapshot(
      `"0x1d1d0f30775dfa091c9b5ccd9e8ecfe512d65d99c2c503d3adca520b494db8db"`,
    );
    expect(
      MarketUtils.toId({
        market: baseMarketInput(),
        chainId: 8453n,
        midnight: addresses.midnight,
      }),
    ).toMatchInlineSnapshot(
      `"0xfc05bd0e11cc188fc51ebf82b7be4398e83ecebf3a6450a427c4b4305be77895"`,
    );
  });
});
