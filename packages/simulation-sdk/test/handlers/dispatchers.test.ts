import _ from "lodash";
import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../src/index.js";
import { dataFixture, tokenA, userA, userB } from "../fixtures.js";

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
