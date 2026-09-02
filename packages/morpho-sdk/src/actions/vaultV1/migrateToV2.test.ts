import { MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  AmountAndSharesExclusiveError,
  SameVaultMigrationError,
  type VaultV1MigrateToV2AmountArgs,
} from "../../types/index.js";
import { vaultV1MigrateToV2 } from "./migrateToV2.js";

const chainId = mainnet.id;
const sourceVault = "0x0000000000000000000000000000000000000061" as const;
const targetVault = "0x0000000000000000000000000000000000000062" as const;
const asset = "0x0000000000000000000000000000000000000063" as const;
const userAddress = "0x0000000000000000000000000000000000000064" as const;
const feeRecipient = "0x0000000000000000000000000000000000000065" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV1MigrateToV2", () => {
  test("default", () => {
    const deadline = 1_900_000_000n;
    const referralFeePct = MathLib.WAD / 10n;
    const transaction = vaultV1MigrateToV2({
      vault: { chainId, address: sourceVault, asset },
      args: {
        targetVault,
        targetAsset: asset,
        assets: 100n,
        maxSharePriceVaultV2: 3n,
        userAddress,
        referralFeePct,
        referralFeeRecipient: feeRecipient,
        deadline,
      },
    });
    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    expect(transaction.value).toBe(0n);
    expect(
      decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "vaultBundlesV1Migrate",
      args: [
        sourceVault,
        targetVault,
        100n,
        0n,
        3n,
        { value: 0n, nonce: 0n, deadline, v: 0, r: zeroHash, s: zeroHash },
        referralFeePct,
        feeRecipient,
        deadline,
      ],
    });
    expect(transaction.action.args).toMatchObject({
      referralFeeAssets: 10n,
      netAssets: 90n,
    });
  });

  test("behavior: assets and shares modes round-trip across uint256 inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          amount: positiveUint256,
          maxSharePrice: positiveUint256,
          deadline: positiveUint256,
          byShares: fc.boolean(),
        }),
        ({ amount, maxSharePrice, deadline, byShares }) => {
          const amountArgs: VaultV1MigrateToV2AmountArgs = byShares
            ? { shares: amount }
            : { assets: amount };
          const transaction = vaultV1MigrateToV2({
            vault: { chainId, address: sourceVault, asset },
            args: {
              targetVault,
              targetAsset: asset,
              ...amountArgs,
              maxSharePriceVaultV2: maxSharePrice,
              userAddress,
              deadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: vaultBundlesV1Abi,
            data: transaction.data,
          });
          expect(decoded.functionName).toBe("vaultBundlesV1Migrate");
          expect(decoded.args?.[2]).toBe(byShares ? 0n : amount);
          expect(decoded.args?.[3]).toBe(byShares ? amount : 0n);
          expect(decoded.args?.[4]).toBe(maxSharePrice);
          expect(decoded.args?.[8]).toBe(deadline);
          if (byShares) {
            expect(transaction.action.args).not.toHaveProperty(
              "referralFeeAssets",
            );
            expect(transaction.action.args).not.toHaveProperty("netAssets");
          }
        },
      ),
      { numRuns: 50, seed: 20_260_907 },
    );
  });

  test("error: assets and shares are exclusive", () => {
    const invalidAmounts = {
      assets: 1n,
      shares: 1n,
    } as unknown as VaultV1MigrateToV2AmountArgs;
    expect(() =>
      vaultV1MigrateToV2({
        vault: { chainId, address: sourceVault, asset },
        args: {
          targetVault,
          targetAsset: asset,
          ...invalidAmounts,
          maxSharePriceVaultV2: 1n,
          userAddress,
          deadline: 1n,
        },
      }),
    ).toThrow(AmountAndSharesExclusiveError);
  });

  test("error: SameVaultMigrationError", () => {
    expect(() =>
      vaultV1MigrateToV2({
        vault: { chainId, address: sourceVault, asset },
        args: {
          targetVault: sourceVault,
          targetAsset: asset,
          shares: 1n,
          maxSharePriceVaultV2: 1n,
          userAddress,
          deadline: 1n,
        },
      }),
    ).toThrow(SameVaultMigrationError);
  });
});
