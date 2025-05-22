import _ from "lodash";

import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import { dataFixture, userA, userB } from "../../fixtures.js";

const type = "Blue_SetAuthorization";

const {
  bundler3: { generalAdapter1 },
} = addressesRegistry[ChainId.EthMainnet];

describe(type, () => {
  test("should set authorization", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          owner: userA,
          isAuthorized: true,
          authorized: generalAdapter1,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.users[userA]!.isBundlerAuthorized = true;

    expect(result).toEqual(expected);
  });

  test("should ignore if address is not bundler", () => {
    const result = simulateOperation(
      {
        type,
        sender: userA,
        args: {
          owner: userA,
          isAuthorized: true,
          authorized: userB,
        },
      },
      dataFixture,
    );

    expect(result).toBe(dataFixture);
  });

  test("should throw if authorization is already set", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          args: {
            owner: userA,
            isAuthorized: false,
            authorized: generalAdapter1,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: isBundlerAuthorized is already set to false

      when simulating operation:
      {
        "type": "Blue_SetAuthorization",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "args": {
          "owner": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "isAuthorized": false,
          "authorized": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0"
        }
      }]
    `,
    );
  });
});
