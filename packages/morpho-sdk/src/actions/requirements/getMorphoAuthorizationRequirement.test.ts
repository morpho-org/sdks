import { addressesRegistry } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { ChainIdMismatchError } from "../../types/index.js";
import { getMorphoAuthorizationRequirement } from "./getMorphoAuthorizationRequirement.js";

const USER: Address = "0x1111111111111111111111111111111111111111";

function makeClient(chainId: number, isAuthorized: boolean): Client {
  return {
    chain: { id: chainId },
    extend: () => ({
      readContract: vi.fn().mockResolvedValue(isAuthorized),
    }),
  } as unknown as Client;
}

describe("getMorphoAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    await expect(
      getMorphoAuthorizationRequirement({
        viemClient: makeClient(mainnet.id + 1, true),
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when GeneralAdapter1 is already authorized", async () => {
    await expect(
      getMorphoAuthorizationRequirement({
        viemClient: makeClient(mainnet.id, true),
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).resolves.toBeNull();
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const tx = await getMorphoAuthorizationRequirement({
      viemClient: makeClient(mainnet.id, false),
      chainId: mainnet.id,
      userAddress: USER,
    });

    expect(tx?.to).toBe(addressesRegistry[mainnet.id].morpho);
    expect(tx?.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundler3.generalAdapter1,
    );
  });
});
