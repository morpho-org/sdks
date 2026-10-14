import { midnightAbi, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { isAddressEqual } from "viem";
import { expect } from "vitest";
import { getMidnightAuthorizationRequirement } from "../../src/index.js";
import { describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight",
  requires: ["midnight", "midnightBundlesV2"],
};

describeE2e(scenario, (test, { chainId }) => {
  test("authorization: authorizes midnightBundlesV2 on Midnight from fork state", async ({
    client,
  }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const authorized = getChainAddress(chainId, "midnightBundlesV2");
    // The registered operator must be bound to this chain's Midnight.
    const operatorMidnight = await client.readContract({
      address: authorized,
      abi: midnightBundlesV2Abi,
      functionName: "MIDNIGHT",
    });
    expect(isAddressEqual(operatorMidnight, midnight)).toBe(true);

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [client.account.address, authorized],
      }),
    ).toBe(false);

    const requirement = await getMidnightAuthorizationRequirement({
      viemClient: client,
      chainId,
      owner: client.account.address,
      authorized,
    });
    if (requirement == null)
      throw new Error("Expected a midnightBundlesV2 authorization requirement");
    expect(requirement.action.type).toBe("midnightAuthorization");
    await client.sendTransaction(requirement);

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [client.account.address, authorized],
      }),
    ).toBe(true);
    // Once authorized, the helper resolves no further requirement.
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: client,
        chainId,
        owner: client.account.address,
        authorized,
      }),
    ).resolves.toBeNull();
  });
});
