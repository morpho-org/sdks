import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData, isAddressEqual } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import { validateUint256Field } from "../../helpers/validate.js";
import {
  type AuthorizationRequirementSignature,
  type BlueRefinanceAction,
  type Metadata,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
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

/** Parameters for {@link blueRefinance}. */
export interface BlueRefinanceParams {
  /** Chain plus source and destination Morpho Blue markets. */
  readonly market: {
    readonly chainId: number;
    readonly sourceMarketParams: MarketParams;
    readonly destinationMarketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 full-position migration arguments. */
  readonly args: {
    /**
     * User whose live source borrow position is migrated. Must also sign the Morpho authorization and
     * send the transaction: BlueBundlesV1 migrates the signer's position (bound to `msg.sender`), so
     * on-behalf refinance by a relayer is not supported.
     */
    readonly userAddress: Address;
    /** Maximum destination LTV enforced by BlueBundlesV1. */
    readonly maxLtv: bigint;
    /** Optional Vault V2 reallocations into the destination market. */
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    /** Final call deadline in Unix seconds. */
    readonly deadline: bigint;
    /** Optional WAD-scaled referral fee, strictly below 100%. */
    readonly referralFeePct?: bigint;
    /** Recipient required when `referralFeePct` is positive. */
    readonly referralFeeRecipient?: Address;
    /** Optional Morpho authorization signature for BlueBundlesV1. */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
  /** Optional transaction metadata suffix. */
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct BlueBundlesV1 full borrow-position migration transaction.
 *
 * BlueBundlesV1 reads and moves the user's complete live source debt and collateral. Source and
 * destination must use identical tokens, and referral fees plus allocator penalties increase the
 * destination debt. Partial and collateral-only migration are not supported.
 *
 * @param params - Migration encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.sourceMarketParams - Source market scoped by the Blue entity.
 * @param params.market.destinationMarketParams - Distinct compatible destination market.
 * @param params.args.userAddress - User whose live position is migrated; must sign the Morpho
 *   authorization and send the transaction (BlueBundlesV1 migrates the `msg.sender` position, so
 *   on-behalf refinance is unsupported).
 * @param params.args.maxLtv - Maximum destination LTV.
 * @param params.args.reallocations - Vault V2 reallocations into the destination.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueRefinanceAction>>` whose
 *   `to` address is BlueBundlesV1 and whose `action` records the normalized migration inputs.
 * @throws {RefinanceSameMarketError} when source and destination IDs match.
 * @throws {RefinanceTokenMismatchError} when their loan or collateral tokens differ.
 * @throws {NegativeInputError} when `maxLtv`, a referral fee, or a reallocation penalty is negative.
 * @throws {NonPositiveInputError} when the deadline or a reallocation amount is not positive.
 * @throws {InputExceedsMaxError} when a fee, reallocation amount, or penalty exceeds its ABI bound.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the destination market.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {DepositOwnerMismatchError} when the signed authorization owner differs from `userAddress`.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when authorization cannot be bound safely.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueRefinance } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const sourceMarketParams = markets[mainnet.id].eth_wstEth_2;
 * const destinationMarketParams = markets[mainnet.id].eth_wstEth;
 * const tx = blueRefinance({
 *   market: { chainId: mainnet.id, sourceMarketParams, destinationMarketParams },
 *   args: {
 *     userAddress: zeroAddress,
 *     maxLtv: 850000000000000000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueRefinanceAction>>
 * ```
 */
export const blueRefinance = (
  params: BlueRefinanceParams,
): Readonly<Transaction<BlueRefinanceAction>> => {
  const { chainId, sourceMarketParams, destinationMarketParams } =
    params.market;
  const { userAddress, maxLtv, authorizationSignature } = params.args;
  if (sourceMarketParams.id === destinationMarketParams.id) {
    throw new RefinanceSameMarketError(sourceMarketParams.id);
  }
  if (
    !isAddressEqual(
      sourceMarketParams.loanToken,
      destinationMarketParams.loanToken,
    ) ||
    !isAddressEqual(
      sourceMarketParams.collateralToken,
      destinationMarketParams.collateralToken,
    )
  ) {
    throw new RefinanceTokenMismatchError(
      sourceMarketParams.id,
      destinationMarketParams.id,
    );
  }
  validateUint256Field("maxLtv", maxLtv);

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
    destinationMarketParams,
  );
  const reallocationPenaltyAssets =
    getBlueBundlesV1PenaltyAssets(publicAllocations);

  return finalizeBlueBundlesV1Transaction({
    common,
    value: 0n,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1MigrateBorrowPosition",
      args: [
        sourceMarketParams,
        destinationMarketParams,
        maxLtv,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        params.args.deadline,
      ],
    }),
    action: {
      type: "blueRefinance",
      args: {
        sourceMarket: sourceMarketParams.id,
        destinationMarket: destinationMarketParams.id,
        maxLtv,
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
