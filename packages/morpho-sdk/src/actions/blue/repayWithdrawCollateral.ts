import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData, maxUint256 } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  type BlueBundlesV1TokenRequirementSignature,
  type BlueRepayWithdrawCollateralAction,
  InputExceedsMaxError,
  MaxRepayAssetsBelowRepayAssetsError,
  type Metadata,
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import {
  type BlueBundlesV1CommonParams,
  finalizeBlueBundlesV1Transaction,
  getBlueBundlesV1ReferralFeeAssets,
  getBlueBundlesV1SignedAuthorization,
  getBlueBundlesV1TokenPermit,
  normalizeBlueBundlesV1CommonParams,
  validateBlueBundlesV1NativeFunding,
} from "./common.js";

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
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    readonly referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    readonly referralFeeRecipient?: Address;
    /** Optional loan-token ERC-2612 or Permit2 SignatureTransfer result. */
    readonly requirementSignature?: BlueBundlesV1TokenRequirementSignature;
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
 * Bundler3 share-price bound or `slippageTolerance` input.
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
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional loan-token signature.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueRepayWithdrawCollateralAction>>`
 *   whose `to` address is BlueBundlesV1 and whose `action` records the normalized inputs.
 * @throws {NegativeInputError} when an amount, `maxLtv`, native value, or fee is negative.
 * @throws {MutuallyExclusiveRepayAmountsError} when assets and shares are both nonzero.
 * @throws {NonPositiveInputError} when both operation legs are zero, repay funding is absent, or the deadline is invalid.
 * @throws {MaxRepayAssetsBelowRepayAssetsError} when exact-asset funding cannot cover the repayment and referral fee.
 * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
 * @throws {UnexpectedRequirementSignatureError} when a signature is supplied for an inactive leg.
 * @throws {DepositOwnerMismatchError} when a signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the loan token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `maxRepayAssets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when a signature cannot be bound safely.
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
): Readonly<Transaction<BlueRepayWithdrawCollateralAction>> => {
  const { chainId, marketParams } = params.market;
  const {
    userAddress,
    repayAssets,
    repayShares,
    maxRepayAssets,
    collateralAssets,
    maxLtv,
    requirementSignature,
    authorizationSignature,
  } = params.args;
  // Bound every uint256 ABI argument here so a direct caller receives the SDK's typed
  // `InputExceedsMaxError` rather than viem's `IntegerOutOfRangeError` at encode time
  // (`maxUint256` is a valid `repayShares` saturated-repay and `maxLtv` sentinel, so reject only
  // above it).
  for (const [field, value] of [
    ["repayAssets", repayAssets],
    ["repayShares", repayShares],
    ["maxRepayAssets", maxRepayAssets],
    ["collateralAssets", collateralAssets],
    ["maxLtv", maxLtv],
  ] as const) {
    if (value < 0n) throw new NegativeInputError(field, value);
    if (value > maxUint256) {
      throw new InputExceedsMaxError({ field, value, max: maxUint256 });
    }
  }
  if (repayAssets > 0n && repayShares > 0n) {
    throw new MutuallyExclusiveRepayAmountsError(marketParams.id);
  }
  const hasRepay = repayAssets > 0n || repayShares > 0n;
  if (!hasRepay && collateralAssets === 0n) {
    throw new NonPositiveInputError(
      "repayAssets, repayShares, or collateralAssets",
      0n,
    );
  }
  if (hasRepay && maxRepayAssets === 0n) {
    throw new NonPositiveInputError("maxRepayAssets", maxRepayAssets);
  }
  if (!hasRepay && maxRepayAssets > 0n) {
    // A withdrawal-only call has no repay leg to fund: reject stray funding so a direct caller
    // can't encode a phantom repay that needlessly pulls/refunds tokens or reverts on a missing
    // allowance. Native funding is transitively rejected because
    // `validateBlueBundlesV1NativeFunding` then requires `nativeAmount === maxRepayAssets` (= 0).
    throw new InputExceedsMaxError({
      field: "maxRepayAssets",
      value: maxRepayAssets,
      max: 0n,
    });
  }
  if (!hasRepay && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type === "permit2TransferFrom"
        ? "permit2TransferFrom"
        : "permit",
    );
  }
  if (collateralAssets === 0n && authorizationSignature != null) {
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
  const minimumRepayAssets =
    repayAssets +
    getBlueBundlesV1ReferralFeeAssets(repayAssets, referralFeePct);
  if (minimumRepayAssets > maxRepayAssets) {
    throw new MaxRepayAssetsBelowRepayAssetsError(
      maxRepayAssets,
      minimumRepayAssets,
    );
  }
  const value = validateBlueBundlesV1NativeFunding({
    chainId,
    token: marketParams.loanToken,
    fundedAmount: maxRepayAssets,
    nativeAmount: params.args.nativeAmount,
    requirementSignature,
  });
  const loanTokenPermit = getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.loanToken,
    amount: maxRepayAssets,
    requirementSignature,
  });
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    chainId,
    userAddress,
    authorizationSignature,
  });

  return finalizeBlueBundlesV1Transaction({
    common,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1RepayAndWithdrawCollateral",
      args: [
        marketParams,
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        maxLtv,
        loanTokenPermit,
        signedAuthorization,
        referralFeePct,
        referralFeeRecipient,
        params.args.deadline,
      ],
    }),
    action: {
      type: "blueRepayWithdrawCollateral",
      args: {
        market: marketParams.id,
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        referralFeePct,
        referralFeeRecipient,
        deadline: params.args.deadline,
      },
    },
  });
};
