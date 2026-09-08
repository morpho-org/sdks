import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  addTransactionMetadata,
  ChainWNativeMissingError,
  getTokenRequirementActions,
  isPermitSignature,
  type Metadata,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  type RequirementSignature,
  UnexpectedRequirementSignatureError,
} from "@morpho-org/morpho-sdk";
import { type Action, BundlerAction } from "@morpho-org/morpho-sdk/bundler";
import { type Address, isAddressEqual } from "viem";

/** @internal Resolved inputs for the deprecated WDK Bundler3 supply route. */
export interface LegacySupplyParams {
  readonly chainId: number;
  readonly vault: Address;
  readonly asset: Address;
  readonly userAddress: Address;
  readonly amount: bigint;
  readonly nativeAmount: bigint;
  readonly maxSharePrice: bigint;
  readonly requirementSignature?: RequirementSignature;
  readonly metadata?: Metadata;
}

/**
 * Composes a deprecated WDK supply with the SDK's public Bundler3 encoders.
 *
 * @internal Kept for WDK 2.x compatibility; remove with the deprecated supply API in 3.0.
 * @param params - Validated vault, additive funding, price bound, and optional legacy permit.
 * @returns A frozen flat transaction descriptor targeting Bundler3.
 * @throws {NegativeInputError} when either funding amount is negative.
 * @throws {NonPositiveInputError} when total funding or the share-price bound is not positive.
 * @throws {ChainWNativeMissingError} when native funding has no registered wrapped-native token.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets another vault asset.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the funded token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from the ERC-20 funding.
 * @throws {Permit2ExpirationMissingError} when a Permit2 AllowanceTransfer signature has no expiration.
 * @throws {UnexpectedRequirementSignatureError} when a signature other than a legacy token permit is supplied.
 * @example
 * ```ts
 * import { encodeLegacySupply } from "./legacySupply.js";
 * const tx = encodeLegacySupply({
 *   chainId: 1,
 *   vault: "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11",
 *   asset: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
 *   userAddress: "0x0000000000000000000000000000000000000001",
 *   amount: 1_000_000n,
 *   nativeAmount: 0n,
 *   maxSharePrice: 1_010_000_000_000_000_000_000_000_000n,
 * });
 * // tx contains to, value, and data for the deprecated supply route.
 * ```
 */
export function encodeLegacySupply(params: LegacySupplyParams) {
  const { chainId, asset, amount, nativeAmount, maxSharePrice } = params;
  const { requirementSignature } = params;
  if (requirementSignature && !isPermitSignature(requirementSignature)) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount < 0n)
    throw new NegativeInputError("nativeAmount", nativeAmount);
  if (amount + nativeAmount === 0n) {
    throw new NonPositiveInputError("totalAssets", 0n);
  }
  if (maxSharePrice <= 0n)
    throw new NonPositiveInputError("maxSharePrice", maxSharePrice);

  const {
    bundler3: { bundler3, generalAdapter1 },
    wNative,
  } = getChainAddresses(chainId);
  const actions: Action[] = [];
  if (nativeAmount > 0n) {
    if (wNative == null) throw new ChainWNativeMissingError(chainId);
    if (!isAddressEqual(asset, wNative)) {
      throw new NativeAmountOnNonWNativeVaultError(asset, wNative);
    }
    actions.push(
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeAmount, false],
      },
      { type: "wrapNative", args: [nativeAmount, generalAdapter1, false] },
    );
  }
  if (amount > 0n) {
    actions.push(
      ...getTokenRequirementActions({
        asset,
        amount,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    );
  }
  actions.push({
    type: "erc4626Deposit",
    args: [
      params.vault,
      amount + nativeAmount,
      maxSharePrice,
      params.userAddress,
      false,
    ],
  });
  const transaction = BundlerAction.encodeBundle(chainId, actions);
  // All descriptor fields are primitives, so freezing the descriptor makes it deeply immutable.
  return Object.freeze(
    params.metadata
      ? addTransactionMetadata(transaction, params.metadata)
      : transaction,
  );
}
