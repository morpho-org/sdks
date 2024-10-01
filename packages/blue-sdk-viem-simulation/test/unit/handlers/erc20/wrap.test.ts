import _ from "lodash";
import { parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import {
  Erc20Errors,
  UnknownWrappedTokenError,
  simulateOperation,
} from "../../../../src";
import { tokenA, tokenB, userA, userB, wrapFixtures } from "../../fixtures";

const type = "Erc20_Wrap";

describe(type, () => {
  const amount = parseUnits("1", 6);

  test("should wrap", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenB,
        args: {
          amount,
          owner: userB,
        },
      },
      wrapFixtures,
    );

    const expected = _.cloneDeep(wrapFixtures);
    // expected.cacheId = expect.any(String);
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userB]![tokenB]!.balance += parseUnits("1", 18);

    expect(result).toEqual(expected);
  });

  test("should throw if wrapped token", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: tokenA,
          args: {
            amount,
            owner: userA,
          },
        },
        wrapFixtures,
      ),
    ).toThrow(new UnknownWrappedTokenError(tokenA));
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
            owner: userA,
          },
        },
        wrapFixtures,
      ),
    ).toThrow(new Erc20Errors.InsufficientBalance(tokenA, userA));
  });
});
