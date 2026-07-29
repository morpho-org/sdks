import { MarketParams } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  NegativeInputError,
  type VaultReallocation,
} from "../../types/index.js";

const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const INVALID_REALLOCATIONS = [
  {
    vault: USER,
    fee: -1n,
    withdrawals: [],
  },
] satisfies readonly VaultReallocation[];

const makeMarket = () => {
  const { client } = createMockClient(mainnet);
  return client
    .extend(morphoViemExtension())
    .morpho.blue(CbbtcUsdcBlue, mainnet.id);
};

describe("MorphoBlue reallocation input validation", () => {
  test("withdraw error: NegativeInputError before position validation", () => {
    const market = makeMarket();

    expect(() =>
      market.withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: undefined as never,
        reallocations: INVALID_REALLOCATIONS,
      }),
    ).toThrow(NegativeInputError);
  });

  test("borrow error: NegativeInputError before position validation", () => {
    const market = makeMarket();

    expect(() =>
      market.borrow({
        amount: 1n,
        userAddress: USER,
        positionData: undefined as never,
        reallocations: INVALID_REALLOCATIONS,
      }),
    ).toThrow(NegativeInputError);
  });

  test("supplyCollateralBorrow error: NegativeInputError before position validation", () => {
    const market = makeMarket();

    expect(() =>
      market.supplyCollateralBorrow({
        amount: 1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: undefined as never,
        reallocations: INVALID_REALLOCATIONS,
      }),
    ).toThrow(NegativeInputError);
  });

  test("refinance error: NegativeInputError before position validation", () => {
    const market = makeMarket();

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData: undefined as never,
        target: {
          marketParams: new MarketParams(CbbtcUsdcBlue),
          positionData: undefined as never,
        },
        collateralAmount: 1n,
        targetReallocations: INVALID_REALLOCATIONS,
      }),
    ).toThrow(NegativeInputError);
  });
});
