import { MathLib } from "@morpho-org/blue-sdk";
import _ from "lodash";
import { parseEther, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { getWrappedInstanceOf, SimulationErrors } from "../../../src/errors.js";
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

  test("should book worst-case shares from minSharePrice floor in asset-mode with positive slippage", () => {
    const slippage = parseEther("0.2");
    const partialAssets = parseUnits("5", 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          id: marketA1.id,
          assets: partialAssets,
          onBehalf: userA,
          receiver: userB,
          slippage,
        },
      },
      dataFixture,
    );

    const accruedMarket = _.cloneDeep(marketData).accrueInterest(
      dataFixture.block.timestamp,
    );
    const expectedShares = MathLib.wDivUp(
      accruedMarket.toSupplyShares(partialAssets),
      MathLib.WAD - slippage,
    );

    // Onchain `minSharePrice = WAD - slippage` lets the user burn up to
    // ~125% of the nominal shares (1 / (1 - 0.2)). The pre-fix simulator only
    // booked ~120% (1 + 0.2), under-debiting the supply position.
    const optimisticShares = MathLib.wMulUp(
      accruedMarket.toSupplyShares(partialAssets),
      MathLib.WAD + slippage,
    );
    expect(expectedShares).toBeGreaterThan(optimisticShares);

    expect(result.getMarket(marketA1.id).totalSupplyShares).toBe(
      accruedMarket.totalSupplyShares - expectedShares,
    );
    expect(result.getMarket(marketA1.id).totalSupplyAssets).toBe(
      accruedMarket.totalSupplyAssets - partialAssets,
    );
    expect(result.getPosition(userA, marketA1.id).supplyShares).toBe(
      dataFixture.positions[userA]![marketA1.id]!.supplyShares - expectedShares,
    );
    expect(result.getHolding(userB, tokenA).balance).toBe(
      dataFixture.holdings[userB]![tokenA]!.balance + partialAssets,
    );
  });

  test("should book worst-case assets from minSharePrice floor in share-mode with positive slippage", () => {
    const slippage = parseEther("0.2");
    const partialShares = parseUnits("8", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          id: marketA1.id,
          shares: partialShares,
          onBehalf: userA,
          receiver: userB,
          slippage,
        },
      },
      dataFixture,
    );

    const accruedMarket = _.cloneDeep(marketData).accrueInterest(
      dataFixture.block.timestamp,
    );
    const expectedAssets = accruedMarket.toSupplyAssets(
      MathLib.wMulDown(partialShares, MathLib.WAD - slippage),
    );

    // The pre-fix simulator credited ~shares / (1 + slippage) assets, which
    // is strictly more than the onchain floor of `shares * (1 - slippage)`.
    const optimisticAssets = accruedMarket.toSupplyAssets(
      MathLib.wDivDown(partialShares, MathLib.WAD + slippage),
    );
    expect(expectedAssets).toBeLessThan(optimisticAssets);

    expect(result.getMarket(marketA1.id).totalSupplyShares).toBe(
      accruedMarket.totalSupplyShares - partialShares,
    );
    expect(result.getMarket(marketA1.id).totalSupplyAssets).toBe(
      accruedMarket.totalSupplyAssets - expectedAssets,
    );
    expect(result.getPosition(userA, marketA1.id).supplyShares).toBe(
      dataFixture.positions[userA]![marketA1.id]!.supplyShares - partialShares,
    );
    expect(result.getHolding(userB, tokenA).balance).toBe(
      dataFixture.holdings[userB]![tokenA]!.balance + expectedAssets,
    );
  });

  test("should throw on slippage equal to WAD", () => {
    let caught: unknown;
    try {
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            id: marketA1.id,
            assets,
            onBehalf: userA,
            receiver: userB,
            slippage: MathLib.WAD,
          },
        },
        dataFixture,
      );
    } catch (err) {
      caught = err;
    }

    expect(
      getWrappedInstanceOf(caught, SimulationErrors.InvalidInput),
    ).toBeDefined();
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
