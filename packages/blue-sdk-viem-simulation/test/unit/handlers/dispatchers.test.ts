import _cloneDeep from "lodash/cloneDeep";

import { simulateOperation } from "../../../src";
import { dataFixture, tokenA, userA, userB } from "../fixtures";

import { describe, expect, test } from "vitest";

const dataFixtureCopy = _cloneDeep(dataFixture);

describe("dispatchers", () => {
  test("should not mutate data", async () => {
    simulateOperation(
      {
        type: "Erc20_Transfer",
        sender: userB,
        address: tokenA,
        args: { amount: 0n, from: userB, to: userA },
      },
      dataFixture,
    );

    expect(dataFixtureCopy).toEqual(dataFixture);
  });
});
