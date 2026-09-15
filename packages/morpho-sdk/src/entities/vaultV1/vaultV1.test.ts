import { MathLib } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
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
    const now = 1_800_000_000n;
    const deadline = now + 7_200n;
    const sourceVault = withChainTimestamp(now, () =>
      inKindVaultV1Data({
        fee: MathLib.WAD / 5n,
        lastTotalAssets: 900n,
      }),
    );
    const shares = sourceVault.totalSupply;
    const targetVault = withChainTimestamp(now, () =>
      inKindVaultV2Data({
        address: "0x1111111111111111111111111111111111111111",
      }),
    );
    const expectedAssets = sourceVault
      .accrueInterest(now)
      .toAssets(shares, "Down");
    const expectedMaxSharePrice = computeVaultMaxSharePrice({
      vaultData: targetVault,
      deadline,
      assets: expectedAssets,
      slippageTolerance: 0n,
    });

    const tx = withChainTimestamp(now, () =>
      vault.migrateToV2({
        userAddress: IN_KIND_USER,
        sourceVault,
        targetVault,
        shares,
        deadline,
        slippageTolerance: 0n,
      }),
    ).buildTx();

    expect(tx.action.args.maxSharePriceVaultV2).toBe(expectedMaxSharePrice);
    expect(expectedMaxSharePrice).not.toBe(
      computeVaultMaxSharePrice({
        vaultData: targetVault,
        deadline,
        assets: sourceVault.toAssets(shares, "Down"),
        slippageTolerance: 0n,
      }),
    );
    expect(expectedAssets).toBeLessThan(sourceVault.toAssets(shares, "Down"));
  });
});
