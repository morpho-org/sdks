import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { Erc20Errors, simulateOperation } from "../../../../src";
import { dataFixture, tokenA, userA, userB, vaultA } from "../../fixtures";

const type = "Erc20_Transfer";

const amount = parseUnits("1", 6);
const { morpho, bundler, permit2 } = addresses[ChainId.EthMainnet];

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
    // expected.cacheId = expect.any(String);
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
    // expected.cacheId = expect.any(String);
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
    // expected.cacheId = expect.any(String);
    expected.holdings[userA]![tokenA]!.balance += amount;
    expected.holdings[userB]![tokenA]!.balance -= amount;
    expected.holdings[userB]![tokenA]!.erc20Allowances.permit2 -= amount;

    expect(result).toEqual(expected);
  });

  test("should transfer with sender bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: bundler,
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
    // expected.cacheId = expect.any(String);
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
    ).toThrow(
      new Erc20Errors.InsufficientAllowance(vaultA.address, userA, morpho),
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
    ).toThrow(new Erc20Errors.InsufficientBalance(tokenA, userA));
  });
});
