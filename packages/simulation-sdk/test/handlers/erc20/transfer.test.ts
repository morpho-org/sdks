import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, userA, userB, vaultA } from "../../fixtures.js";

const type = "Erc20_Transfer";

const amount = parseUnits("1", 6);
const {
  morpho,
  bundler3: { generalAdapter1 },
  permit2,
} = addresses[ChainId.EthMainnet];

describe(type, () => {
  test("should transfer", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
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

    expect(result).toEqual(expected);
  });

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
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho -= amount;

    expect(result).toEqual(expected);
  });

  test("should transfer with sender permit2", () => {
    const result = simulateOperation(
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
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.balance += amount;
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userB]![tokenA]!.erc20Allowances.permit2 -= amount;

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
    expected.holdings[userB]![tokenA]!.erc20Allowances.bundler -= amount;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient allowance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: morpho,
          address: vaultA.address,
          args: {
            amount: parseUnits("1", 18),
            from: userA,
            to: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: insufficient allowance for token "0x000000000000000000000000000000000000000A" from owner "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" to spender "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"]`,
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
