import _ from "lodash";
import { parseUnits } from "viem";

import { BlueErrors } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import {
  BlueSimulationErrors,
  SimulationErrors,
  simulateOperation,
} from "../../../../src/index.js";
import { dataFixture, marketA1, tokenA, userA, userB } from "../../fixtures.js";

const type = "Blue_Borrow";

const marketData = dataFixture.getMarket(marketA1.id);

describe(type, () => {
  const assets = parseUnits("10", 6);
  const shares = parseUnits("10", 6 + 6);

  test("should borrow assets", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userB,
          receiver: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.getMarket(marketA1.id).totalBorrowAssets += assets;
    expected.getMarket(marketA1.id).totalBorrowShares += shares;
    expected.getPosition(userB, marketA1.id).borrowShares += shares;
    expected.getHolding(userA, tokenA).balance += assets;

    expect(result).toEqual(expected);
  });

  test("should borrow shares", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          shares,
          onBehalf: userB,
          receiver: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.getMarket(marketA1.id).totalBorrowAssets += assets;
    expected.getMarket(marketA1.id).totalBorrowShares += shares;
    expected.getPosition(userB, marketA1.id).borrowShares += shares;
    expected.getHolding(userA, tokenA).balance += assets;

    expect(result).toEqual(expected);
  });

  test("should throw if assets is negative", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets: -1n,
            onBehalf: userB,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(new SimulationErrors.InvalidInput({ assets: -1n }));
  });

  test("should throw if shares is negative", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            shares: -1n,
            onBehalf: userB,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(new SimulationErrors.InvalidInput({ shares: -1n }));
  });

  test("should throw if insufficient liquidity", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets: marketData.totalSupplyAssets,
            onBehalf: userB,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(new BlueErrors.InsufficientLiquidity(marketA1.id));
  });

  test("should throw if insufficient position", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userA,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new BlueSimulationErrors.InsufficientCollateral(userA, marketA1.id),
    );
  });
});
