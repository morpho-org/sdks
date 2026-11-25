import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueWithdrawAction,
  Metadata,
  Transaction,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import { encodeBlueWithdraw } from "./encode.js";

import { parseBlueWithdraw } from "./withdraw.internal.js";

/** Parameters for {@link blueWithdraw}. */
export interface BlueWithdrawParams {
  /** Chain and scoped Morpho Blue market. */
  readonly market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 withdrawal arguments. */
  readonly args: {
    /** User whose supply position is withdrawn. */
    readonly userAddress: Address;
    /** Exact loan assets withdrawn, exclusive with `withdrawShares`. */
    readonly withdrawAssets: bigint;
    /** Exact supply shares burned, exclusive with `withdrawAssets`. */
    readonly withdrawShares: bigint;
    /** Optional validated Vault V2 BluePublicAllocator reallocations. */
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
 * Encodes a direct BlueBundlesV1 loan-asset withdrawal transaction.
 *
 * Vault V2 allocator penalties and referral fees reduce the assets received. Shares mode has no
 * saturated full-close sentinel or onchain minimum-assets guarantee, and this route has no
 * share-price bound or `slippageTolerance` input.
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
 * @throws {MarketIdMismatchError} when the target market or a reallocation source market has an
 *   `id` that does not hash from its tuple fields.
 * @throws {NegativeInputError} when an amount, fee, or reallocation penalty is negative.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when assets and shares are both nonzero.
 * @throws {NonPositiveInputError} when neither mode, no valid deadline, or a non-positive
 *   reallocation amount is provided.
 * @throws {InputExceedsMaxError} when a withdraw amount, fee, reallocation amount, or penalty exceeds its ABI bound.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {DepositOwnerMismatchError} when the signed authorization owner differs from `userAddress`.
 * @throws {BundlesRequirementSignatureMismatchError} when authorization cannot be bound safely.
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
): Readonly<Transaction<BlueWithdrawAction>> =>
  encodeBlueWithdraw(parseBlueWithdraw(params));
