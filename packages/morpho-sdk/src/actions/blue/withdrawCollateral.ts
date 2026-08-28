import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueWithdrawCollateralAction,
  Metadata,
  Transaction,
} from "../../types/index.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

/** Parameters for {@link blueWithdrawCollateral}. */
export interface BlueWithdrawCollateralParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 collateral-withdrawal arguments. */
  args: {
    /** User whose collateral position is reduced. */
    userAddress: Address;
    /** Collateral assets withdrawn. */
    collateralAssets: bigint;
    /** Maximum post-operation LTV enforced by BlueBundlesV1. */
    maxLtv: bigint;
    /** Final call deadline in Unix seconds. */
    deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    referralFeeRecipient?: Address;
    /** Optional Morpho authorization signature for BlueBundlesV1. */
    authorizationSignature?: AuthorizationRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  metadata?: Metadata;
}

/**
 * Encodes a pure collateral withdrawal through BlueBundlesV1.
 *
 * Delegates to {@link blueRepayWithdrawCollateral} with a zero repay leg. BlueBundlesV1 enforces
 * the supplied post-operation LTV, and no standalone Morpho or Bundler3 call is encoded.
 *
 * @param params - Collateral-withdrawal encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose collateral position is reduced.
 * @param params.args.collateralAssets - Collateral assets withdrawn.
 * @param params.args.maxLtv - Maximum post-operation LTV.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled referral fee.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueWithdrawCollateralAction>>` whose calldata
 *   invokes the combined BlueBundlesV1 entrypoint with a zero repay leg.
 * @throws {NegativeInputError} when collateral, LTV, or fee is negative.
 * @throws {NonPositiveInputError} when collateral or deadline is not positive.
 * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {DepositOwnerMismatchError} when the signed authorization owner differs from `userAddress`.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when authorization cannot be bound safely.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueWithdrawCollateral } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const tx = blueWithdrawCollateral({
 *   market: { chainId: mainnet.id, marketParams: markets[mainnet.id].usdc_wbtc },
 *   args: {
 *     userAddress: zeroAddress,
 *     collateralAssets: 1_000_000_000_000_000_000n,
 *     maxLtv: 850000000000000000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueWithdrawCollateralAction>>
 * ```
 */
export const blueWithdrawCollateral = (
  params: BlueWithdrawCollateralParams,
): Readonly<Transaction<BlueWithdrawCollateralAction>> => {
  const transaction = blueRepayWithdrawCollateral({
    ...params,
    args: {
      ...params.args,
      repayAssets: 0n,
      repayShares: 0n,
      maxRepayAssets: 0n,
    },
  });

  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueWithdrawCollateral" },
  });
};
