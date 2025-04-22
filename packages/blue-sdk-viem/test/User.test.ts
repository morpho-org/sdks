import { describe, expect } from "vitest";
import { test } from "./setup";

import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";
import { blueAbi } from "../src";
import { User } from "../src/augment/User";

const {
  morpho,
  bundler3: { generalAdapter1 },
} = addressesRegistry[ChainId.EthMainnet];

describe("augment/User", () => {
  test("should fetch user data", async ({ client }) => {
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [generalAdapter1, true],
    });

    const expectedData = new User({
      address: client.account.address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(client.account.address, client);

    expect(value).toStrictEqual(expectedData);
  });
});
