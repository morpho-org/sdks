import _ from "lodash";
import { parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import {
  BlueSimulationErrors,
  SimulationErrors,
  simulateOperation,
} from "../../../../src/index.js";
import { dataFixture, marketA1, userA, userB } from "../../fixtures.js";

const type = "Blue_WithdrawCollateral";

const userBMarketData = dataFixture.positions[userB]![marketA1.id]!;

const assets = parseUnits("10000", 18);

describe(type, () => {
  test("should withdraw collateral", () => {
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
    // expected.cacheId = expect.any(String);
    expected.positions[userB]![marketA1.id]!.collateral -= assets;
    expected.holdings[userA]![marketA1.config.collateralToken]!.balance +=
      assets;

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

  test("should throw if insufficient balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets: userBMarketData.collateral + 1n,
            onBehalf: userB,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new BlueSimulationErrors.InsufficientPosition(userB, marketA1.id),
    );
  });

  test("should throw if not healthy", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets: userBMarketData.collateral,
            onBehalf: userB,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new BlueSimulationErrors.InsufficientCollateral(userB, marketA1.id),
    );
  });
});
