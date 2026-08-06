import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueBorrowAction,
  type BlueReallocation,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { getBlueAuthorizationAction } from "../signatures/getBlueAuthorizationAction.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

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
    /** Vault reallocations to execute before borrowing (computed by entity). */
    reallocations?: readonly BlueReallocation[];
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
 * When `reallocations` are provided, `reallocateTo` actions are prepended to the bundle, moving
 * liquidity from other markets via the PublicAllocator before borrowing. Reallocation fees
 * accumulate in `tx.value`.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Loan asset amount to borrow, in the loan token's smallest unit.
 * @param params.args.receiver - Address that receives the borrowed assets.
 * @param params.args.minSharePrice - Minimum borrow share price (in ray). Slippage protection.
 * @param params.args.reallocations - Optional vault reallocations to execute before borrowing,
 *   computed by the entity layer.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueBorrowAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveInputError} when `amount <= 0n` or any reallocation withdrawal amount
 *   is non-positive.
 * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128`.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source discriminator is unknown.
 * @throws {NegativeInputError} when `minSharePrice < 0n` or any reallocation fee is negative.
 * @throws {EmptyReallocationWithdrawalsError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals` is empty.
 * @throws {ReallocationWithdrawalOnTargetMarketError} from `buildReallocationActions` when any
 *   reallocation withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} from `buildReallocationActions` when
 *   reallocation withdrawals are not strictly sorted by market id.
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
  let reallocationFee = 0n;

  if (authorizationSignature) {
    actions.push(getBlueAuthorizationAction(chainId, authorizationSignature));
  }

  if (reallocations && reallocations.length > 0) {
    const result = buildReallocationActions(reallocations, marketParams);
    actions.push(...result.actions);
    reallocationFee = result.fee;
  }

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
      },
    },
  });
};
