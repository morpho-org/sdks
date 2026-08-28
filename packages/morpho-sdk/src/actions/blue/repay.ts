import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import type {
  BlueBundlesV1TokenRequirementSignature,
  BlueRepayAction,
  Metadata,
  Transaction,
} from "../../types/index.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

/** Parameters for {@link blueRepay}. */
export interface BlueRepayParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 repay arguments. */
  args: {
    /** User whose debt is repaid. */
    userAddress: Address;
    /** Exact assets repaid, exclusive with `repayShares`. */
    repayAssets: bigint;
    /** Exact shares repaid; use `maxUint256` for a saturated full repay. */
    repayShares: bigint;
    /** Maximum gross loan-token funding, including referral fees. */
    maxRepayAssets: bigint;
    /** Full native repay funding; must equal `maxRepayAssets`. */
    nativeAmount?: bigint;
    /** Final call deadline in Unix seconds. */
    deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    referralFeeRecipient?: Address;
    /** Optional loan-token ERC-2612 or Permit2 SignatureTransfer result. */
    requirementSignature?: BlueBundlesV1TokenRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  metadata?: Metadata;
}

/**
 * Encodes a pure repayment through BlueBundlesV1.
 *
 * Delegates to {@link blueRepayWithdrawCollateral} with a zero collateral-withdrawal leg and an
 * unrestricted LTV cap. BlueBundlesV1 refunds unused `maxRepayAssets` funding.
 *
 * @param params - Repay encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose debt is repaid.
 * @param params.args.repayAssets - Exact assets repaid, exclusive with shares.
 * @param params.args.repayShares - Exact shares or `maxUint256` for full repay.
 * @param params.args.maxRepayAssets - Gross repayment and fee funding cap.
 * @param params.args.nativeAmount - Exclusive native repay funding.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled referral fee.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.requirementSignature - Optional loan-token signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueRepayAction>>` whose calldata invokes the
 *   combined BlueBundlesV1 entrypoint with a zero collateral-withdrawal leg.
 * @throws {NegativeInputError} when an amount or fee is negative.
 * @throws {MutuallyExclusiveRepayAmountsError} when assets and shares are both nonzero.
 * @throws {NonPositiveInputError} when repayment, funding, or deadline is not positive.
 * @throws {MaxRepayAssetsBelowRepayAssetsError} when funding cannot cover repayment and fees.
 * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
 * @throws {ChainWNativeMissingError} when native funding is requested without a registered wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another loan token.
 * @throws {UnexpectedRequirementSignatureError} when native funding also supplies a token signature.
 * @throws {DepositOwnerMismatchError} when the signed owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed asset differs from the loan token.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `maxRepayAssets`.
 * @throws {DepositSpenderMismatchError} when the signed spender is not BlueBundlesV1.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when a signature cannot be encoded safely.
 * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueRepay } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const tx = blueRepay({
 *   market: { chainId: mainnet.id, marketParams: markets[mainnet.id].usdc_wbtc },
 *   args: {
 *     userAddress: zeroAddress,
 *     repayAssets: 1_000_000n,
 *     repayShares: 0n,
 *     maxRepayAssets: 1_000_000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueRepayAction>>
 * ```
 */
export const blueRepay = (
  params: BlueRepayParams,
): Readonly<Transaction<BlueRepayAction>> => {
  const transaction = blueRepayWithdrawCollateral({
    ...params,
    args: {
      ...params.args,
      collateralAssets: 0n,
      maxLtv: maxUint256,
    },
  });

  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueRepay" },
  });
};
