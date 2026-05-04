import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type MarketV1BorrowAction,
  type Metadata,
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
  type Transaction,
  type VaultReallocation,
} from "../../types/index.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link marketV1Borrow}. */
export interface MarketV1BorrowParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    amount: bigint;
    receiver: Address;
    /** Minimum borrow share price (in ray). Protects against share price manipulation. */
    minSharePrice: bigint;
    /** Vault reallocations to execute before borrowing (computed by entity). */
    reallocations?: readonly VaultReallocation[];
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
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1BorrowAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveBorrowAmountError} when `amount <= 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minSharePrice < 0n`.
 * @example
 * ```ts
 * import { marketV1Borrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Borrow({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000n,
 *     receiver: borrower,
 *     minSharePrice: 0n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1BorrowAction>>
 * ```
 */
export const marketV1Borrow = ({
  market: { chainId, marketParams },
  args: { amount, receiver, minSharePrice, reallocations },
  metadata,
}: MarketV1BorrowParams): Readonly<Transaction<MarketV1BorrowAction>> => {
  if (amount <= 0n) {
    throw new NonPositiveBorrowAmountError(marketParams.id);
  }

  if (minSharePrice < 0n) {
    throw new NonPositiveMinBorrowSharePriceError(marketParams.id);
  }

  const actions: Action[] = [];
  let reallocationFee = 0n;

  if (reallocations && reallocations.length > 0) {
    const result = buildReallocationActions(reallocations, marketParams);
    actions.push(...result.actions);
    reallocationFee = result.fee;
  }

  actions.push({
    type: "morphoBorrow",
    args: [marketParams, amount, 0n, minSharePrice, receiver, false],
  });

  let tx = {
    ...BundlerAction.encodeBundle(chainId, actions),
    value: reallocationFee,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "marketV1Borrow",
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
