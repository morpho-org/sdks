import _ from "lodash";
import { parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import {
  Erc20Errors,
  UnknownContractError,
  simulateOperation,
} from "../../../../src/index.js";
import { dataFixture, tokenA, tokenB, userA, userB } from "../../fixtures.js";

const type = "Erc20_Transfer2";

const amount = parseUnits("1", 6);
const { morpho, bundler, permit2 } = addresses[ChainId.EthMainnet];

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
    // expected.cacheId = expect.any(String);
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
    ).toThrow(new UnknownContractError(permit2));
  });

  test("should throw if insufficient allowance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: bundler,
          address: tokenB,
          args: {
            amount,
            from: userA,
            to: userB,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new Erc20Errors.InsufficientPermit2Allowance(tokenB, userA, "bundler"),
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
