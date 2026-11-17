import { expect, test } from "vitest";
import {
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightCollateralWithdrawalsError,
} from "../types/error.js";
import { validateMidnightCollateralBatch } from "./validateMidnightCollateralBatch.js";

test("accepts nonempty batches with unique collateral indexes in any order", () => {
  for (const transfers of [
    [{ collateralIndex: 0n, assets: 1n }],
    [
      { collateralIndex: 2n, assets: 1n },
      { collateralIndex: 0n, assets: 0n },
      { collateralIndex: 1n, assets: 3n },
    ],
  ]) {
    expect(() =>
      validateMidnightCollateralBatch(
        transfers,
        new EmptyMidnightCollateralSuppliesError(),
      ),
    ).not.toThrow();
  }
});

test("throws the caller's operation-specific error instance for an empty batch", () => {
  for (const emptyError of [
    new EmptyMidnightCollateralSuppliesError(),
    new EmptyMidnightCollateralWithdrawalsError(),
  ]) {
    let thrown: unknown;
    try {
      validateMidnightCollateralBatch([], emptyError);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(emptyError);
  }
});

test("rejects a repeated collateral index even when the entries are not adjacent", () => {
  const validate = () =>
    validateMidnightCollateralBatch(
      [
        { collateralIndex: 1n, assets: 1n },
        { collateralIndex: 0n, assets: 2n },
        { collateralIndex: 1n, assets: 3n },
      ],
      new EmptyMidnightCollateralWithdrawalsError(),
    );

  expect(validate).toThrow(DuplicateMidnightCollateralIndexError);
});

test("does not mutate the batch", () => {
  const transfers = Object.freeze([
    Object.freeze({ collateralIndex: 0n, assets: 1n }),
    Object.freeze({ collateralIndex: 1n, assets: 2n }),
  ]);

  validateMidnightCollateralBatch(
    transfers,
    new EmptyMidnightCollateralSuppliesError(),
  );

  expect(transfers).toEqual([
    { collateralIndex: 0n, assets: 1n },
    { collateralIndex: 1n, assets: 2n },
  ]);
});
