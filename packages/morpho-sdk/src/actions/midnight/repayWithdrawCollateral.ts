import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightRepayWithdrawCollateralAction,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { midnightBundlesV2Buy } from "./bundlesV2Take.js";

/** Parameters for encoding a direct Midnight repayment and/or collateral withdrawal. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Debt units repaid. `maxUint256` repays the sender's whole debt at execution; `0n` only withdraws. */
  readonly repayUnits: bigint;
  /** Loan assets pulled from the sender; the unused part is refunded. Must cover the repaid debt. */
  readonly maxRepayAssets: bigint;
  /** `assets: maxUint256` withdraws the sender's whole balance of that collateral at execution. */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  readonly collateralReceiver: Address;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a reduce-only `MidnightBundlesV2` units-target buy with no offers, so `repayUnits` of the
 * sender's debt is repaid directly, then collateral is withdrawn to `collateralReceiver`.
 *
 * Prefer `client.morpho.midnight(chainId).repayWithdrawCollateral(...)` in app flows so the
 * loan-token approval and Midnight authorization requirements are resolved first.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market whose position is updated.
 * @param params.repayUnits - Debt units repaid; `maxUint256` for the full debt, `0n` to only withdraw.
 * @param params.maxRepayAssets - Loan assets pulled from the sender and refunded when unused.
 * @param params.collateralWithdrawals - Collateral withdrawals; `assets: maxUint256` withdraws the full balance.
 * @param params.collateralReceiver - Recipient of the withdrawn collateral.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundlesV2`.
 * @throws {NegativeInputError} when `repayUnits` or `maxRepayAssets` is negative.
 * @throws {NonPositiveInputError} when nothing is repaid or withdrawn, a withdrawal amount is zero, or `deadline` is not positive.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets an unconfigured collateral index.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * // Close the position: repay all debt, then withdraw all collateral at index 0.
 * const tx = midnightRepayWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   repayUnits: maxUint256,
 *   maxRepayAssets: 1_010_000n,
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   collateralReceiver: user,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightRepayWithdrawCollateral = (
  params: MidnightRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> => {
  if (params.repayUnits === 0n && params.collateralWithdrawals.length === 0) {
    throw new NonPositiveInputError("repay or withdraw amount", 0n);
  }

  validateMidnightMarket({ market: params.market, chainId: params.chainId });

  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateralWithdrawals.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateralWithdrawals[${index}].assets`,
        assets,
      );
    }
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }

  let tx = midnightBundlesV2Buy({
    chainId: params.chainId,
    market: params.market,
    target: {
      type: "units",
      units: params.repayUnits,
      maxBuyerAssets: params.maxRepayAssets,
    },
    reduceOnly: true,
    repayEnabled: true,
    offerFills: [],
    collateralWithdrawals: params.collateralWithdrawals,
    collateralReceiver: params.collateralReceiver,
    maxContinuousFee: 0n,
    deadline: params.deadline,
  });

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightRepayWithdrawCollateral",
      args: {
        market: MarketUtils.toId(params.market),
        repayUnits: params.repayUnits,
        maxRepayAssets: params.maxRepayAssets,
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        deadline: params.deadline,
      },
    },
  });
};
