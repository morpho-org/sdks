import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueWithdrawAction,
  type Metadata,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeWithdrawMinSharePriceError,
  NonPositiveWithdrawAmountError,
  type Transaction,
  type VaultReallocation,
} from "../../types/index.js";
import { getAuthorizationAction } from "../requirements/getAuthorizationAction.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link blueWithdraw}. */
export interface BlueWithdrawParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    /** Withdraw assets amount (`0n` when withdrawing by shares). */
    assets: bigint;
    /** Withdraw shares amount (`0n` when withdrawing by assets). */
    shares: bigint;
    /** Address that receives the withdrawn assets. */
    receiver: Address;
    /** Minimum withdraw share price (in ray). Slippage protection. */
    minSharePrice: bigint;
    /**
     * Vault reallocations to execute before withdrawing. Compute via
     * `MorphoBlue.getReallocations({ operation: "withdraw", amount })` or directly via
     * `computeReallocations({ operation: "withdraw", amount, ... })`.
     */
    reallocations?: readonly VaultReallocation[];
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
 * The withdraw is performed on behalf of the transaction initiator (signer) — there is no
 * separate `onBehalf` field; mirror `blueBorrow`. The entity layer keeps `receiver` aligned
 * with the user when none is provided. Requires the user to have authorized `GeneralAdapter1`
 * on Morpho.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.assets - Withdraw amount in loan-token assets. Set to `0n` in shares mode.
 * @param params.args.shares - Withdraw amount in supply shares. Set to `0n` in assets mode.
 * @param params.args.receiver - Address that receives the withdrawn assets.
 * @param params.args.minSharePrice - Minimum acceptable withdraw share price (in ray). Slippage
 *   protection.
 * @param params.args.reallocations - Optional vault reallocations to execute before withdrawing,
 *   computed by the entity layer.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueWithdrawAction>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveWithdrawAmountError} when both `assets` and `shares` are zero, or either is negative.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when both `assets` and `shares` are non-zero.
 * @throws {NegativeWithdrawMinSharePriceError} when `minSharePrice < 0n` (zero is allowed despite
 *   the class name — pattern preserved for symmetry with `blueBorrow`).
 * @throws Reallocation errors from `buildReallocationActions` when `reallocations` is malformed
 *   (see its JSDoc: `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`,
 *   `NonPositiveReallocationAmountError`, `ReallocationWithdrawalOnTargetMarketError`,
 *   `UnsortedReallocationWithdrawalsError`).
 * @example
 * ```ts
 * import { blueWithdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueWithdraw({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     assets: 1_000_000_000n,
 *     shares: 0n,
 *     receiver: supplier,
 *     minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinWithdrawSharePrice` from market state + slippage tolerance
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueWithdrawAction>>
 * ```
 */
export const blueWithdraw = ({
  market: { chainId, marketParams },
  args: {
    assets,
    shares,
    receiver,
    minSharePrice,
    reallocations,
    authorizationSignature,
  },
  metadata,
}: BlueWithdrawParams): Readonly<Transaction<BlueWithdrawAction>> => {
  // Mutual exclusion is detected on "both values present" (either non-zero),
  // before sign checks — otherwise `{ assets: -1n, shares: 5n }` would be
  // misreported as a positivity error rather than the actual mode conflict.
  if (assets !== 0n && shares !== 0n) {
    throw new MutuallyExclusiveWithdrawAmountsError(marketParams.id);
  }

  if (assets < 0n || shares < 0n || (assets === 0n && shares === 0n)) {
    throw new NonPositiveWithdrawAmountError(marketParams.id);
  }

  if (minSharePrice < 0n) {
    throw new NegativeWithdrawMinSharePriceError(marketParams.id);
  }

  const actions: Action[] = [];
  let reallocationFee = 0n;

  if (authorizationSignature) {
    actions.push(getAuthorizationAction(authorizationSignature));
  }

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
      type: "blueWithdraw",
      args: {
        market: marketParams.id,
        assets,
        shares,
        receiver,
        minSharePrice,
        reallocationFee,
      },
    },
  });
};
