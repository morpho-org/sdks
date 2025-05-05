import _ from "lodash";
import { concat, padHex, parseEther, parseUnits, zeroAddress } from "viem";

import { DEFAULT_SLIPPAGE_TOLERANCE, MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, tokenB, userA, userB } from "../../fixtures.js";

const type = "Paraswap_Buy";

describe(type, () => {
  const amount = parseUnits("1", 6);
  const quotedAmount = parseEther("1");

  test("should buy", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          srcToken: tokenB,
          amount,
          quotedAmount,
          receiver: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenB]!.balance -= quotedAmount;
    expected.holdings[userA]![tokenA]!.balance += amount;

    expect(result).toEqual(expected);
  });

  test("should buy with calldata", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          srcToken: tokenB,
          amount,
          swap: {
            to: zeroAddress,
            data: concat([
              padHex(`0x${amount.toString(16)}`, { size: 32 }),
              padHex(`0x${quotedAmount.toString(16)}`, { size: 32 }),
            ]),
            offsets: {
              exactAmount: 0,
              limitAmount: 0,
              quotedAmount: 32,
            },
          },
          receiver: userA,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenB]!.balance -= MathLib.wMulDown(
      quotedAmount,
      MathLib.WAD - DEFAULT_SLIPPAGE_TOLERANCE,
    );
    expected.holdings[userA]![tokenA]!.balance += amount;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: tokenB,
          args: {
            srcToken: tokenA,
            amount,
            quotedAmount,
            receiver: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"]`,
    );
  });
});
