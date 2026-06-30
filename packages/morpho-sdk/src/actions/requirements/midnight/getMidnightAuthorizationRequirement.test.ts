import { midnightAbi } from "@morpho-org/midnight-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Chain } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import { ChainIdMismatchError } from "../../../types/index.js";
import { getMidnightAuthorizationRequirement } from "./getMidnightAuthorizationRequirement.js";

const midnightTestChain = {
  id: midnightChainId,
  name: "Midnight Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
} as const satisfies Chain;

const wrongChain = {
  ...midnightTestChain,
  id: midnightChainId + 1,
} as const satisfies Chain;

describe("getMidnightAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    const { client } = createMockClient(wrongChain);

    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: client,
        chainId: midnightChainId,
        owner: midnightAddresses.taker,
        authorized: midnightAddresses.midnightBundles,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when already authorized", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: true,
    });

    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: handle.client,
        chainId: midnightChainId,
        owner: midnightAddresses.taker,
        authorized: midnightAddresses.midnightBundles,
      }),
    ).resolves.toBeNull();
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: false,
    });

    const tx = await getMidnightAuthorizationRequirement({
      viemClient: handle.client,
      chainId: midnightChainId,
      owner: midnightAddresses.taker,
      authorized: midnightAddresses.midnightBundles,
    });

    expect(tx?.to).toBe(midnightAddresses.midnight);
    expect(tx?.action.type).toBe("midnightAuthorization");
    expect(tx?.action.args.authorized).toBe(midnightAddresses.midnightBundles);
  });
});
