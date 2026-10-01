import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { resolveMidnightCollateralWithdrawals } from "../../helpers/resolveMidnightCollateralAmounts.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightRepayWithdrawCollateralAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { type MidnightCollateralWithdrawalInput, PermitKind } from "./types.js";

/**
 * Parameters for encoding a Midnight repay and/or collateral withdrawal
 * bundle. Pass either `withdrawCollateralAssets` (and optional
 * `collateralIndex`) or a `collateralWithdrawals` list.
 */
export type MidnightRepayWithdrawCollateralParams = {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repayAssets: bigint;
  readonly onBehalf: Address;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
} & MidnightCollateralWithdrawalInput;

/**
 * Encodes a Midnight bundle that repays debt, withdraws collateral, or both.
 *
 * Prefer `client.morpho.midnight(chainId).repayWithdrawCollateral(...)` in app
 * flows so loan-token approval and Midnight authorization requirements are
 * resolved first. Use this low-level builder only when those requirements and
 * collateral-index checks are already handled by the caller.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundles`.
 * @param params.market - Midnight market whose position is updated.
 * @param params.repayAssets - Loan assets repaid; may be zero when only withdrawing collateral.
 * @param params.withdrawCollateralAssets - Collateral assets withdrawn; may be zero when only repaying (single-collateral form).
 * @param params.collateralIndex - Optional collateral index for `withdrawCollateralAssets`; defaults to `0n`.
 * @param params.collateralWithdrawals - Collateral withdrawn, one entry per unique index, encoded in order; may be empty when only repaying (multi-collateral form).
 * @param params.onBehalf - Position owner.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundles`.
 * @throws {NegativeInputError} when any amount, collateral index, or deadline is negative.
 * @throws {NonPositiveInputError} when a `collateralWithdrawals` amount is non-positive, or nothing is repaid or withdrawn.
 * @throws {DuplicateMidnightCollateralIndexError} when `collateralWithdrawals` repeats an index.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets an unconfigured collateral index.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightRepayWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   repayAssets: 1_000_000n,
 *   withdrawCollateralAssets: 0n,
 *   onBehalf: user,
 *   deadline: maxUint256,
 * });
 *
 * const multiCollateralTx = midnightRepayWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   repayAssets: 1_000_000n,
 *   collateralWithdrawals: [
 *     { collateralIndex: 0n, assets: 500_000n },
 *     { collateralIndex: 1n, assets: 10_000n },
 *   ],
 *   onBehalf: user,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightRepayWithdrawCollateral = (
  params: MidnightRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> => {
  if (params.repayAssets < 0n) {
    throw new NegativeInputError("repayAssets", params.repayAssets);
  }
  if (params.deadline < 0n) {
    throw new NegativeInputError("deadline", params.deadline);
  }
  const collateralWithdrawals = resolveMidnightCollateralWithdrawals(
    params.market,
    params,
  );
  if (params.repayAssets === 0n && collateralWithdrawals.length === 0) {
    throw new NonPositiveInputError("repay or withdraw amount", 0n);
  }

  // Reject markets from another chain deployment before encoding the bundle.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = MarketUtils.toId(params.market);
  const market = MarketUtils.toStruct(params.market);
  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "midnightBundlesV1RepayAndWithdrawCollateral",
      args: [
        market,
        params.repayAssets,
        params.onBehalf,
        { kind: PermitKind.None, data: "0x" },
        collateralWithdrawals,
        params.onBehalf,
        0n,
        zeroAddress,
        params.deadline,
      ],
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
        market: marketId,
        repayAssets: params.repayAssets,
        collateralWithdrawals: collateralWithdrawals.length,
        onBehalf: params.onBehalf,
        collateralReceiver: params.onBehalf,
        deadline: params.deadline,
      },
    },
  });
};
