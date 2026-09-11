import { MathLib } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";

describe("MorphoVaultV1 chain validation", () => {
  test("getData throws ChainIdMismatchError when client chain differs", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("deposit throws ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    expect(() =>
      vault.deposit({
        amount: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("withdraw and redeem throw ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    expect(() =>
      vault.withdraw({
        amount: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.redeem({
        shares: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("migrateToV2 uses the source vault's fee-accrued share price", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const sourceVault = inKindVaultV1Data({
      fee: MathLib.WAD / 5n,
      lastTotalAssets: 900n,
    });
    const shares = sourceVault.totalSupply;
    const expectedFloor = MathLib.mulDivDown(
      sourceVault.accrueInterest().toAssets(shares),
      MathLib.RAY,
      shares,
    );
    const accrueInterest = vi.spyOn(sourceVault, "accrueInterest");

    const tx = vault
      .migrateToV2({
        userAddress: IN_KIND_USER,
        sourceVault,
        targetVault: inKindVaultV2Data({
          address: "0x1111111111111111111111111111111111111111",
        }),
        shares,
        slippageTolerance: 0n,
      })
      .buildTx();

    expect(tx.action.args.minSharePriceVaultV1).toBe(expectedFloor);
    expect(accrueInterest).toHaveBeenCalledWith(expect.any(BigInt));
    expect(expectedFloor).toBeLessThan(
      MathLib.mulDivDown(sourceVault.toAssets(shares), MathLib.RAY, shares),
    );
  });
});
