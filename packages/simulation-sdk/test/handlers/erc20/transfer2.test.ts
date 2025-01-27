import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, tokenB, userA, userB } from "../../fixtures.js";

const type = "Erc20_Transfer2";

const amount = parseUnits("1", 6);
const {
  morpho,
  bundler3: { generalAdapter1 },
  permit2,
} = addresses[ChainId.EthMainnet];

describe(type, () => {
  test("should transfer with sender morpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: morpho,
        address: tokenA,
        args: {
          amount,
          from: userB,
          to: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.balance += amount;
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userB]![tokenA]!.erc20Allowances.permit2 -= amount;
    expected.holdings[userB]![tokenA]!.permit2Allowances.morpho.amount -=
      amount;

    expect(result).toEqual(expected);
  });

  test("should transfer with sender bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: generalAdapter1,
        address: tokenA,
        args: {
          amount,
          from: userB,
          to: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.balance += amount;
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userB]![tokenA]!.erc20Allowances.permit2 -= amount;
    expected.holdings[userB]![tokenA]!.permit2Allowances.bundler.amount -=
      amount;

    expect(result).toEqual(expected);
  });

  test("should throw with sender permit2", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: permit2,
          address: tokenA,
          args: {
            amount,
            from: userB,
            to: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: unknown contract "0x000000000022D473030F116dDEE9F6B43aC78BA3"]`,
    );
  });

  test("should throw if insufficient allowance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: generalAdapter1,
          address: tokenB,
          args: {
            amount,
            from: userA,
            to: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient permit2 allowance for token "0x2222222222222222222222222222222222222222" from owner "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" to spender "bundler"]`,
    );
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: morpho,
          address: tokenA,
          args: {
            amount,
            from: userA,
            to: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"]`,
    );
  });
});
