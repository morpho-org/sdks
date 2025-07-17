import _ from "lodash";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, marketA1, userA } from "../../fixtures.js";

const type = "Blue_AccrueInterest";

const marketData = dataFixture.getMarket(marketA1.id, false);

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

  test("should throw if accruing interest in the past", ({ expect }) => {
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
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: invalid interest accrual on market 0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd: accrual timestamp 12344 can't be prior to last update 12345

      when simulating operation:
      {
        "type": "Blue_AccrueInterest",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "id": "0x042487b563685b432d4d2341934985eca3993647799cb5468fb366fad26b4fdd"
        }
      }]
    `,
    );
  });
});
