import _ from "lodash";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, userA } from "../../fixtures.js";

const type = "Erc20_Permit2";

describe(type, () => {
  test("should permit2 bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: tokenA,
        args: {
          amount: 2n,
          expiration: 5n,
          nonce: 1n,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userA]![tokenA]!.permit2BundlerAllowance.amount = 2n;
    expected.holdings[userA]![tokenA]!.permit2BundlerAllowance.expiration = 5n;
    expected.holdings[userA]![tokenA]!.permit2BundlerAllowance.nonce = 2n;

    expect(result).toEqual(expected);
  });
});
