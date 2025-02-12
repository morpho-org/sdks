import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA2,
  tokenA,
  userA,
  userB,
} from "../../fixtures.js";

const type = "Blue_Supply";

const { morpho } = addresses[ChainId.EthMainnet];

const assets = parseUnits("10", 6);
const shares = parseUnits("10", 6 + 6);

describe(type, () => {
  test("should supply assets", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += assets;
    expected.markets[marketA1.id]!.totalSupplyShares += shares;
    expected.positions[userA]![marketA1.id]!.supplyShares += shares;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho -= assets;

    expect(result).toEqual(expected);
  });

  test("should supply shares", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          shares,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += assets;
    expected.markets[marketA1.id]!.totalSupplyShares += shares;
    expected.positions[userA]![marketA1.id]!.supplyShares += shares;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho -= assets;

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
            onBehalf: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: invalid input: assets=-1]`);
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
            onBehalf: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: invalid input: shares=-1]`);
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
      `[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"]`,
    );
  });

  test("should supply & withdraw in callback", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userA,
          callback: () => [
            {
              type: "Blue_Withdraw",
              sender: userA,
              address: morpho,
              args: {
                id: marketA2.id,
                assets,
                onBehalf: userA,
                receiver: userA,
              },
            },
          ],
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA2.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA2.id]!.totalSupplyShares -= shares;
    expected.positions[userA]![marketA2.id]!.supplyShares -= shares;

    expected.markets[marketA1.id]!.totalSupplyAssets += assets;
    expected.markets[marketA1.id]!.totalSupplyShares += shares;
    expected.positions[userA]![marketA1.id]!.supplyShares += shares;

    expected.holdings[userA]![tokenA]!.erc20Allowances.morpho -= assets;

    expect(result).toEqual(expected);
  });

  test("should bubble up error in supply callback", () => {
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
                type: "Blue_Withdraw",
                sender: userB,
                address: morpho,
                args: {
                  id: marketA1.id,
                  assets: assets,
                  onBehalf: userB,
                  receiver: userB,
                },
              },
            ],
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient position for user 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd]`,
    );
  });
});
