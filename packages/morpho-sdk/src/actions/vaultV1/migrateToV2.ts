import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, isAddressEqual } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  AmountAndSharesExclusiveError,
  type Erc2612RequirementSignature,
  type Metadata,
  NonPositiveInputError,
  SameVaultMigrationError,
  type Transaction,
  VaultAssetMismatchError,
  type VaultV1MigrateToV2Action,
  type VaultV1MigrateToV2AmountArgs,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesReferralFeeAssets,
  getBundlesSharesPermit,
  normalizeBundlesCommonParams,
} from "../bundles/index.js";

/** Parameters for {@link vaultV1MigrateToV2}. */
export interface VaultV1MigrateToV2Params {
  readonly vault: {
    readonly chainId: number;
    readonly address: Address;
    readonly asset: Address;
  };
  readonly args: VaultV1MigrateToV2AmountArgs & {
    readonly targetVault: Address;
    readonly targetAsset: Address;
    readonly maxSharePriceVaultV2: bigint;
    readonly userAddress: Address;
    readonly recipient?: never;
    readonly minSharePriceVaultV1?: never;
    readonly requirementSignature?: Erc2612RequirementSignature;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline: bigint;
  };
  readonly metadata?: Metadata;
}

/**
 * Encodes an assets-or-shares Vault V1 to Vault V2 migration through VaultBundlesV1.
 *
 * @param params - Source/destination vaults, exclusive migration amount, fee, permit, and deadline.
 * @returns A deep-frozen VaultBundlesV1 migration transaction.
 * @throws {VaultAssetMismatchError} when source and destination assets differ.
 * @throws {SameVaultMigrationError} when source and destination vaults are identical.
 * @throws {AmountAndSharesExclusiveError} when both amount modes or neither are supplied.
 * @throws {NonPositiveInputError} when the selected amount, destination share-price bound, or deadline is not positive.
 * @example
 * ```ts
 * import { vaultV1MigrateToV2 } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1MigrateToV2({
 *   vault: {
 *     chainId: 1,
 *     address: "0x0000000000000000000000000000000000000001",
 *     asset: "0x0000000000000000000000000000000000000003",
 *   },
 *   args: {
 *     shares: 1_000_000n,
 *     targetVault: "0x0000000000000000000000000000000000000002",
 *     targetAsset: "0x0000000000000000000000000000000000000003",
 *     maxSharePriceVaultV2: 1_000_000_000_000_000_000_000_000_000n,
 *     userAddress: "0x0000000000000000000000000000000000000004",
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx.action.type === "vaultV1MigrateToV2"
 * ```
 */
export const vaultV1MigrateToV2 = (
  params: VaultV1MigrateToV2Params,
): Readonly<Transaction<VaultV1MigrateToV2Action>> => {
  if (!isAddressEqual(params.vault.asset, params.args.targetAsset)) {
    throw new VaultAssetMismatchError(
      params.vault.asset,
      params.args.targetAsset,
    );
  }
  if (isAddressEqual(params.vault.address, params.args.targetVault)) {
    throw new SameVaultMigrationError(params.vault.address);
  }
  const assets = "assets" in params.args ? params.args.assets : undefined;
  const shares = "shares" in params.args ? params.args.shares : undefined;
  if ((assets == null) === (shares == null)) {
    throw new AmountAndSharesExclusiveError();
  }
  const selectedAmount = assets ?? shares ?? 0n;
  if (selectedAmount <= 0n) {
    throw new NonPositiveInputError(
      assets != null ? "assets" : "shares",
      selectedAmount,
    );
  }
  if (params.args.maxSharePriceVaultV2 <= 0n) {
    throw new NonPositiveInputError(
      "maxSharePriceVaultV2",
      params.args.maxSharePriceVaultV2,
    );
  }
  const common = normalizeBundlesCommonParams(params.args);
  const spender = getChainAddress(
    params.vault.chainId,
    "bundles.vaultBundlesV1",
  );
  const sharesPermit = getBundlesSharesPermit({
    vault: params.vault.address,
    deadline: common.deadline,
    owner: params.args.userAddress,
    spender,
    amount: shares,
    requirementSignature: params.args.requirementSignature,
  });
  const referralFeeAssets =
    assets == null
      ? undefined
      : getBundlesReferralFeeAssets(assets, common.referralFeePct);
  return finalizeVaultBundlesV1Transaction({
    chainId: params.vault.chainId,
    value: 0n,
    data: encodeFunctionData({
      abi: vaultBundlesV1Abi,
      functionName: "vaultBundlesV1Migrate",
      args: [
        params.vault.address,
        params.args.targetVault,
        assets ?? 0n,
        shares ?? 0n,
        params.args.maxSharePriceVaultV2,
        sharesPermit,
        common.referralFeePct,
        common.referralFeeRecipient,
        common.deadline,
      ],
    }),
    action: {
      type: "vaultV1MigrateToV2",
      args: {
        sourceVault: params.vault.address,
        targetVault: params.args.targetVault,
        assets: assets ?? 0n,
        shares: shares ?? 0n,
        maxSharePriceVaultV2: params.args.maxSharePriceVaultV2,
        referralFeePct: common.referralFeePct,
        referralFeeRecipient: common.referralFeeRecipient,
        ...(assets != null && referralFeeAssets != null
          ? {
              referralFeeAssets,
              netAssets: assets - referralFeeAssets,
            }
          : {}),
        deadline: common.deadline,
      },
    },
    metadata: params.metadata,
  });
};
