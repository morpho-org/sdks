import { describe, expect } from "vitest";
import { test } from "./setup";

import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { User } from "../../src/augment/User";
import { blueAbi } from "./abis";

const {
  morpho,
  bundler3: { generalAdapter1 },
} = addresses[ChainId.EthMainnet];

describe("augment/User", () => {
  test("should fetch user data", async ({ client, wallet }) => {
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

    const value = await User.fetch(client.account.address, wallet);

    expect(value).toStrictEqual(expectedData);
  });
});
