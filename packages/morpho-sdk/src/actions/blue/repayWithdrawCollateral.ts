import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueRepayWithdrawCollateralAction,
  BundlesTokenRequirementSignature,
  Metadata,
  Transaction,
} from "../../types/index.js";
import { encodeBlueRepayWithdrawCollateral } from "./encode.js";
import { parseBlueRepayWithdrawCollateral } from "./repayWithdrawCollateral.internal.js";

/** Parameters for {@link blueRepayWithdrawCollateral}. */
export interface BlueRepayWithdrawCollateralParams {
  /** Chain and scoped Morpho Blue market. */
  readonly market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 combined-operation arguments. */
  readonly args: {
    /** User whose debt and collateral position is changed. */
    readonly userAddress: Address;
    /** Exact assets repaid, exclusive with `repayShares`. */
    readonly repayAssets: bigint;
    /** Exact shares repaid; use `maxUint256` for a saturated full repay. */
    readonly repayShares: bigint;
    /** Maximum gross loan-token funding, including referral fees. */
    readonly maxRepayAssets: bigint;
    /** Collateral assets withdrawn; zero selects a pure repay. */
    readonly collateralAssets: bigint;
    /** Maximum post-operation LTV enforced by BlueBundlesV1. */
    readonly maxLtv: bigint;
    /** Full native repay funding; must equal `maxRepayAssets`. */
    readonly nativeAmount?: bigint;
    /** Final call deadline in Unix seconds. */
    readonly deadline: bigint;
    /** Optional WAD-scaled referral fee, at most 10%. */
    readonly referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    readonly referralFeeRecipient?: Address;
    /** Optional loan-token ERC-2612 or Permit2 SignatureTransfer result. */
    readonly requirementSignature?: BundlesTokenRequirementSignature;
    /** Optional Morpho authorization signature for BlueBundlesV1. */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct BlueBundlesV1 repay and/or collateral-withdrawal transaction.
 *
 * `maxRepayAssets` funds the live repayment plus fee and BlueBundlesV1 refunds the unused amount.
 * A saturated `repayShares = maxUint256` closes the live remaining debt. This route has no
 * share-price bound or `slippageTolerance` input.
 *
 * @param params - Combined-operation encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose position is changed.
 * @param params.args.repayAssets - Exact assets repaid, exclusive with shares.
 * @param params.args.repayShares - Exact shares or `maxUint256` for full repay.
 * @param params.args.maxRepayAssets - Gross repayment and fee funding cap.
 * @param params.args.collateralAssets - Collateral withdrawn, or zero.
 * @param params.args.maxLtv - Maximum post-operation LTV.
 * @param params.args.nativeAmount - Exclusive native repay funding.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee at most 10%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional loan-token signature.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueRepayWithdrawCollateralAction>>`
 *   whose `to` address is BlueBundlesV1 and whose `action` records the normalized inputs.
 * @throws {MarketIdMismatchError} when `marketParams.id` does not hash from its tuple fields.
 * @throws {NegativeInputError} when an amount, `maxLtv`, native value, or fee is negative.
 * @throws {MutuallyExclusiveRepayAmountsError} when assets and shares are both nonzero.
 * @throws {NonPositiveInputError} when both operation legs are zero, repay funding is absent, or the deadline is invalid.
 * @throws {MaxRepayAssetsBelowRepayAssetsError} when exact-asset funding cannot cover the repayment and referral fee.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
 * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
 * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
 * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
 * @throws {UnexpectedRequirementSignatureError} when a signature is supplied for an inactive leg.
 * @throws {DepositOwnerMismatchError} when a signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the loan token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `maxRepayAssets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BundlesRequirementSignatureMismatchError} when a signature cannot be bound safely.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 * import { maxUint256, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const tx = blueRepayWithdrawCollateral({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: {
 *     userAddress: zeroAddress,
 *     repayAssets: 1_000_000n,
 *     repayShares: 0n,
 *     maxRepayAssets: 1_000_000n,
 *     collateralAssets: 0n,
 *     maxLtv: maxUint256,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueRepayWithdrawCollateralAction>>
 * ```
 */

export const blueRepayWithdrawCollateral = (
  params: BlueRepayWithdrawCollateralParams,
): Readonly<Transaction<BlueRepayWithdrawCollateralAction>> =>
  encodeBlueRepayWithdrawCollateral(parseBlueRepayWithdrawCollateral(params));
