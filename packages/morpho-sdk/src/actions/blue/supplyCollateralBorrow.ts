import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  type BlueBundlesV1TokenRequirementSignature,
  type BlueSupplyCollateralBorrowAction,
  InputExceedsMaxError,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  type Transaction,
  UnexpectedRequirementSignatureError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  type BlueBundlesV1CommonParams,
  finalizeBlueBundlesV1Transaction,
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1PublicAllocations,
  getBlueBundlesV1SignedAuthorization,
  getBlueBundlesV1TokenPermit,
  normalizeBlueBundlesV1CommonParams,
  validateBlueBundlesV1NativeFunding,
} from "./common.js";

/** Parameters for {@link blueSupplyCollateralBorrow}. */
export interface BlueSupplyCollateralBorrowParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 combined-operation arguments. */
  args: {
    /** User whose collateral and debt position is changed. */
    userAddress: Address;
    /** Gross collateral supplied; zero selects a pure borrow. */
    collateralAssets: bigint;
    /** Loan assets borrowed; zero selects a pure collateral supply. */
    borrowAssets: bigint;
    /** Maximum post-operation LTV enforced by BlueBundlesV1. */
    maxLtv: bigint;
    /** Full native collateral funding; must equal `collateralAssets`. */
    nativeAmount?: bigint;
    /** Optional validated Vault V2 BluePublicAllocator reallocations. */
    reallocations?: Iterable<VaultV2BlueReallocation>;
    /** Final call deadline in Unix seconds. */
    deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    referralFeeRecipient?: Address;
    /** Optional collateral ERC-2612 or Permit2 SignatureTransfer result. */
    requirementSignature?: BlueBundlesV1TokenRequirementSignature;
    /** Optional Morpho authorization signature for BlueBundlesV1. */
    authorizationSignature?: AuthorizationRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  metadata?: Metadata;
}

/**
 * Encodes a direct BlueBundlesV1 collateral supply and/or borrow transaction.
 *
 * Reallocations are Vault V2-only and require a borrow leg. Penalties and referral fees reduce
 * borrow proceeds. This route has no Bundler3 share-price bound or `slippageTolerance` input.
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
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional collateral token signature.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueSupplyCollateralBorrowAction>>`
 *   whose `to` address is BlueBundlesV1 and whose `action` records the normalized inputs.
 * @throws {NegativeInputError} when an amount, `maxLtv`, native value, or fee is negative.
 * @throws {NonPositiveInputError} when both operation legs are zero, the deadline is not positive,
 *   or a reallocation amount is not positive.
 * @throws {ReallocationsRequireBorrowError} when reallocations accompany no borrow.
 * @throws {InputExceedsMaxError} when a fee, reallocation amount, or penalty exceeds its ABI bound.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
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
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when a signature cannot be bound safely.
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
): Readonly<Transaction<BlueSupplyCollateralBorrowAction>> => {
  const { chainId, marketParams } = params.market;
  const {
    userAddress,
    collateralAssets,
    borrowAssets,
    maxLtv,
    requirementSignature,
    authorizationSignature,
  } = params.args;
  if (collateralAssets < 0n) {
    throw new NegativeInputError("collateralAssets", collateralAssets);
  }
  if (borrowAssets < 0n) {
    throw new NegativeInputError("borrowAssets", borrowAssets);
  }
  if (maxLtv < 0n) {
    throw new NegativeInputError("maxLtv", maxLtv);
  }
  if (collateralAssets === 0n && borrowAssets === 0n) {
    throw new NonPositiveInputError("collateralAssets or borrowAssets", 0n);
  }

  const reallocations = [...(params.args.reallocations ?? [])];
  if (borrowAssets === 0n && reallocations.length > 0) {
    throw new ReallocationsRequireBorrowError();
  }
  if (collateralAssets === 0n && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type === "permit2TransferFrom"
        ? "permit2TransferFrom"
        : "permit",
    );
  }
  if (borrowAssets === 0n && authorizationSignature != null) {
    throw new UnexpectedRequirementSignatureError("authorization");
  }

  const common: BlueBundlesV1CommonParams = {
    chainId,
    userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const { referralFeePct, referralFeeRecipient } =
    normalizeBlueBundlesV1CommonParams(common);
  const value = validateBlueBundlesV1NativeFunding({
    chainId,
    token: marketParams.collateralToken,
    fundedAmount: collateralAssets,
    nativeAmount: params.args.nativeAmount,
    requirementSignature,
  });
  const collateralPermit = getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.collateralToken,
    amount: collateralAssets,
    requirementSignature,
  });
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    chainId,
    userAddress,
    authorizationSignature,
  });
  const publicAllocations = getBlueBundlesV1PublicAllocations(
    reallocations,
    marketParams,
  );
  const reallocationPenaltyAssets =
    getBlueBundlesV1PenaltyAssets(publicAllocations);
  if (reallocationPenaltyAssets > borrowAssets) {
    throw new InputExceedsMaxError({
      field: "reallocationPenaltyAssets",
      value: reallocationPenaltyAssets,
      max: borrowAssets,
    });
  }

  return finalizeBlueBundlesV1Transaction({
    common,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        marketParams,
        collateralAssets,
        borrowAssets,
        maxLtv,
        collateralPermit,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        params.args.deadline,
      ],
    }),
    action: {
      type: "blueSupplyCollateralBorrow",
      args: {
        market: marketParams.id,
        collateralAssets,
        borrowAssets,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        reallocations: publicAllocations.length,
        reallocationPenaltyAssets,
        referralFeePct,
        referralFeeRecipient,
        deadline: params.args.deadline,
      },
    },
  });
};
