import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  ChainIdMismatchError,
  NonPositiveInputError,
} from "../../types/index.js";

describe("MorphoVaultV2 deposit input validation", () => {
  test("error: ChainIdMismatchError for cross-chain vault data", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.deposit({
        amount: 1n,
        userAddress: IN_KIND_USER,
        vaultData: inKindVaultV2Data({ chainId: mainnet.id + 1 }),
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError for zero total assets", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    let error: unknown;
    try {
      vault.deposit({
        amount: 0n,
        userAddress: KeyrockUsdcVaultV2.address,
        vaultData: { address: KeyrockUsdcVaultV2.address } as never,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NonPositiveInputError);
    expect(error).toMatchObject({ field: "totalAssets", value: 0n });
  });
});
