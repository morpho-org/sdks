import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { ChainIdMismatchError } from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "./getVaultBundlesSharesRequirements.js";

describe("getVaultBundlesSharesRequirements", () => {
  test("error: ChainIdMismatchError before reading an allowance", async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });

    await expect(
      getVaultBundlesSharesRequirements(client, {
        vaultData: {} as never,
        version: "vaultV1",
        owner: "0x0000000000000000000000000000000000000001",
        chainId: base.id,
        requiredShareAllowance: 1n,
        deadline: 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});
