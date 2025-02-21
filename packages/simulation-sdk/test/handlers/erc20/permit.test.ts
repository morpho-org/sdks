import _ from "lodash";

import { ChainId, NATIVE_ADDRESS, addresses } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, userA, userB, vaultA } from "../../fixtures.js";

const type = "Erc20_Permit";

const {
  morpho,
  bundler3: { generalAdapter1 },
} = addresses[ChainId.EthMainnet];

describe(type, () => {
  test("should permit morpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          spender: morpho,
          amount: 2n,
          nonce: 0n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.erc20Allowances.morpho = 2n;
    expected.holdings[userB]![tokenA]!.erc2612Nonce = 1n;

    expect(result).toEqual(expected);
  });

  test("should permit bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: tokenA,
        args: {
          spender: generalAdapter1,
          amount: 2n,
          nonce: 0n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.erc20Allowances[
      "bundler3.generalAdapter1"
    ] = 2n;
    expected.holdings[userA]![tokenA]!.erc2612Nonce = 1n;

    expect(result).toEqual(expected);
  });

  test("should permit MetaMorpho", () => {
    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: tokenA,
        args: {
          spender: vaultA.address,
          amount: 1n,
          nonce: 0n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.vaultUsers[vaultA.address]![userB]!.allowance = 1n;
    expected.holdings[userB]![tokenA]!.erc2612Nonce = 1n;

    expect(result).toEqual(expected);
  });

  test("should throw if not permit token", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: NATIVE_ADDRESS,
          args: {
            spender: morpho,
            amount: 1n,
            nonce: 0n,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: unknown EIP-2612 data for token "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" of owner "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"]`,
    );
  });
});
