import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  type BlueWithdrawAction,
  InputExceedsMaxError,
  type Metadata,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  type BlueBundlesV1CommonParams,
  finalizeBlueBundlesV1Transaction,
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1PublicAllocations,
  getBlueBundlesV1SignedAuthorization,
  normalizeBlueBundlesV1CommonParams,
} from "./common.js";

/** Parameters for {@link blueWithdraw}. */
export interface BlueWithdrawParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 withdrawal arguments. */
  args: {
    /** User whose supply position is withdrawn. */
    userAddress: Address;
    /** Exact loan assets withdrawn, exclusive with `withdrawShares`. */
    withdrawAssets: bigint;
    /** Exact supply shares burned, exclusive with `withdrawAssets`. */
    withdrawShares: bigint;
    /** Optional validated Vault V2 BluePublicAllocator reallocations. */
    reallocations?: Iterable<VaultV2BlueReallocation>;
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
 * Encodes a direct BlueBundlesV1 loan-asset withdrawal transaction.
 *
 * Vault V2 allocator penalties and referral fees reduce the assets received. Shares mode has no
 * saturated full-close sentinel or onchain minimum-assets guarantee, and this route has no
 * Bundler3 share-price bound or `slippageTolerance` input.
 *
 * @param params - Withdrawal encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose supply position is withdrawn.
 * @param params.args.withdrawAssets - Exact assets withdrawn, exclusive with shares.
 * @param params.args.withdrawShares - Exact shares burned, exclusive with assets.
 * @param params.args.reallocations - Vault V2 reallocations executed before withdrawal.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueWithdrawAction>>` whose `to` address is
 *   BlueBundlesV1 and whose `action` records the normalized withdrawal inputs.
 * @throws {NegativeInputError} when an amount, fee, or reallocation penalty is negative.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when assets and shares are both nonzero.
 * @throws {NonPositiveInputError} when neither mode, no valid deadline, or a non-positive
 *   reallocation amount is provided.
 * @throws {InputExceedsMaxError} when a fee, reallocation amount, or penalty exceeds its ABI bound.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {DepositOwnerMismatchError} when the signed authorization owner differs from `userAddress`.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when authorization cannot be bound safely.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueWithdraw } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const tx = blueWithdraw({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: {
 *     userAddress: zeroAddress,
 *     withdrawAssets: 1_000_000n,
 *     withdrawShares: 0n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueWithdrawAction>>
 * ```
 */
export const blueWithdraw = (
  params: BlueWithdrawParams,
): Readonly<Transaction<BlueWithdrawAction>> => {
  const { chainId, marketParams } = params.market;
  const {
    userAddress,
    withdrawAssets,
    withdrawShares,
    authorizationSignature,
  } = params.args;
  if (withdrawAssets < 0n) {
    throw new NegativeInputError("withdrawAssets", withdrawAssets);
  }
  if (withdrawShares < 0n) {
    throw new NegativeInputError("withdrawShares", withdrawShares);
  }
  if (withdrawAssets > 0n && withdrawShares > 0n) {
    throw new MutuallyExclusiveWithdrawAmountsError(marketParams.id);
  }
  if (withdrawAssets === 0n && withdrawShares === 0n) {
    throw new NonPositiveInputError("withdrawAssets or withdrawShares", 0n);
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
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    chainId,
    userAddress,
    authorizationSignature,
  });
  const publicAllocations = getBlueBundlesV1PublicAllocations(
    [...(params.args.reallocations ?? [])],
    marketParams,
  );
  const reallocationPenaltyAssets =
    getBlueBundlesV1PenaltyAssets(publicAllocations);
  if (withdrawAssets > 0n && reallocationPenaltyAssets > withdrawAssets) {
    throw new InputExceedsMaxError({
      field: "reallocationPenaltyAssets",
      value: reallocationPenaltyAssets,
      max: withdrawAssets,
    });
  }

  return finalizeBlueBundlesV1Transaction({
    common,
    value: 0n,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1Withdraw",
      args: [
        marketParams,
        withdrawAssets,
        withdrawShares,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        params.args.deadline,
      ],
    }),
    action: {
      type: "blueWithdraw",
      args: {
        market: marketParams.id,
        withdrawAssets,
        withdrawShares,
        onBehalf: userAddress,
        reallocations: publicAllocations.length,
        reallocationPenaltyAssets,
        referralFeePct,
        referralFeeRecipient,
        deadline: params.args.deadline,
      },
    },
  });
};
