import _ from "lodash";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import {
  UnknownAllowanceError,
  simulateOperation,
} from "../../../../src/index.js";
import {
  dataFixture,
  tokenA,
  tokenB,
  userA,
  userB,
  vaultB,
} from "../../fixtures.js";

const type = "Erc20_Approve";

const { morpho, bundler, permit2 } = addresses[ChainId.EthMainnet];

describe(type, () => {
  test("should approve morpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          spender: morpho,
          amount: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho = 1n;

    expect(result).toEqual(expected);
  });

  test("should approve permit2", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: tokenB,
        args: {
          spender: permit2,
          amount: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenB]!.erc20Allowances.permit2 = 1n;

    expect(result).toEqual(expected);
  });

  test("should approve bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: tokenB,
        args: {
          spender: bundler,
          amount: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenB]!.erc20Allowances.bundler = 1n;

    expect(result).toEqual(expected);
  });

  test("should approve MetaMorpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenB,
        args: {
          spender: vaultB.address,
          amount: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.vaultUsers[vaultB.address]![userB]!.allowance = 1n;

    expect(result).toEqual(expected);
  });

  test("should throw if unknown spender", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: tokenA,
          args: {
            spender: tokenA,
            amount: 1n,
          },
        },
        dataFixture,
      ),
    ).toThrow(new UnknownAllowanceError(tokenA, userB, tokenA));
  });
});
