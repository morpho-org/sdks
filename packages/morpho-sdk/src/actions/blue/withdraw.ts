import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueReallocation,
  type BlueWithdrawAction,
  type Metadata,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { getBlueAuthorizationAction } from "../signatures/getBlueAuthorizationAction.js";
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
     * Public Allocator V1 or V2 reallocations to execute before withdrawing. V1 entries can be
     * computed via `MorphoBlue.getReallocations({ operation: "withdraw", amount })` or directly
     * via `computeVaultV1Reallocations({ operation: "withdraw", amount, ... })`.
     */
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
 * Prepares a loan-asset withdraw transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `morphoWithdraw`. Supports two modes (exactly one):
 *
 * - **By assets** (`assets > 0, shares = 0`): withdraws an exact asset amount.
 * - **By shares** (`assets = 0, shares > 0`): burns an exact share count (typical for a full
 *   supplier position close; immune to interest accrual between tx construction and execution).
 *
 * When `reallocations` are provided, V1 entries encode `reallocateTo`, while V2 market and idle
 * entries encode `reallocate` and `allocateFromIdle`. The calls run before the withdraw. V1
 * fees accumulate in `tx.value`; V2 penalties are paid in the target loan
 * token and donated to the vaults. The on-chain `morphoWithdraw` sends the
 * assets computed on-chain directly to `receiver`; no skim is required.
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
 * @param params.args.reallocations - Optional Public Allocator V1 or V2 reallocations to execute
 *   before withdrawing.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueWithdrawAction>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator the simulation layer consumes.
 * @throws {NegativeInputError} when `assets`, `shares`, `minSharePrice`, a V1 fee, or a V2
 *   penalty is negative.
 * @throws {NonPositiveInputError} when both `assets` and `shares` are zero or any reallocation
 *   withdrawal amount is non-positive.
 * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
 * @throws {InconsistentReallocationPenaltyError} when V2 entries for one allocator-vault pair use different penalties.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source discriminator is unknown.
 * @throws {InvalidReallocationTypeError} when a top-level reallocation variant is unknown.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when both `assets` and `shares` are non-zero.
 * @throws {EmptyReallocationWithdrawalsError} when any reallocation has no withdrawals.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a reallocation withdrawal references
 *   the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when reallocation withdrawals are not strictly
 *   sorted by market id.
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

  if (assets < 0n) {
    throw new NegativeInputError("assets", assets);
  }
  if (shares < 0n) {
    throw new NegativeInputError("shares", shares);
  }
  if (assets === 0n && shares === 0n) {
    throw new NonPositiveInputError("assets or shares", 0n);
  }

  if (minSharePrice < 0n) {
    throw new NegativeInputError("minSharePrice", minSharePrice);
  }

  const actions: Action[] = [];
  let reallocationFee = 0n;
  let reallocationPenaltyAssets = 0n;

  if (authorizationSignature) {
    actions.push(getBlueAuthorizationAction(chainId, authorizationSignature));
  }

  if (reallocations && reallocations.length > 0) {
    const result = buildReallocationActions({
      chainId,
      reallocations,
      targetMarketParams: marketParams,
    });
    actions.push(...result.actions);
    reallocationFee = result.fee;
    reallocationPenaltyAssets = result.penaltyAssets;
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
        reallocationPenaltyAssets,
      },
    },
  });
};
