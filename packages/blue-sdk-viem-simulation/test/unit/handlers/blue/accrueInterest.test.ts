import _ from "lodash";

import { BlueErrors } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../../src/index.js";
import { dataFixture, marketA1, userA } from "../../fixtures.js";

const type = "Blue_AccrueInterest";

const marketData = dataFixture.getMarket(marketA1.id);

describe(type, () => {
  test("should accrue interest", () => {
    const elapsed = 10_000n;

    const dataFixtureCopy = _.cloneDeep(dataFixture);
    dataFixtureCopy.block.timestamp += elapsed;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: { id: marketA1.id },
      },
      dataFixtureCopy,
    );

    const expected = _.cloneDeep(dataFixtureCopy);
    // expected.cacheId = expect.any(String);
    expected.markets[marketA1.id] = marketData.accrueInterest(
      dataFixtureCopy.block.timestamp,
    );

    expect(result).toEqual(expected);
  });

  test("should not update data if no time elapsed", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: { id: marketA1.id },
      },
      dataFixture,
    );

    // dataFixture.cacheId = expect.any(String);

    expect(result).toEqual(dataFixture);
  });

  test("should throw if accruing interest in the past", () => {
    const dataFixtureCopy = _.cloneDeep(dataFixture);
    dataFixtureCopy.block.timestamp -= 1n;

    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: { id: marketA1.id },
        },
        dataFixtureCopy,
      ),
    ).toThrow(
      new BlueErrors.InvalidInterestAccrual(marketA1.id, 12344n, 12345n),
    );
  });
});
