import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  validateNativeVaultAsset,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  type BundlesFundingArgs,
  type BundlesTokenRequirementSignature,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
  UnexpectedRequirementSignatureError,
  type VaultV1DepositAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesReferralFeeAssets,
  getBundlesTokenPermit,
  normalizeBundlesCommonParams,
  resolveBundlesFunding,
} from "../bundles/common.js";

/** Parameters for {@link vaultV1Deposit}. */
export interface VaultV1DepositParams {
  readonly vault: {
    readonly chainId: number;
    readonly address: Address;
    readonly asset: Address;
  };
  readonly args: BundlesFundingArgs & {
    readonly maxSharePrice: bigint;
    readonly userAddress: Address;
    readonly recipient?: never;
    readonly requirementSignature?: BundlesTokenRequirementSignature;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline: bigint;
  };
  readonly metadata?: Metadata;
}

/**
 * Encodes a Vault V1 deposit through the registered VaultBundlesV1 contract.
 *
 * @param params.vault.chainId - Chain containing the vault and its registered VaultBundlesV1 contract.
 * @param params.vault.address - Vault V1 contract receiving the net deposit.
 * @param params.vault.asset - Underlying ERC-20 asset; must be the chain's wNative for native funding.
 * @param params.args.amount - Positive gross ERC-20 amount in asset base units, exclusive with `nativeAmount`.
 * @param params.args.nativeAmount - Positive gross native amount in wei, exclusive with `amount` and
 *   `requirementSignature`; sent as `tx.value` and wrapped by VaultBundlesV1.
 * @param params.args.maxSharePrice - Positive maximum asset base units per share base unit, scaled
 *   by RAY (1e27). Compute it for the net deposit after referral fees to bound slippage.
 * @param params.args.userAddress - Permit owner and transaction sender; VaultBundlesV1 mints shares to this account.
 * @param params.args.recipient - Unsupported; shares are always minted to the transaction sender.
 * @param params.args.requirementSignature - Optional ERC-2612 or Permit2 SignatureTransfer signature
 *   for the gross amount, vault asset, `userAddress`, and VaultBundlesV1 spender.
 * @param params.args.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero.
 *   The fee is rounded down and deducted from gross assets before depositing.
 * @param params.args.referralFeeRecipient - Optional fee recipient; a nonzero address is required
 *   when `referralFeePct > 0n`.
 * @param params.args.deadline - Positive uint256 Unix timestamp in seconds after which execution
 *   reverts. The caller must supply it; the builder chooses no default.
 * @param params.metadata - Optional analytics metadata appended to the transaction calldata.
 * @param params.metadata.origin - Hex origin identifier of at most four bytes, with an optional `0x` prefix.
 * @param params.metadata.timestamp - Optional flag to append the current timestamp; defaults to false.
 * @returns A deep-frozen `Transaction<VaultV1DepositAction>` targeting VaultBundlesV1, with
 *   `to`, `value`, `data`, and gross/fee/net deposit action metadata.
 * @throws {MixedBundlesFundingError} when ERC-20 and native funding are both supplied.
 * @throws {NegativeInputError} when the selected funding amount or `referralFeePct` is negative.
 * @throws {NonPositiveInputError} when funding, `maxSharePrice`, or `deadline` is not positive.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a non-wNative vault.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD; it extends
 *   {@link InputExceedsMaxError}, so either class catches it.
 * @throws {ReferralFeeRecipientMissingError} when a positive `referralFeePct` has no recipient.
 * @throws {UnexpectedRequirementSignatureError} when native funding carries a token permit or a
 *   Permit2 AllowanceTransfer signature is supplied.
 * @throws {InputExceedsMaxError} when funding, `maxSharePrice`, or `deadline` exceeds uint256.
 * @throws {DepositOwnerMismatchError} when the signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the vault asset.
 * @throws {DepositAmountMismatchError} when the signed amount differs from the gross funding amount.
 * @throws {DepositSpenderMismatchError} when the signed spender is not VaultBundlesV1.
 * @throws {BundlesRequirementSignatureMismatchError} when the signature deadline, nonce, or encoding is invalid.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import { vaultV1Deposit } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export function buildSteakUsdcDeposit(
 *   userAddress: Address,
 *   maxSharePrice: bigint,
 *   deadline: bigint,
 * ) {
 *   const vault = vaults[mainnet.id].steakUsdc;
 *   const tx = vaultV1Deposit({
 *     vault: { chainId: mainnet.id, address: vault.address, asset: vault.asset },
 *     args: { amount: 1_000_000n, maxSharePrice, userAddress, deadline },
 *   });
 *   // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
 *   return tx;
 * }
 * ```
 */
export const vaultV1Deposit = (
  params: VaultV1DepositParams,
): Readonly<Transaction<VaultV1DepositAction>> => {
  const funding = resolveBundlesFunding(params.args);
  if (params.args.maxSharePrice <= 0n) {
    throw new NonPositiveInputError("maxSharePrice", params.args.maxSharePrice);
  }
  // Reject ABI overflow with SDK errors before calldata encoding.
  validateUint256Field(
    funding.value > 0n ? "nativeAmount" : "amount",
    funding.assets,
  );
  validateUint256Field("maxSharePrice", params.args.maxSharePrice);
  if (funding.value > 0n) {
    // Reject native funding unless the vault accepts the chain's wrapped-native asset.
    validateNativeVaultAsset(params.vault.chainId, params.vault.asset);
    if (params.args.requirementSignature != null) {
      throw new UnexpectedRequirementSignatureError(
        params.args.requirementSignature.action.type,
      );
    }
  }
  const common = normalizeBundlesCommonParams(params.args);
  const referralFeeAssets = getBundlesReferralFeeAssets(
    funding.assets,
    common.referralFeePct,
  );
  const netAssets = funding.assets - referralFeeAssets;
  const spender = getChainAddress(
    params.vault.chainId,
    "bundles.vaultBundlesV1",
  );
  const tokenPermit = getBundlesTokenPermit({
    userAddress: params.args.userAddress,
    token: params.vault.asset,
    spender,
    amount: funding.assets,
    requirementSignature: params.args.requirementSignature,
  });
  return finalizeVaultBundlesV1Transaction({
    chainId: params.vault.chainId,
    value: funding.value,
    data: encodeFunctionData({
      abi: vaultBundlesV1Abi,
      functionName: "vaultBundlesV1Deposit",
      args: [
        params.vault.address,
        funding.assets,
        params.args.maxSharePrice,
        tokenPermit,
        common.referralFeePct,
        common.referralFeeRecipient,
        common.deadline,
      ],
    }),
    action: {
      type: "vaultV1Deposit",
      args: {
        vault: params.vault.address,
        amount: funding.assets,
        maxSharePrice: params.args.maxSharePrice,
        nativeAmount: funding.value || undefined,
        referralFeePct: common.referralFeePct,
        referralFeeRecipient: common.referralFeeRecipient,
        referralFeeAssets,
        netAssets,
        deadline: common.deadline,
      },
    },
    metadata: params.metadata,
  });
};
