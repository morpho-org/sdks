import _ from "lodash";
import { parseEther, parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, marketA1, tokenB, userA, userB } from "../../fixtures.js";

const type = "Blue_Paraswap_BuyDebt";

const priceE27 = parseUnits("4", 27 + 12);

describe(type, () => {
  test("should buy debt", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        args: {
          id: marketA1.id,
          srcToken: tokenB,
          priceE27,
          onBehalf: userB,
          receiver: userA,
        },
      },
      dataFixture,
    );

    const debtAmount = parseUnits("10", 6);
    const quotedAmount = parseEther("40");

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenB]!.balance -= quotedAmount;
    expected.holdings[userA]![marketA1.params.loanToken]!.balance += debtAmount;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient balance", () => {
    const _dataFixture = _.cloneDeep(dataFixture);
    _dataFixture.holdings[userB]![tokenB]!.balance = 0n;

    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          args: {
            id: marketA1.id,
            srcToken: tokenB,
            priceE27,
            onBehalf: userB,
            receiver: userA,
          },
        },
        _dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient balance of user "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" for token "0x2222222222222222222222222222222222222222"]`,
    );
  });
});
