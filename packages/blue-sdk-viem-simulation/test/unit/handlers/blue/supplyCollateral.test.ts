import _ from "lodash";
import { parseUnits } from "viem";

import {
  BlueErrors,
  ChainId,
  SharesMath,
  addresses,
} from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import {
  Erc20Errors,
  SimulationErrors,
  simulateOperation,
} from "../../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA3,
  marketB3,
  userA,
  userB,
  userC,
} from "../../fixtures.js";

const type = "Blue_SupplyCollateral";

const { morpho } = addresses[ChainId.EthMainnet];

const assets = parseUnits("1000", 18);

describe(type, () => {
  test("should supply collateral", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: { id: marketA1.id, assets, onBehalf: userA },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.positions[userA]![marketA1.id]!.collateral += assets;
    expected.holdings[userB]![marketA1.config.collateralToken]!.balance -=
      assets;
    expected.holdings[userB]![
      marketA1.config.collateralToken
    ]!.erc20Allowances.morpho -= assets;

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
          },
        },
        dataFixture,
      ),
    ).toThrow(new SimulationErrors.InvalidInput({ assets: -1n }));
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new Erc20Errors.InsufficientBalance(
        marketA1.config.collateralToken,
        userA,
      ),
    );
  });

  test("should supply collateral & borrow in callback", () => {
    const collateral = parseUnits("150", 6);
    const borrowShares = collateral * SharesMath.VIRTUAL_SHARES;

    const result = simulateOperation(
      {
        type,
        sender: userC,
        args: {
          id: marketB3.id,
          assets: collateral,
          onBehalf: userC,
          callback: () => [
            {
              type: "Blue_Borrow",
              sender: userC,
              address: morpho,
              args: {
                id: marketA3.id,
                assets: collateral,
                onBehalf: userC,
                receiver: userC,
              },
            },
          ],
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA3.id]!.totalBorrowAssets += collateral;
    expected.markets[marketA3.id]!.totalBorrowShares += borrowShares;

    expected.positions[userC]![marketB3.id]!.collateral += collateral;
    expected.positions[userC]![marketA3.id]!.borrowShares += borrowShares;

    expected.holdings[userC]![
      marketB3.config.collateralToken
    ]!.erc20Allowances.morpho -= collateral;

    expect(result).toEqual(expected);
  });

  test("should bubble up error in supply collateral callback", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userA,
            callback: () => [
              {
                type: "Blue_Borrow",
                sender: userA,
                address: morpho,
                args: {
                  id: marketA1.id,
                  assets: assets,
                  onBehalf: userA,
                  receiver: userA,
                },
              },
            ],
          },
        },
        dataFixture,
      ),
    ).toThrow(new BlueErrors.InsufficientLiquidity(marketA1.id));
  });
});
