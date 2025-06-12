import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, SharesMath, addressesRegistry } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
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

const { morpho } = addressesRegistry[ChainId.EthMainnet];

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
    expected.holdings[userB]![marketA1.params.collateralToken]!.balance -=
      assets;
    expected.holdings[userB]![
      marketA1.params.collateralToken
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
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: invalid input: assets=-1

      when simulating operation:
      {
        "type": "Blue_SupplyCollateral",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "-1n",
          "onBehalf": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `);
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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0xBF3FCDD92C14a1EF02C787C379c0aA941d239Af2"

      when simulating operation:
      {
        "type": "Blue_SupplyCollateral",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "1000000000000000000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
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
      marketB3.params.collateralToken
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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient liquidity on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd

      when simulating operation:
      {
        "type": "Blue_Borrow",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "address": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "1000000000000000000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }

      in the callback of:
      {
        "type": "Blue_SupplyCollateral",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "1000000000000000000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
    );
  });
});
