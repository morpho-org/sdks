import { MathLib } from "@morpho-org/blue-sdk";
import _ from "lodash";
import { parseEther, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
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
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: invalid input: assets=-1

      when simulating operation:
      {
        "type": "Blue_Borrow",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "-1n",
          "onBehalf": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          "receiver": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `);
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
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: invalid input: shares=-1

      when simulating operation:
      {
        "type": "Blue_Borrow",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "shares": "-1n",
          "onBehalf": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          "receiver": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `);
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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient liquidity on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd

      when simulating operation:
      {
        "type": "Blue_Borrow",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "10750000000n",
          "onBehalf": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          "receiver": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
    );
  });

  test("should book worst-case shares from minSharePrice floor in asset-mode with positive slippage", () => {
    const slippage = parseEther("0.2");

    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          assets,
          onBehalf: userB,
          receiver: userA,
          slippage,
        },
      },
      dataFixture,
    );

    const accruedMarket = _.cloneDeep(marketData).accrueInterest(
      dataFixture.block.timestamp,
    );
    const expectedShares = MathLib.wDivUp(
      accruedMarket.toBorrowShares(assets, "Up"),
      MathLib.WAD - slippage,
    );

    // With slippage = 20%, the onchain `minSharePrice` floor still permits
    // ~125% of the expected borrow shares (1 / (1 - 0.2)). The pre-fix
    // simulator only booked ~120% (1 + 0.2), understating debt.
    const optimisticShares = MathLib.wMulUp(
      accruedMarket.toBorrowShares(assets, "Up"),
      MathLib.WAD + slippage,
    );
    expect(expectedShares).toBeGreaterThan(optimisticShares);

    expect(result.getPosition(userB, marketA1.id).borrowShares).toBe(
      dataFixture.getPosition(userB, marketA1.id).borrowShares + expectedShares,
    );
    expect(result.getMarket(marketA1.id).totalBorrowShares).toBe(
      accruedMarket.totalBorrowShares + expectedShares,
    );
    expect(result.getMarket(marketA1.id).totalBorrowAssets).toBe(
      accruedMarket.totalBorrowAssets + assets,
    );
    expect(result.getHolding(userA, tokenA).balance).toBe(
      dataFixture.getHolding(userA, tokenA).balance + assets,
    );
  });

  test("should book worst-case assets from minSharePrice floor in share-mode with positive slippage", () => {
    const slippage = parseEther("0.2");

    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          shares,
          onBehalf: userB,
          receiver: userA,
          slippage,
        },
      },
      dataFixture,
    );

    const accruedMarket = _.cloneDeep(marketData).accrueInterest(
      dataFixture.block.timestamp,
    );
    const expectedAssets = accruedMarket.toBorrowAssets(
      MathLib.wMulDown(shares, MathLib.WAD - slippage),
      "Down",
    );

    // The pre-fix simulator credited ~assets / (1 + slippage), which is
    // strictly more than the onchain floor of `assets * (1 - slippage)`.
    const optimisticAssets = accruedMarket.toBorrowAssets(
      MathLib.wDivDown(shares, MathLib.WAD + slippage),
      "Down",
    );
    expect(expectedAssets).toBeLessThan(optimisticAssets);

    expect(result.getPosition(userB, marketA1.id).borrowShares).toBe(
      dataFixture.getPosition(userB, marketA1.id).borrowShares + shares,
    );
    expect(result.getMarket(marketA1.id).totalBorrowShares).toBe(
      accruedMarket.totalBorrowShares + shares,
    );
    expect(result.getMarket(marketA1.id).totalBorrowAssets).toBe(
      accruedMarket.totalBorrowAssets + expectedAssets,
    );
    expect(result.getHolding(userA, tokenA).balance).toBe(
      dataFixture.getHolding(userA, tokenA).balance + expectedAssets,
    );
  });

  test("should throw on slippage equal to WAD", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userB,
            receiver: userA,
            slippage: MathLib.WAD,
          },
        },
        dataFixture,
      ),
    ).toThrow(/invalid input: slippage=/);
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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient collateral for user 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd

      when simulating operation:
      {
        "type": "Blue_Borrow",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd",
          "assets": "10000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
    );
  });
});
