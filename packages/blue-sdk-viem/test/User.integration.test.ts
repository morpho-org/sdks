import { addressesRegistry, ChainId } from "@morpho-org/blue-sdk";
import { describe, expect } from "vitest";
import { User } from "../src/augment/User.js";
import { blueAbi } from "../src/index.js";
import { test } from "./setup.js";

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
