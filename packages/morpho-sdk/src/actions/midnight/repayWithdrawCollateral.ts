import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { parseDeadline, parseUint256 } from "../../helpers/parse.js";
import {
  type MidnightMarket,
  parseMidnightMarketDeployment,
  parseMidnightMarketInput,
  parseMidnightNativeFunding,
} from "../../helpers/parseMidnight.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import { validatePositiveInput } from "../../helpers/validatePositiveInput.js";
import {
  InputExceedsMaxError,
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightRepay,
  type MidnightRepayWithdrawCollateralAction,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { encodeMidnightRepayWithdrawCollateral } from "./encode.js";
import { snapshotMidnightMetadata } from "./parse.js";

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
 * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when `market.loanToken` is not wNative.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets an unconfigured collateral index.
 * @throws {MidnightZeroReceiverError} when collateral is withdrawn to the zero address.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
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
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> =>
  encodeMidnightRepayWithdrawCollateral(
    parseMidnightRepayWithdrawCollateral(params),
  );

const parsedRepayWithdrawCollateral = Symbol();

/** Owned inputs for the repayWithdrawCollateral encoder. @internal */
export interface ParsedMidnightRepayWithdrawCollateral
  extends Omit<MidnightRepayWithdrawCollateralParams, "market"> {
  readonly market: MidnightMarket;
  readonly nativeFunding: ReturnType<typeof parseMidnightNativeFunding>;
  readonly deadline: bigint;
  readonly [parsedRepayWithdrawCollateral]: true;
}

/** Parses static repayWithdrawCollateral constraints using the existing error order. @internal */
export const parseMidnightRepayWithdrawCollateral = (
  params: MidnightRepayWithdrawCollateralParams,
): ParsedMidnightRepayWithdrawCollateral => {
  const repay = Object.freeze(
    params.repay.type === "assets"
      ? { type: "assets" as const, assets: params.repay.assets }
      : { type: "full" as const, maxBuyerAssets: params.repay.maxBuyerAssets },
  );
  if (
    repay.type === "assets" &&
    repay.assets === 0n &&
    params.collateralWithdrawals.length === 0
  ) {
    throw new NonPositiveInputError("repay or withdraw amount", 0n);
  }
  if (repay.type === "full") {
    // Validation only; rejects non-positive amounts.
    validatePositiveInput("repay.maxBuyerAssets", repay.maxBuyerAssets);
    if (repay.maxBuyerAssets >= maxUint256) {
      throw new InputExceedsMaxError({
        field: "repay.maxBuyerAssets",
        value: repay.maxBuyerAssets,
        max: maxUint256 - 1n,
      });
    }
  }

  const parsedMarket = parseMidnightMarketDeployment(
    params.market,
    params.chainId,
  );
  const collateralWithdrawals = params.collateralWithdrawals.map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );

  for (const [
    index,
    { collateralIndex, assets },
  ] of collateralWithdrawals.entries()) {
    // Validation only; retain main's positivity guard and the owned withdrawal ABI bound.
    validatePositiveInput(`collateralWithdrawals[${index}].assets`, assets);
    parseUint256(`collateralWithdrawals[${index}].assets`, assets);
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(parsedMarket.struct, collateralIndex);
  }

  validateMidnightAddress("collateralReceiver", params.collateralReceiver);
  if (params.collateralWithdrawals.length > 0) {
    // Rejects receivers that would strand the withdrawn collateral in a contract.
    validateMidnightReceiver({
      chainId: params.chainId,
      market: parsedMarket.struct,
      field: "collateralReceiver",
      receiver: params.collateralReceiver,
    });
  }

  if (repay.type === "assets") {
    // Enforce the assets-repay ABI bound.
    parseUint256("repay.assets", repay.assets);
    // An assets repay has no "whole debt" sentinel; use `{ type: "full" }` for that.
    if (repay.assets === maxUint256) {
      throw new InputExceedsMaxError({
        field: "repay.assets",
        value: repay.assets,
        max: maxUint256 - 1n,
      });
    }
  }
  const deadline = parseDeadline(params.deadline);
  const market = parsedMarket.struct;
  const nativeFunding = parseMidnightNativeFunding({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [
      {
        token: market.loanToken,
        assets: repay.type === "assets" ? repay.assets : repay.maxBuyerAssets,
      },
    ],
  });
  return deepFreeze({
    chainId: params.chainId,
    market: parseMidnightMarketInput(
      parsedMarket,
      repay.type === "assets"
        ? "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
        : "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
    ),
    repay,
    deadline,
    nativeFunding,
    collateralWithdrawals,
    collateralReceiver: params.collateralReceiver,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedRepayWithdrawCollateral]: true as const,
  });
};
