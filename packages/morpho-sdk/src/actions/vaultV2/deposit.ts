import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { vaultBundlesV1Abi } from "../../abis.js";
import { validateNativeVaultAsset } from "../../helpers/validate.js";
import {
  type BundlesFundingArgs,
  type BundlesTokenRequirementSignature,
  type Metadata,
  MixedBundlesFundingError,
  NonPositiveInputError,
  type Transaction,
  type VaultV2DepositAction,
} from "../../types/index.js";
import {
  finalizeVaultBundlesV1Transaction,
  getBundlesReferralFeeAssets,
  getBundlesTokenPermit,
  normalizeBundlesCommonParams,
  resolveBundlesFunding,
} from "../bundles/index.js";

/** Parameters for {@link vaultV2Deposit}. */
export interface VaultV2DepositParams {
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
 * Encodes a Vault V2 deposit through the registered VaultBundlesV1 contract.
 *
 * @param params - Vault, exclusive funding, deadline, fee, and optional token permit values.
 * @returns A deep-frozen VaultBundlesV1 deposit transaction.
 * @throws {MixedBundlesFundingError} when ERC-20/native funding is mixed or native funding carries a token permit.
 * @throws {NegativeInputError} when the selected funding amount or `referralFeePct` is negative.
 * @throws {NonPositiveInputError} when funding, `maxSharePrice`, or `deadline` is not positive.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a non-wNative vault.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD; it extends
 *   {@link InputExceedsMaxError}, so either class catches it.
 * @throws {ReferralFeeRecipientMissingError} when a positive `referralFeePct` has no recipient.
 * @throws {UnexpectedRequirementSignatureError} when a Permit2 AllowanceTransfer signature is supplied.
 * @throws {DepositOwnerMismatchError} when the signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the vault asset.
 * @throws {DepositAmountMismatchError} when the signed amount differs from the gross funding amount.
 * @throws {DepositSpenderMismatchError} when the signed spender is not VaultBundlesV1.
 * @throws {BundlesRequirementSignatureMismatchError} when the signature deadline, nonce, or encoding is invalid.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @example
 * ```ts
 * import { vaultV2Deposit } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const tx = vaultV2Deposit({
 *   vault: { chainId: 1, address: zeroAddress, asset: zeroAddress },
 *   args: {
 *     amount: 1_000_000n,
 *     maxSharePrice: 1_000_000_000_000_000_000_000_000_000n,
 *     userAddress: zeroAddress,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx.action.type === "vaultV2Deposit"
 * ```
 */
export const vaultV2Deposit = (
  params: VaultV2DepositParams,
): Readonly<Transaction<VaultV2DepositAction>> => {
  const funding = resolveBundlesFunding(params.args);
  if (params.args.maxSharePrice <= 0n) {
    throw new NonPositiveInputError("maxSharePrice", params.args.maxSharePrice);
  }
  if (funding.value > 0n) {
    validateNativeVaultAsset(params.vault.chainId, params.vault.asset);
    if (params.args.requirementSignature != null) {
      throw new MixedBundlesFundingError();
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
      type: "vaultV2Deposit",
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
