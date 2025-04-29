import _ from "lodash";
import { parseEther, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, tokenB, userA, userB } from "../../fixtures.js";

const type = "Paraswap_Sell";

describe(type, () => {
  const amount = parseUnits("1", 6);
  const quotedAmount = parseEther("1");

  test("should sell", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          dstToken: tokenB,
          amount,
          quotedAmount,
          receiver: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userA]![tokenB]!.balance += quotedAmount;

    expect(result).toEqual(expected);
  });

  test("should sell entire balance", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          dstToken: tokenB,
          amount,
          quotedAmount,
          receiver: userA,
          sellEntireBalance: true,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.balance = 0n;
    expected.holdings[userA]![tokenB]!.balance +=
      dataFixture.holdings[userB]![tokenA]!.balance * 10n ** 12n;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: tokenA,
          args: {
            dstToken: tokenB,
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
