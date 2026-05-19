import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type MarketV1WithdrawAction,
  type Metadata,
  MutuallyExclusiveWithdrawAmountsError,
  NonPositiveWithdrawAmountError,
  NonPositiveWithdrawMinSharePriceError,
  type Transaction,
  type VaultReallocation,
} from "../../types/index.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link marketV1Withdraw}. */
export interface MarketV1WithdrawParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    /** Withdraw assets amount (`0n` when withdrawing by shares). */
    assets: bigint;
    /** Withdraw shares amount (`0n` when withdrawing by assets). */
    shares: bigint;
    /** Address whose supply position is debited. The bundler uses the transaction initiator. */
    onBehalf: Address;
    /** Address that receives the withdrawn assets. */
    receiver: Address;
    /** Minimum withdraw share price (in ray). Slippage protection. */
    minSharePrice: bigint;
    /** Vault reallocations to execute before withdrawing (computed by entity). */
    reallocations?: readonly VaultReallocation[];
  };
  metadata?: Metadata;
}

/**
 * Prepares a loan-asset withdraw transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `morphoWithdraw`. Supports two modes (exactly one):
 *
 * - **By assets** (`assets > 0, shares = 0`): withdraws an exact asset amount.
 * - **By shares** (`assets = 0, shares > 0`): burns an exact share count (typical for a full
 *   supplier position close; immune to interest accrual between tx construction and execution).
 *
 * When `reallocations` are provided, `reallocateTo` actions are prepended to the bundle, moving
 * liquidity from other markets into this one via the PublicAllocator before withdrawing.
 * Reallocation fees accumulate in `tx.value`. The on-chain `morphoWithdraw` sends the assets
 * computed on-chain directly to `receiver`; no skim is required.
 *
 * Requires the user to have authorized `GeneralAdapter1` on Morpho (the bundler calls
 * `withdraw(..., onBehalf=user, ...)`).
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.assets - Withdraw amount in loan-token assets. Set to `0n` in shares mode.
 * @param params.args.shares - Withdraw amount in supply shares. Set to `0n` in assets mode.
 * @param params.args.onBehalf - Address whose Morpho supply position is debited.
 * @param params.args.receiver - Address that receives the withdrawn assets.
 * @param params.args.minSharePrice - Minimum acceptable withdraw share price (in ray). Slippage
 *   protection.
 * @param params.args.reallocations - Optional vault reallocations to execute before withdrawing,
 *   computed by the entity layer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1WithdrawAction>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveWithdrawAmountError} when both `assets` and `shares` are zero, or either is negative.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when both `assets` and `shares` are non-zero.
 * @throws {NonPositiveWithdrawMinSharePriceError} when `minSharePrice < 0n` (zero is allowed).
 * @throws {NegativeReallocationFeeError} from `buildReallocationActions` when any reallocation fee is negative.
 * @throws {EmptyReallocationWithdrawalsError} from `buildReallocationActions` when any reallocation has no withdrawals.
 * @throws {NonPositiveReallocationAmountError} from `buildReallocationActions` when any withdrawal amount <= 0.
 * @throws {ReallocationWithdrawalOnTargetMarketError} from `buildReallocationActions` when a reallocation withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} from `buildReallocationActions` when withdrawals are not strictly sorted by market id.
 * @example
 * ```ts
 * import { marketV1Withdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Withdraw({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     assets: 1_000_000_000n,
 *     shares: 0n,
 *     onBehalf: supplier,
 *     receiver: supplier,
 *     minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinWithdrawSharePrice`
 *   },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1WithdrawAction>>
 * ```
 */
export const marketV1Withdraw = ({
  market: { chainId, marketParams },
  args: { assets, shares, onBehalf, receiver, minSharePrice, reallocations },
  metadata,
}: MarketV1WithdrawParams): Readonly<Transaction<MarketV1WithdrawAction>> => {
  if (minSharePrice < 0n) {
    throw new NonPositiveWithdrawMinSharePriceError(marketParams.id);
  }

  if (assets < 0n || shares < 0n) {
    throw new NonPositiveWithdrawAmountError(marketParams.id);
  }

  if (assets > 0n && shares > 0n) {
    throw new MutuallyExclusiveWithdrawAmountsError(marketParams.id);
  }

  if (assets === 0n && shares === 0n) {
    throw new NonPositiveWithdrawAmountError(marketParams.id);
  }

  const actions: Action[] = [];
  let reallocationFee = 0n;

  if (reallocations && reallocations.length > 0) {
    const result = buildReallocationActions(reallocations, marketParams);
    actions.push(...result.actions);
    reallocationFee = result.fee;
  }

  actions.push({
    type: "morphoWithdraw",
    args: [marketParams, assets, shares, minSharePrice, receiver, false],
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
      type: "marketV1Withdraw",
      args: {
        market: marketParams.id,
        assets,
        shares,
        onBehalf,
        receiver,
        minSharePrice,
        reallocationFee,
      },
    },
  });
};
