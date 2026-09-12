import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";

describe("MorphoVaultV2 chain validation", () => {
  test("getData throws ChainIdMismatchError when client chain differs", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("deposit throws ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    expect(() =>
      vault.deposit({
        amount: 1n,
        userAddress: KeyrockUsdcVaultV2.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("withdraw, redeem, forceWithdraw, and forceRedeem throw ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    expect(() =>
      vault.withdraw({ amount: 1n, userAddress: KeyrockUsdcVaultV2.address }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.redeem({ shares: 1n, userAddress: KeyrockUsdcVaultV2.address }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.forceWithdraw({
        exitAssets: 1n,
        vaultData: {} as never,
        userAddress: KeyrockUsdcVaultV2.address,
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.forceRedeem({
        deallocations: [],
        redeem: { shares: 1n },
        userAddress: KeyrockUsdcVaultV2.address,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
