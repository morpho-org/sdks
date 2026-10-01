import { UnknownCollateralIndexError } from "@morpho-org/midnight-sdk";
import { describe, expect, test } from "vitest";
import { midnightMultiCollateralMarket as market } from "../../test/fixtures/midnight.js";
import {
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralAmountsError,
  NegativeInputError,
  NonPositiveInputError,
} from "../types/index.js";
import {
  resolveMidnightCollateralSupplies,
  resolveMidnightCollateralWithdrawals,
} from "./resolveMidnightCollateralAmounts.js";

describe("resolveMidnightCollateralSupplies", () => {
  test("default: keeps caller order", () => {
    expect(
      resolveMidnightCollateralSupplies(market, {
        collateralSupplies: [
          { collateralIndex: 1n, assets: 20n },
          { collateralIndex: 0n, assets: 10n },
        ],
      }),
    ).toEqual([
      { collateralIndex: 1n, assets: 20n },
      { collateralIndex: 0n, assets: 10n },
    ]);
  });

  test("behavior: single form maps to one entry at index 0 by default", () => {
    expect(
      resolveMidnightCollateralSupplies(market, { collateralAssets: 10n }),
    ).toEqual([{ collateralIndex: 0n, assets: 10n }]);
    expect(
      resolveMidnightCollateralSupplies(market, {
        collateralAssets: 10n,
        collateralIndex: 1n,
      }),
    ).toEqual([{ collateralIndex: 1n, assets: 10n }]);
  });

  test("error: invalid entries", () => {
    expect(() =>
      resolveMidnightCollateralSupplies(market, { collateralSupplies: [] }),
    ).toThrow(EmptyMidnightCollateralAmountsError);
    expect(() =>
      resolveMidnightCollateralSupplies(market, { collateralAssets: 0n }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      resolveMidnightCollateralSupplies(market, {
        collateralSupplies: [
          { collateralIndex: 0n, assets: 10n },
          { collateralIndex: 1n, assets: 0n },
        ],
      }),
    ).toThrow(
      new NonPositiveInputError("collateralSupplies[1].assets", 0n).message,
    );
    expect(() =>
      resolveMidnightCollateralSupplies(market, {
        collateralSupplies: [{ collateralIndex: -1n, assets: 10n }],
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      resolveMidnightCollateralSupplies(market, {
        collateralSupplies: [{ collateralIndex: 2n, assets: 10n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
    expect(() =>
      resolveMidnightCollateralSupplies(market, {
        collateralSupplies: [
          { collateralIndex: 1n, assets: 10n },
          { collateralIndex: 1n, assets: 20n },
        ],
      }),
    ).toThrow(DuplicateMidnightCollateralIndexError);
  });
});

describe("resolveMidnightCollateralWithdrawals", () => {
  test("default: keeps caller order", () => {
    expect(
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [
          { collateralIndex: 1n, assets: 20n },
          { collateralIndex: 0n, assets: 10n },
        ],
      }),
    ).toEqual([
      { collateralIndex: 1n, assets: 20n },
      { collateralIndex: 0n, assets: 10n },
    ]);
  });

  test("behavior: empty list and zero single amount withdraw nothing", () => {
    expect(
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [],
      }),
    ).toEqual([]);
    expect(
      resolveMidnightCollateralWithdrawals(market, {
        withdrawCollateralAssets: 0n,
        collateralIndex: 5n,
      }),
    ).toEqual([]);
  });

  test("error: invalid entries", () => {
    expect(() =>
      resolveMidnightCollateralWithdrawals(market, {
        withdrawCollateralAssets: -1n,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [{ collateralIndex: -1n, assets: 1n }],
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [{ collateralIndex: 2n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
    expect(() =>
      resolveMidnightCollateralWithdrawals(market, {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 1n },
        ],
      }),
    ).toThrow(DuplicateMidnightCollateralIndexError);
  });
});
