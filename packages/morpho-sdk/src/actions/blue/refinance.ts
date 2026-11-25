import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueRefinanceAction,
  Metadata,
  Transaction,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import { encodeBlueRefinance } from "./encode.js";
import { parseBlueRefinance } from "./refinance.internal.js";

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
     * Intended user used to bind an optional Morpho authorization and action metadata. This value is
     * not encoded; the caller must send from the same account because BlueBundlesV1 always migrates
     * `msg.sender`.
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
 * @param params.args.userAddress - Intended user used to bind an optional Morpho authorization and
 *   action metadata. This value is not encoded; the caller must send from the same account because
 *   BlueBundlesV1 always migrates `msg.sender`.
 * @param params.args.maxLtv - Maximum destination LTV.
 * @param params.args.reallocations - Vault V2 reallocations into the destination.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled fee below 100%.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueRefinanceAction>>` whose
 *   `to` address is BlueBundlesV1 and whose `action` records the normalized migration inputs.
 * @throws {MarketIdMismatchError} when the migration source, destination, or a reallocation
 *   source market has an `id` that does not hash from its tuple fields.
 * @throws {RefinanceSameMarketError} when source and destination IDs match.
 * @throws {RefinanceTokenMismatchError} when their loan or collateral tokens differ.
 * @throws {NegativeInputError} when `maxLtv`, a referral fee, or a reallocation penalty is negative.
 * @throws {NonPositiveInputError} when the deadline or a reallocation amount is not positive.
 * @throws {InputExceedsMaxError} when a fee, reallocation amount, or penalty exceeds its ABI bound.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the destination market.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {DepositOwnerMismatchError} when the signed authorization owner differs from `userAddress`.
 * @throws {BundlesRequirementSignatureMismatchError} when authorization cannot be bound safely.
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
): Readonly<Transaction<BlueRefinanceAction>> =>
  encodeBlueRefinance(parseBlueRefinance(params));
