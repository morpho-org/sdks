import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueSupplyCollateralBorrowAction,
  BundlesTokenRequirementSignature,
  Metadata,
  Transaction,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import { encodeBlueSupplyCollateralBorrow } from "./encode.js";
import { parseBlueSupplyCollateralBorrow } from "./supplyCollateralBorrow.internal.js";

/** Parameters for {@link blueSupplyCollateralBorrow}. */
export interface BlueSupplyCollateralBorrowParams {
  /** Chain and scoped Morpho Blue market. */
  readonly market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 combined-operation arguments. */
  readonly args: {
    /** User whose collateral and debt position is changed. */
    readonly userAddress: Address;
    /** Gross collateral supplied; zero selects a pure borrow. */
    readonly collateralAssets: bigint;
    /** Loan assets borrowed; zero selects a pure collateral supply. */
    readonly borrowAssets: bigint;
    /** Maximum post-operation LTV enforced by BlueBundlesV1. */
    readonly maxLtv: bigint;
    /** Full native collateral funding; must equal `collateralAssets`. */
    readonly nativeAmount?: bigint;
    /** Optional validated Vault V2 BluePublicAllocator reallocations. */
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    /** Maximum WAD-scaled penalty rate per reallocation, defaulting to zero; it does not bound total proceeds lost. */
    readonly maxPenalty?: bigint;
    /** Final call deadline in Unix seconds. */
    readonly deadline: bigint;
    /** Optional WAD-scaled referral fee, at most 10%. */
    readonly referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    readonly referralFeeRecipient?: Address;
    /** Optional collateral ERC-2612 or Permit2 SignatureTransfer result. */
    readonly requirementSignature?: BundlesTokenRequirementSignature;
    /** Optional Morpho authorization signature for BlueBundlesV1. */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct BlueBundlesV1 collateral supply and/or borrow transaction.
 *
 * Reallocations are Vault V2-only and require a borrow leg. Penalties and referral fees reduce
 * borrow proceeds. This route has no share-price bound or `slippageTolerance` input.
 *
 * @param params - Combined-operation encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose position is changed.
 * @param params.args.collateralAssets - Gross collateral supplied, or zero.
 * @param params.args.borrowAssets - Loan assets borrowed, or zero.
 * @param params.args.maxLtv - Maximum post-operation LTV.
 * @param params.args.nativeAmount - Exclusive native collateral funding.
 * @param params.args.reallocations - Vault V2 reallocations executed before borrowing.
 * @param params.args.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee at most 10%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional collateral token signature.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueSupplyCollateralBorrowAction>>`
 *   whose `to` address is BlueBundlesV1 and whose `action` records the normalized inputs.
 * @throws {MarketIdMismatchError} when the target market or a reallocation source market has an
 *   `id` that does not hash from its tuple fields.
 * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
 * @throws {NegativeInputError} when an amount, `maxLtv`, native value, or fee is negative.
 *   Also thrown when maxPenalty is negative.
 * @throws {NonPositiveInputError} when both operation legs are zero, the deadline is not positive,
 *   or a reallocation amount is not positive.
 * @throws {ReallocationsRequireBorrowError} when reallocations accompany no borrow.
 * @throws {InputExceedsMaxError} when a reallocation amount or penalty exceeds its ABI bound.
 *   Also thrown when maxPenalty exceeds WAD or a penalty exceeds maxPenalty (zero by default).
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
 * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
 * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
 * @throws {UnexpectedRequirementSignatureError} when a signature is supplied for an inactive leg.
 * @throws {DepositOwnerMismatchError} when a signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the collateral token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `collateralAssets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BundlesRequirementSignatureMismatchError} when a signature cannot be bound safely.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueSupplyCollateralBorrow } from "@morpho-org/morpho-sdk";
 * import { maxUint256, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const tx = blueSupplyCollateralBorrow({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: {
 *     userAddress: zeroAddress,
 *     collateralAssets: 1_000_000_000_000_000_000n,
 *     borrowAssets: 0n,
 *     maxLtv: maxUint256,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueSupplyCollateralBorrowAction>>
 * ```
 */
export const blueSupplyCollateralBorrow = (
  params: BlueSupplyCollateralBorrowParams,
): Readonly<Transaction<BlueSupplyCollateralBorrowAction>> =>
  encodeBlueSupplyCollateralBorrow(parseBlueSupplyCollateralBorrow(params));
