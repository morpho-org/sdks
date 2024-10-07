import _ from "lodash";

import { simulateOperation } from "../../../src/index.js";
import { dataFixture, tokenA, userA, userB } from "../fixtures.js";

import { describe, expect, test } from "vitest";

const dataFixtureCopy = _.cloneDeep(dataFixture);

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
