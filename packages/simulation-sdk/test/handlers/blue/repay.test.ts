import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA3,
  tokenA,
  userA,
  userB,
  userC,
} from "../../fixtures.js";

const type = "Blue_Repay";

const {
  morpho,
  bundler3: { generalAdapter1 },
} = addressesRegistry[ChainId.EthMainnet];
const userBMarketData = dataFixture.positions[userB]![marketA1.id]!;

const assets = parseUnits("10", 6);
const shares = parseUnits("10", 6 + 6);

describe(type, () => {
  test("should repay assets", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalBorrowAssets -= assets;
    expected.markets[marketA1.id]!.totalBorrowShares -= shares;
    expected.positions[userB]![marketA1.id]!.borrowShares -= shares;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho -= assets;

    expect(result).toEqual(expected);
  });

  test("should repay shares", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          shares,
          onBehalf: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalBorrowAssets -= assets;
    expected.markets[marketA1.id]!.totalBorrowShares -= shares;
    expected.positions[userB]![marketA1.id]!.borrowShares -= shares;
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
            onBehalf: userB,
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
            onBehalf: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: invalid input: shares=-1]`);
  });

  test("should throw if insufficient debt", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            shares: userBMarketData.borrowShares + 1n,
            onBehalf: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient position for user 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd]`,
    );
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
            onBehalf: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"]`,
    );
  });

  test("should repay & borrow in callback", () => {
    const result = simulateOperation(
      {
        type,
        sender: userC,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userC,
          callback: () => [
            {
              type: "Blue_Borrow",
              sender: userC,
              address: morpho,
              args: {
                id: marketA3.id,
                assets,
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
    expected.markets[marketA1.id]!.totalBorrowAssets -= assets;
    expected.markets[marketA1.id]!.totalBorrowShares -= shares;
    expected.positions[userC]![marketA1.id]!.borrowShares -= shares;

    expected.markets[marketA3.id]!.totalBorrowAssets += assets;
    expected.markets[marketA3.id]!.totalBorrowShares += shares;
    expected.positions[userC]![marketA3.id]!.borrowShares += shares;

    expected.holdings[userC]![tokenA]!.erc20Allowances.morpho -= assets;

    expect(result).toEqual(expected);
  });

  test("should bubble up error in repay callback", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userB,
            callback: () => [
              {
                type: "Blue_Borrow",
                sender: generalAdapter1,
                address: morpho,
                args: {
                  id: marketA1.id,
                  assets: assets,
                  onBehalf: userA,
                  receiver: userB,
                },
              },
            ],
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: unauthorized bundler for user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"]`,
    );
  });
});
