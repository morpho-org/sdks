import _ from "lodash";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, userA } from "../../fixtures.js";

const type = "Blue_SetAuthorization";

describe(type, () => {
  test("should set authorization", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: { owner: userA, isBundlerAuthorized: true },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.users[userA]!.isBundlerAuthorized = true;

    expect(result).toEqual(expected);
  });
});
