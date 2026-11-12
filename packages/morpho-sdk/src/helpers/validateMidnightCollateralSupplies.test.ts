import { UnknownCollateralIndexError } from "@morpho-org/midnight-sdk";
import { maxUint128 } from "viem";
import { expect, test } from "vitest";
import { midnightMarket } from "../../test/fixtures/midnight.js";
import { InputExceedsMaxError, NonPositiveInputError } from "../types/error.js";
import { validateMidnightCollateralSupplies } from "./validateMidnightCollateralSupplies.js";

test("accepts empty supplies and valid repeated collateral indices", () => {
  for (const supplies of [
    [],
    [{ collateralIndex: 0n, assets: maxUint128 }],
    [
      { collateralIndex: 0n, assets: 1n },
      { collateralIndex: 0n, assets: 2n },
    ],
  ]) {
    expect(() =>
      validateMidnightCollateralSupplies({
        market: midnightMarket,
        field: "collateralSupplies",
        supplies,
      }),
    ).not.toThrow();
  }
});

test.each(["collateralSupplies", "collateral.supplies"])(
  "preserves the %s error prefix and validation order",
  (field) => {
    for (const assets of [0n, -1n]) {
      expect(() =>
        validateMidnightCollateralSupplies({
          market: midnightMarket,
          field,
          supplies: [{ collateralIndex: 99n, assets }],
        }),
      ).toThrow(new NonPositiveInputError(`${field}[0].assets`, assets));
    }
    expect(() =>
      validateMidnightCollateralSupplies({
        market: midnightMarket,
        field,
        supplies: [{ collateralIndex: 99n, assets: maxUint128 + 1n }],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: `${field}[0].assets`,
        value: maxUint128 + 1n,
        max: maxUint128,
      }),
    );
    expect(() =>
      validateMidnightCollateralSupplies({
        market: midnightMarket,
        field,
        supplies: [{ collateralIndex: 99n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
    expect(() =>
      validateMidnightCollateralSupplies({
        market: midnightMarket,
        field,
        supplies: [
          { collateralIndex: 0n, assets: maxUint128 },
          { collateralIndex: 0n, assets: 1n },
        ],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: `${field}(collateralIndex=0)`,
        value: maxUint128 + 1n,
        max: maxUint128,
      }),
    );
  },
);

test("checks every entry before checking aggregate sums", () => {
  expect(() =>
    validateMidnightCollateralSupplies({
      market: midnightMarket,
      field: "collateral.supplies",
      supplies: [
        { collateralIndex: 0n, assets: maxUint128 },
        { collateralIndex: 0n, assets: 1n },
        { collateralIndex: 99n, assets: 1n },
      ],
    }),
  ).toThrow(UnknownCollateralIndexError);
});
