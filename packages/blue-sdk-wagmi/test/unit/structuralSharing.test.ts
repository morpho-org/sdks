import { Market, MarketParams } from "@morpho-org/blue-sdk";
import { replaceEqualDeep } from "@tanstack/query-core";
import { describe, expect } from "vitest";
import { mergeDeepEqual } from "../../src/index.js";
import { test } from "../e2e/setup.js";

const prevMarket = new Market({
  params: new MarketParams({
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: 860000000000000000n,
    loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    oracle: "0x95DB30fAb9A3754e42423000DF27732CB2396992",
  }),
  fee: 0n,
  lastUpdate: 1727795543n,
  price: 2942555708084216647826084922n,
  rateAtTarget: 584469632n,
  totalBorrowAssets: 2977356497368n,
  totalBorrowShares: 2835315603261918002n,
  totalSupplyAssets: 3161520661952n,
  totalSupplyShares: 3030791088453168045n,
});

const newMarket = new Market({
  params: new MarketParams({
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: 860000000000000000n,
    loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    oracle: "0x95DB30fAb9A3754e42423000DF27732CB2396992",
  }),
  fee: 0n,
  lastUpdate: 1727795543n,
  price: 2942555708084216647826084922n,
  rateAtTarget: 584469632n,
  totalBorrowAssets: 2977356497368n,
  totalBorrowShares: 2835315603261918002n,
  totalSupplyAssets: 3161520661952n,
  totalSupplyShares: 3030791088453168045n,
});

describe("structuralSharing", () => {
  test("tanstack query should not be optimal with classes", () => {
    expect(replaceEqualDeep(prevMarket, newMarket)).not.toBe(prevMarket);
  });

  test("mergeDeepEqual should be optimal with classes", () => {
    const merged = mergeDeepEqual(prevMarket, newMarket);

    expect(merged).toBe(prevMarket);
    expect(Object.getPrototypeOf(merged)).toBe(
      Object.getPrototypeOf(prevMarket),
    );
    expect(Object.getOwnPropertyNames(merged)).toEqual(
      Object.getOwnPropertyNames(prevMarket),
    );
    expect(Object.getOwnPropertySymbols(merged)).toEqual(
      Object.getOwnPropertySymbols(prevMarket),
    );
    expect(Object.getOwnPropertyDescriptors(merged)).toEqual(
      Object.getOwnPropertyDescriptors(prevMarket),
    );
    // biome-ignore lint/suspicious/noPrototypeBuiltins: inside test
    expect(merged.constructor.prototype.isPrototypeOf(prevMarket)).toBe(true);
  });

  test("mergeDeepEqual should update reference if at least one reference changed", () => {
    newMarket.fee = 1n;

    const merged = mergeDeepEqual(prevMarket, newMarket);

    expect(merged).not.toBe(prevMarket);
    expect(merged.params).toBe(prevMarket.params);
    expect(Object.getPrototypeOf(merged)).toBe(
      Object.getPrototypeOf(prevMarket),
    );
    expect(Object.getOwnPropertyNames(merged)).toEqual(
      Object.getOwnPropertyNames(prevMarket),
    );
    expect(Object.getOwnPropertySymbols(merged)).toEqual(
      Object.getOwnPropertySymbols(prevMarket),
    );
    // biome-ignore lint/suspicious/noPrototypeBuiltins: inside test
    expect(merged.constructor.prototype.isPrototypeOf(prevMarket)).toBe(true);
  });

  test("mergeDeepEqual should work with arrays", () => {
    newMarket.fee = 1n;

    const merged = mergeDeepEqual([prevMarket], [newMarket])[0]!;

    expect(merged).not.toBe(prevMarket);
    expect(merged.params).toBe(prevMarket.params);
    expect(Object.getPrototypeOf(merged)).toBe(
      Object.getPrototypeOf(prevMarket),
    );
    expect(Object.getOwnPropertyNames(merged)).toEqual(
      Object.getOwnPropertyNames(prevMarket),
    );
    expect(Object.getOwnPropertySymbols(merged)).toEqual(
      Object.getOwnPropertySymbols(prevMarket),
    );
    // biome-ignore lint/suspicious/noPrototypeBuiltins: inside test
    expect(merged.constructor.prototype.isPrototypeOf(prevMarket)).toBe(true);
  });

  test("mergeDeepEqual should update reference if b is a subset of a", () => {
    const b = {
      property1: "property1",
      property2: "property2",
    };
    const a = { ...b, property3: "property3" };

    const merged = mergeDeepEqual(a, b);

    expect(merged).not.toBe(a);
    expect(merged).not.toBe(b);
    expect(merged).toEqual(b);
  });
});
