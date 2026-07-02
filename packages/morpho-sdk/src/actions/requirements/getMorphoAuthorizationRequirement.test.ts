import { addressesRegistry } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  ChainIdMismatchError,
  isRequirementSignature,
} from "../../types/index.js";
import { getMorphoAuthorizationRequirement } from "./getMorphoAuthorizationRequirement.js";

const USER: Address = "0x1111111111111111111111111111111111111111";

function makeClient({
  chainId,
  isAuthorized,
  nonce = 0n,
}: {
  chainId: number;
  isAuthorized: boolean;
  nonce?: bigint;
}): Client {
  return {
    chain: { id: chainId },
    extend: () => ({
      readContract: vi.fn(({ functionName }: { functionName: string }) =>
        Promise.resolve(functionName === "nonce" ? nonce : isAuthorized),
      ),
    }),
  } as unknown as Client;
}

describe("getMorphoAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    await expect(
      getMorphoAuthorizationRequirement({
        viemClient: makeClient({ chainId: mainnet.id + 1, isAuthorized: true }),
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when GeneralAdapter1 is already authorized", async () => {
    await expect(
      getMorphoAuthorizationRequirement({
        viemClient: makeClient({ chainId: mainnet.id, isAuthorized: true }),
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).resolves.toBeNull();
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const tx = await getMorphoAuthorizationRequirement({
      viemClient: makeClient({ chainId: mainnet.id, isAuthorized: false }),
      chainId: mainnet.id,
      userAddress: USER,
    });

    if (tx == null || isRequirementSignature(tx)) {
      throw new Error("expected an authorization transaction");
    }
    expect(tx.to).toBe(addressesRegistry[mainnet.id].morpho);
    expect(tx.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundler3.generalAdapter1,
    );
  });

  test("behavior: returns a signable requirement when supportSignature is true", async () => {
    const requirement = await getMorphoAuthorizationRequirement({
      viemClient: makeClient({
        chainId: mainnet.id,
        isAuthorized: false,
        nonce: 3n,
      }),
      chainId: mainnet.id,
      userAddress: USER,
      supportSignature: true,
    });

    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }
    if (requirement.action.type !== "authorization") {
      throw new Error("expected an authorization action");
    }
    expect(requirement.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundler3.generalAdapter1,
    );
  });
});
