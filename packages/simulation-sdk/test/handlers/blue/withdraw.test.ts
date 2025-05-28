import _ from "lodash";
import { parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, marketA1, tokenA, userA, userB } from "../../fixtures.js";

const type = "Blue_Withdraw";

const marketData = dataFixture.markets[marketA1.id]!;
const userAMarketData = dataFixture.positions[userA]![marketA1.id]!;

const assets = parseUnits("10", 6);
const shares = parseUnits("10", 6 + 6);

describe(type, () => {
  test("should withdraw assets", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA1.id]!.totalSupplyShares -= shares;
    expected.positions[userA]![marketA1.id]!.supplyShares -= shares;
    expected.holdings[userB]![tokenA]!.balance += assets;

    expect(result).toEqual(expected);
  });

  test("should withdraw shares", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          id: marketA1.id,
          shares,
          onBehalf: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA1.id]!.totalSupplyShares -= shares;
    expected.positions[userA]![marketA1.id]!.supplyShares -= shares;
    expected.holdings[userB]![tokenA]!.balance += assets;

    expect(result).toEqual(expected);
  });

  test("should throw if assets is negative", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            assets: -1n,
            onBehalf: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: invalid input: assets=-1

      when simulating operation:
      {
        "type": "Blue_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "-1n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `);
  });

  test("should throw if shares is negative", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            shares: -1n,
            onBehalf: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: invalid input: shares=-1

      when simulating operation:
      {
        "type": "Blue_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "shares": "-1n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `);
  });

  test("should throw if insufficient liquidity", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            assets: marketData.totalSupplyAssets,
            onBehalf: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient liquidity on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd

      when simulating operation:
      {
        "type": "Blue_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "10750000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `,
    );
  });

  test("should throw if insufficient balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            shares: userAMarketData.supplyShares + 1n,
            onBehalf: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient position for user 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd

      when simulating operation:
      {
        "type": "Blue_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "shares": "10000000000001n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `,
    );
  });
});
