import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  maxUint256,
  zeroAddress,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
  validateUint256Field,
} from "../../helpers/validate.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  InputExceedsMaxError,
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightRepay,
  type MidnightRepayWithdrawCollateralAction,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for encoding a direct Midnight repayment and/or collateral withdrawal. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repay: MidnightRepay;
  /**
   * Optional native ETH sent as `value`; the bundle wraps it into the chain's wNative and transfers
   * it to `msg.sender` before pulling. It may cover part or all of the maximum wNative amount this
   * call can pull, but not more. Any wrapped native not pulled stays in the sender's wallet as
   * wNative. The wNative approval to `MidnightBundlesV2` is still required for the full pulled amount.
   */
  readonly nativeAmount?: bigint;
  /** `assets: maxUint256` withdraws the sender's whole balance of that collateral at execution. */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  /** Must be non-zero when withdrawals are provided; unused otherwise. */
  readonly collateralReceiver: Address;
  /**
   * Bundle execution deadline timestamp. Unlike taker builders, `maxUint256` is accepted because
   * no offers are filled; the pull remains bounded by `repay.assets` or `repay.maxBuyerAssets`.
   */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a reduce-only `MidnightBundlesV2` buy with no offers, so the sender's debt is repaid
 * directly, then collateral is withdrawn to `collateralReceiver`. An `assets` repay uses the
 * assets-target entrypoint with `minUnits = assets` (a direct repay counts one unit per asset); a
 * `full` repay uses the units-target entrypoint with `targetUnits = maxUint256`.
 *
 * This builder reads no position or prices, so it checks neither the debt nor the collateral
 * withdrawn against the position, and applies no `DEFAULT_LLTV_BUFFER` health check. The entity
 * method checks both from `positionData` and `collateralPrices`; onchain, Midnight still rejects a
 * withdrawal that leaves the position above LLTV.
 *
 * Prefer `client.morpho.midnight(chainId).repayWithdrawCollateral(...)` in app flows so the
 * loan-token approval and Midnight authorization requirements are resolved first.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market whose position is updated.
 * @param params.repay - `{ type: "assets", assets }` (`0n` to only withdraw) or `{ type: "full", maxBuyerAssets }`.
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.collateralWithdrawals - Collateral withdrawals; `assets: maxUint256` withdraws the full balance.
 * @param params.collateralReceiver - Recipient of withdrawn collateral; must be non-zero and not
 *   a Midnight protocol or market token contract when `collateralWithdrawals` is non-empty, and is
 *   unused otherwise.
 * @param params.deadline - Bundle execution deadline timestamp. Unlike taker builders, `maxUint256`
 *   is accepted because no offers are filled; the pull remains bounded by `repay.assets` or
 *   `repay.maxBuyerAssets`. Not checked against the clock; validate freshness before building.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundlesV2`.
 * @throws {NegativeInputError} when `repay.assets` or `nativeAmount` is negative.
 * @throws {NonPositiveInputError} when nothing is repaid or withdrawn, a withdrawal amount is zero, `repay.maxBuyerAssets` is zero, or `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `repay.assets` or `repay.maxBuyerAssets` is at least `maxUint256`, a withdrawal amount or `deadline` exceeds uint256, or `nativeAmount` exceeds the maximum wNative pull, including zero for a withdraw-only call.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when `market.loanToken` is not wNative.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets an unconfigured collateral index.
 * @throws {MidnightZeroReceiverError} when collateral is withdrawn to the zero address.
 * @throws {MidnightContractReceiverError} when `collateralReceiver` is a Midnight protocol
 *   contract or a market token contract.
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
    if (repay.maxBuyerAssets >= maxUint256) {
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
    validateUint256Field(`collateralWithdrawals[${index}].assets`, assets);
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }

  if (params.collateralWithdrawals.length > 0) {
    // Rejects receivers that would strand the withdrawn collateral in a contract.
    validateMidnightReceiver({
      chainId: params.chainId,
      market: params.market,
      field: "collateralReceiver",
      receiver: params.collateralReceiver,
    });
  }

  if (repay.type === "assets") {
    validateUint256Field("repay.assets", repay.assets);
    // An assets repay has no "whole debt" sentinel; use `{ type: "full" }` for that.
    if (repay.assets === maxUint256) {
      throw new InputExceedsMaxError({
        field: "repay.assets",
        value: repay.assets,
        max: maxUint256 - 1n,
      });
    }
  }
  validateDeadline(params.deadline);
  const market = MarketUtils.toStruct(params.market);
  const nativeFunding = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [
      {
        token: market.loanToken,
        assets: repay.type === "assets" ? repay.assets : repay.maxBuyerAssets,
      },
    ],
  });
  const args = [
    true, // reduceOnly
    true, // repayEnabled
    [], // offerFills
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
    0n, // referralFeePct
    zeroAddress, // referralFeeRecipient
    // MidnightBundlesV2 checks maxContinuousFee only per offer fill; there are none here.
    0n, // maxContinuousFee
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      repay.type === "assets"
        ? encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, repay.assets, repay.assets, ...args],
          })
        : encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, maxUint256, repay.maxBuyerAssets, ...args],
          }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightRepayWithdrawCollateral",
      args: {
        market: MarketUtils.toId(params.market),
        repay: { ...repay },
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        deadline: params.deadline,
      },
    },
  });
};
