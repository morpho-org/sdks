import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import type {
  AuthorizationRequirementSignature,
  BlueBorrowAction,
  Metadata,
  Transaction,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

/** Parameters for {@link blueBorrow}. */
export interface BlueBorrowParams {
  /** Chain and scoped Morpho Blue market. */
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct BlueBundlesV1 borrow arguments. */
  args: {
    /** User whose debt position is increased. */
    userAddress: Address;
    /** Gross loan assets borrowed before penalties and referral fees. */
    borrowAssets: bigint;
    /** Maximum post-operation LTV enforced by BlueBundlesV1. */
    maxLtv: bigint;
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
 * Encodes a pure borrow through BlueBundlesV1.
 *
 * Delegates to {@link blueSupplyCollateralBorrow} with a zero collateral leg. Vault V2 allocator
 * penalties and referral fees reduce the assets received, and no Bundler3 action is encoded.
 *
 * @param params - Borrow encoding parameters.
 * @param params.market.chainId - Chain containing BlueBundlesV1.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.userAddress - User whose debt position is increased.
 * @param params.args.borrowAssets - Gross loan assets borrowed.
 * @param params.args.maxLtv - Maximum post-operation LTV.
 * @param params.args.reallocations - Vault V2 reallocations executed before borrowing.
 * @param params.args.deadline - Final call deadline in Unix seconds.
 * @param params.args.referralFeePct - Optional WAD-scaled referral fee.
 * @param params.args.referralFeeRecipient - Recipient required for a positive fee.
 * @param params.args.authorizationSignature - Optional Blue authorization signature.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueBorrowAction>>` whose calldata invokes the
 *   combined BlueBundlesV1 entrypoint with a zero collateral leg.
 * @throws {NegativeInputError} when an amount, LTV, fee, or reallocation penalty is negative.
 * @throws {NonPositiveInputError} when the borrow, deadline, or reallocation amount is not positive.
 * @throws {InputExceedsMaxError} when a fee, reallocation amount, or penalty exceeds its bound.
 * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
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
 * import { blueBorrow } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const tx = blueBorrow({
 *   market: { chainId: mainnet.id, marketParams: markets[mainnet.id].usdc_wbtc },
 *   args: {
 *     userAddress: zeroAddress,
 *     borrowAssets: 1_000_000n,
 *     maxLtv: 850000000000000000n,
 *     deadline: 1_900_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueBorrowAction>>
 * ```
 */
export const blueBorrow = (
  params: BlueBorrowParams,
): Readonly<Transaction<BlueBorrowAction>> => {
  const transaction = blueSupplyCollateralBorrow({
    ...params,
    args: {
      ...params.args,
      collateralAssets: 0n,
    },
  });

  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueBorrow" },
  });
};
