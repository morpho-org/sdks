import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, isAddressEqual } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { validateUint256Field } from "../../helpers/validate.js";
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
} from "../bundles/common.js";

/** Parameters for {@link vaultV1MigrateToV2}. */
export interface VaultV1MigrateToV2Params {
  readonly vault: {
    /** Chain containing the vaults and their registered VaultBundlesV1 contract. */
    readonly chainId: number;
    /** Source Vault V1 address whose shares are burned. */
    readonly address: Address;
    /** Source vault's underlying ERC-20 asset; must equal `args.targetAsset`. */
    readonly asset: Address;
  };
  readonly args: VaultV1MigrateToV2AmountArgs & {
    /** Destination Vault V2 contract receiving the net migrated assets. */
    readonly targetVault: Address;
    /** Destination vault's underlying ERC-20 asset; must equal `vault.asset`. */
    readonly targetAsset: Address;
    /** Maximum accepted destination share price, scaled by RAY (1e27). */
    readonly maxSharePriceVaultV2: bigint;
    /** Share owner and transaction sender; VaultBundlesV1 mints shares to this account. */
    readonly userAddress: Address;
    /** Unsupported; shares are always minted to the transaction sender. */
    readonly recipient?: never;
    /** Unsupported; the source Vault V1 withdrawal carries no share-price bound. */
    readonly minSharePriceVaultV1?: never;
    /** Optional ERC-2612 vault-share permit for the migrated source shares. */
    readonly requirementSignature?: Erc2612RequirementSignature;
    /** Optional WAD-scaled fee in [0, 1e18), defaulting to zero. */
    readonly referralFeePct?: bigint;
    /** Optional fee recipient; a nonzero address is required when `referralFeePct > 0n`. */
    readonly referralFeeRecipient?: Address;
    /** Positive uint256 Unix timestamp in seconds after which execution reverts. */
    readonly deadline: bigint;
  };
  /** Optional analytics metadata appended to the transaction calldata. */
  readonly metadata?: Metadata;
}

/**
 * Encodes an assets-or-shares Vault V1 to Vault V2 migration through VaultBundlesV1.
 *
 * @param params.vault.chainId - Chain containing the vaults and their registered VaultBundlesV1 contract.
 * @param params.vault.address - Source Vault V1 address whose shares are burned.
 * @param params.vault.asset - Source vault's underlying ERC-20 asset; must equal `args.targetAsset`.
 * @param params.args.assets - Gross migrated amount in asset base units, exclusive with `shares`.
 * @param params.args.shares - Source vault shares to burn for the migration, exclusive with `assets`.
 * @param params.args.targetVault - Destination Vault V2 contract receiving the net migrated assets.
 * @param params.args.targetAsset - Destination vault's underlying ERC-20 asset; must equal `vault.asset`.
 * @param params.args.maxSharePriceVaultV2 - Positive maximum asset base units per share base unit
 *   on the destination Vault V2 deposit, scaled by RAY (1e27).
 * @param params.args.userAddress - Share owner and transaction sender; VaultBundlesV1 mints shares to this account.
 * @param params.args.recipient - Unsupported; shares are always minted to the transaction sender.
 * @param params.args.minSharePriceVaultV1 - Unsupported; the source Vault V1 withdrawal carries no
 *   share-price bound.
 * @param params.args.requirementSignature - Optional ERC-2612 vault-share permit for `userAddress`
 *   and the registered VaultBundlesV1 spender. Omit when the share allowance is already set.
 * @param params.args.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero.
 *   The fee is rounded down and deducted from gross assets before depositing.
 * @param params.args.referralFeeRecipient - Optional fee recipient; a nonzero address is required
 *   when `referralFeePct > 0n`.
 * @param params.args.deadline - Required positive uint256 Unix timestamp in seconds after which
 *   execution reverts. This pure builder does not check the current time.
 * @param params.metadata - Optional analytics metadata appended to the transaction calldata.
 * @param params.metadata.origin - Hex origin identifier of at most four bytes, with an optional `0x` prefix.
 * @param params.metadata.timestamp - Optional flag to append the current timestamp; defaults to false.
 * @returns A deep-frozen VaultBundlesV1 migration transaction.
 * @throws {VaultAssetMismatchError} when source and destination assets differ.
 * @throws {SameVaultMigrationError} when source and destination vaults are identical.
 * @throws {AmountAndSharesExclusiveError} when both amount modes or neither are supplied.
 * @throws {NonPositiveInputError} when the selected amount, destination share-price bound, or deadline is not positive.
 * @throws {InputExceedsMaxError} when the selected amount, `maxSharePriceVaultV2`, or `deadline` exceeds uint256.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no non-zero recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @throws {BundlesPermitMismatchError} when the optional share permit is incompatible.
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import { vaultV1MigrateToV2 } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export function buildSteakUsdcMigration(
 *   targetVault: Address,
 *   userAddress: Address,
 *   maxSharePriceVaultV2: bigint,
 *   deadline: bigint,
 * ) {
 *   const vault = vaults[mainnet.id].steakUsdc;
 *   const tx = vaultV1MigrateToV2({
 *     vault: { chainId: mainnet.id, address: vault.address, asset: vault.asset },
 *     args: {
 *       shares: 1_000_000n,
 *       targetVault,
 *       targetAsset: vault.asset,
 *       maxSharePriceVaultV2,
 *       userAddress,
 *       deadline,
 *     },
 *   });
 *   // tx satisfies Readonly<Transaction<VaultV1MigrateToV2Action>>
 *   return tx;
 * }
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
  // Reject ABI overflow with SDK errors before calldata encoding.
  validateUint256Field(assets != null ? "assets" : "shares", selectedAmount);
  validateUint256Field(
    "maxSharePriceVaultV2",
    params.args.maxSharePriceVaultV2,
  );
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
