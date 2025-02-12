import _ from "lodash";
import { parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { tokenA, tokenB, userA, userB, wrapFixtures } from "../../fixtures.js";

const type = "Erc20_Unwrap";

describe(type, () => {
  const amount = parseUnits("1", 18);

  test("should unwrap", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenB,
        args: {
          amount,
          receiver: userA, // Replaced with sender because not ERC20Wrapper.
        },
      },
      wrapFixtures,
    );

    const expected = _.cloneDeep(wrapFixtures);
    expected.holdings[userB]![tokenB]!.balance -= amount;
    expected.holdings[userB]![tokenA]!.balance += parseUnits("1", 6);

    expect(result).toEqual(expected);
  });

  test("should throw if unwrapped token", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: tokenA,
          args: {
            amount,
            receiver: userA,
          },
        },
        wrapFixtures,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: unknown wrapped token "0x1111111111111111111111111111111111111111"]`,
    );
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: tokenB,
          args: {
            amount,
            receiver: userA,
          },
        },
        wrapFixtures,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x2222222222222222222222222222222222222222"]`,
    );
  });
});
