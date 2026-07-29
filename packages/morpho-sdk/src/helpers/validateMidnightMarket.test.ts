import { MarketParams } from "@morpho-org/midnight-sdk";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  MidnightMarketAddressMismatchError,
} from "../types/index.js";
import { validateMidnightMarket } from "./validateMidnightMarket.js";

describe("validateMidnightMarket", () => {
  test("default", () => {
    expect(() =>
      validateMidnightMarket({
        market: midnightMarket,
        chainId: midnightChainId,
      }),
    ).not.toThrow();
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      validateMidnightMarket({
        market: new MarketParams({
          ...midnightMarket,
          chainId: midnightChainId + 1,
        }),
        chainId: midnightChainId,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: MidnightMarketAddressMismatchError", () => {
    expect(() =>
      validateMidnightMarket({
        market: new MarketParams({
          ...midnightMarket,
          midnight: midnightAddresses.taker,
        }),
        chainId: midnightChainId,
      }),
    ).toThrow(MidnightMarketAddressMismatchError);
  });
});
