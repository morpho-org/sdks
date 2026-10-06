import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  InputExceedsMaxError,
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightRepay,
  type MidnightRepayWithdrawCollateralAction,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { midnightTake } from "./take.js";

/** Parameters for encoding a direct Midnight repayment and/or collateral withdrawal. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repay: MidnightRepay;
  /** `assets: maxUint256` withdraws the sender's whole balance of that collateral at execution. */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  readonly collateralReceiver: Address;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a reduce-only `MidnightBundlesV2` buy with no offers, so the sender's debt is repaid
 * directly, then collateral is withdrawn to `collateralReceiver`. An `assets` repay uses the
 * assets-target entrypoint with `minUnits = assets` (a direct repay counts one unit per asset); a
 * `full` repay uses the units-target entrypoint with `targetUnits = maxUint256`.
 *
 * Prefer `client.morpho.midnight(chainId).repayWithdrawCollateral(...)` in app flows so the
 * loan-token approval and Midnight authorization requirements are resolved first.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market whose position is updated.
 * @param params.repay - `{ type: "assets", assets }` (`0n` to only withdraw) or `{ type: "full", maxBuyerAssets }`.
 * @param params.collateralWithdrawals - Collateral withdrawals; `assets: maxUint256` withdraws the full balance.
 * @param params.collateralReceiver - Recipient of the withdrawn collateral.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundlesV2`.
 * @throws {NegativeInputError} when `repay.assets` is negative.
 * @throws {NonPositiveInputError} when nothing is repaid or withdrawn, a withdrawal amount is zero, `repay.maxBuyerAssets` is zero, or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `repay.maxBuyerAssets` is `maxUint256` or `deadline` exceeds uint256.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
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
 *   repay: { type: "full", maxBuyerAssets: 1_010_000n },
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   collateralReceiver: user,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightRepayWithdrawCollateral = (
  params: MidnightRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> => {
  const { repay } = params;
  if (
    repay.type === "assets" &&
    repay.assets === 0n &&
    params.collateralWithdrawals.length === 0
  ) {
    throw new NonPositiveInputError("repay or withdraw amount", 0n);
  }
  if (repay.type === "full") {
    if (repay.maxBuyerAssets <= 0n) {
      throw new NonPositiveInputError(
        "repay.maxBuyerAssets",
        repay.maxBuyerAssets,
      );
    }
    if (repay.maxBuyerAssets === maxUint256) {
      throw new InputExceedsMaxError({
        field: "repay.maxBuyerAssets",
        value: repay.maxBuyerAssets,
        max: maxUint256 - 1n,
      });
    }
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

  let tx = midnightTake({
    side: "buy",
    chainId: params.chainId,
    market: params.market,
    target:
      repay.type === "assets"
        ? { type: "assets", assets: repay.assets, minUnits: repay.assets }
        : {
            type: "units",
            units: maxUint256,
            maxBuyerAssets: repay.maxBuyerAssets,
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
        repay,
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        deadline: params.deadline,
      },
    },
  });
};
