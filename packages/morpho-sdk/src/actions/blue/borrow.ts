import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueBorrowAction,
  type BlueReallocationPlan,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { getBlueAuthorizationAction } from "../signatures/getBlueAuthorizationAction.js";
import { buildBlueReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link blueBorrow}. */
export interface BlueBorrowParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    /** Amount of loan asset to borrow. */
    amount: bigint;
    /** Address that receives the borrowed assets. */
    receiver: Address;
    /** Minimum borrow share price (in ray). Protects against share price manipulation. */
    minSharePrice: bigint;
    /** Homogeneous Vault V1 or Vault V2 reallocations to execute before borrowing. */
    reallocations?: BlueReallocationPlan;
    /**
     * Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
     * prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
     * standalone `setAuthorization` transaction.
     */
    authorizationSignature?: AuthorizationRequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a borrow transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `morphoBorrow`. The bundler uses the transaction initiator as
 * `onBehalf`. Uses `minSharePrice` to protect against share price manipulation between
 * transaction construction and execution.
 *
 * A `reallocations` plan contains either PublicAllocator V1 entries or Vault V2
 * BluePublicAllocator entries, never both. The calls run before the borrow.
 * V1 fees accumulate in `tx.value`; V2 penalties are paid in the target loan
 * token and donated directly to each vault.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Loan asset amount to borrow, in the loan token's smallest unit.
 * @param params.args.receiver - Address that receives the borrowed assets.
 * @param params.args.minSharePrice - Minimum borrow share price (in ray). Slippage protection.
 * @param params.args.reallocations - Optional homogeneous Vault V1 or Vault V2 reallocations to
 *   execute before borrowing.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueBorrowAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveInputError} when `amount <= 0n` or any reallocation withdrawal amount
 *   is non-positive.
 * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
 * @throws {InconsistentReallocationPenaltyError} when V2 entries for one vault use different penalties.
 * @throws {InvalidReallocationAddressError} when a V2 vault or adapter address is malformed.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
 * @throws {InvalidReallocationShapeError} when an entry matches both or neither V1/V2 shape.
 * @throws {MixedReallocationVersionsError} when one plan contains both V1 and V2 entries.
 * @throws {NegativeInputError} when `minSharePrice < 0n`, a V1 fee, or a V2 penalty is negative.
 * @throws {EmptyReallocationWithdrawalsError} when any `reallocation.withdrawals` is empty.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when any reallocation withdrawal references
 *   the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when reallocation withdrawals are not strictly
 *   sorted by market id.
 * @example
 * ```ts
 * import { blueBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueBorrow({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000n,
 *     receiver: borrower,
 *     minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinBorrowSharePrice` from market state + slippage tolerance
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueBorrowAction>>
 * ```
 */
export const blueBorrow = ({
  market: { chainId, marketParams },
  args: {
    amount,
    receiver,
    minSharePrice,
    reallocations,
    authorizationSignature,
  },
  metadata,
}: BlueBorrowParams): Readonly<Transaction<BlueBorrowAction>> => {
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }

  if (minSharePrice < 0n) {
    throw new NegativeInputError("minSharePrice", minSharePrice);
  }

  const actions: Action[] = [];

  if (authorizationSignature) {
    actions.push(getBlueAuthorizationAction(chainId, authorizationSignature));
  }

  const {
    actions: reallocationActions,
    fee: reallocationFee,
    penaltyAssets: reallocationPenaltyAssets,
  } = buildBlueReallocationActions({
    chainId,
    reallocations,
    targetMarketParams: marketParams,
  });
  actions.push(...reallocationActions);

  actions.push({
    type: "morphoBorrow",
    args: [marketParams, amount, 0n, minSharePrice, receiver, false],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueBorrow",
      args: {
        market: marketParams.id,
        amount,
        receiver,
        minSharePrice,
        reallocationFee,
        reallocationPenaltyAssets,
      },
    },
  });
};
