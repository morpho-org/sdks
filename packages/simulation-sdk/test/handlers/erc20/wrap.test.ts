import _ from "lodash";
import { parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { tokenA, tokenB, userA, userB, wrapFixtures } from "../../fixtures.js";

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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: unknown wrapped token "0x1111111111111111111111111111111111111111"

      when simulating operation:
      {
        "type": "Erc20_Wrap",
        "sender": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        "address": "0x1111111111111111111111111111111111111111",
        "args": {
          "amount": "1000000n",
          "owner": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
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
            owner: userA,
          },
        },
        wrapFixtures,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"

      when simulating operation:
      {
        "type": "Erc20_Wrap",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "address": "0x2222222222222222222222222222222222222222",
        "args": {
          "amount": "1000000n",
          "owner": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
        }
      }]
    `,
    );
  });
});
