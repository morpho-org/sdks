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
 * Routed through bundler3 via `morphoBorrow`. The bundler uses the transaction
 * initiator as `onBehalf`. Uses `minSharePrice` to protect against share price
 * manipulation between transaction construction and execution.
 *
 * When `reallocations` are provided, `reallocateTo` actions are prepended to
 * the bundle, moving liquidity from other markets via the PublicAllocator
 * before borrowing. The reallocation fees are set as the transaction value.
 *
 * @param params - Borrow parameters.
 * @returns Deep-frozen transaction.
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
