import _ from "lodash";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../../src/index.js";
import { dataFixture, tokenA, userA, userB } from "../../fixtures.js";

const type = "Erc20_Permit2";

const { morpho, bundler } = addresses[ChainId.EthMainnet];

describe(type, () => {
  test("should permit2 morpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          spender: morpho,
          amount: 2n,
          expiration: 5n,
          nonce: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.permit2Allowances.morpho.amount = 2n;
    expected.holdings[userB]![tokenA]!.permit2Allowances.morpho.expiration = 5n;
    expected.holdings[userB]![tokenA]!.permit2Allowances.morpho.nonce = 2n;

    expect(result).toEqual(expected);
  });

  test("should permit2 bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: tokenA,
        args: {
          spender: bundler,
          amount: 2n,
          expiration: 5n,
          nonce: 0n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.permit2Allowances.bundler.amount = 2n;
    expected.holdings[userA]![tokenA]!.permit2Allowances.bundler.expiration =
      5n;
    expected.holdings[userA]![tokenA]!.permit2Allowances.bundler.nonce = 1n;

    expect(result).toEqual(expected);
  });
});
