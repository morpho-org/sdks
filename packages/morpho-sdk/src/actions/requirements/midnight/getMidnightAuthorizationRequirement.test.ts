import { midnightAbi } from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Chain, getAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  UnsupportedMidnightAuthorizationTargetError,
} from "../../../types/index.js";
import { getMidnightAuthorizationRequirement } from "./getMidnightAuthorizationRequirement.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

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
        authorized: midnightBundlesV2,
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
        authorized: midnightBundlesV2,
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
      authorized: midnightBundlesV2,
    });

    expect(tx?.to).toBe(midnightAddresses.midnight);
    expect(tx?.action.type).toBe("midnightAuthorization");
    expect(tx?.action.args.authorized).toBe(midnightBundlesV2);
  });

  test.each([midnightBundlesV2])(
    "behavior: accepts supported target %s",
    async (authorized) => {
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
          authorized,
        }),
      ).resolves.toBeNull();
    },
  );

  test.each([
    zeroAddress,
    midnightAddresses.ecrecoverRatifier,
    midnightAddresses.setterRatifier,
    getChainAddress(midnightChainId, "priceRatifierV1"),
    getChainAddress(midnightChainId, "rateRatifierV1"),
  ])(
    "error: UnsupportedMidnightAuthorizationTargetError for %s",
    async (authorized) => {
      const { client } = createMockClient(midnightTestChain);

      await expect(
        getMidnightAuthorizationRequirement({
          viemClient: client,
          chainId: midnightChainId,
          owner: midnightAddresses.taker,
          authorized,
        }),
      ).rejects.toThrow(UnsupportedMidnightAuthorizationTargetError);
    },
  );
});
