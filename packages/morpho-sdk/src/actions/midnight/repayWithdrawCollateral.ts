import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightRepayWithdrawCollateralAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import { PermitKind } from "./types.js";

/** Parameters for encoding a Midnight repay and/or collateral withdrawal bundle. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly onBehalf: Address;
  readonly collateralIndex?: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

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
 * @param params.withdrawCollateralAssets - Collateral assets withdrawn; may be zero when only repaying.
 * @param params.onBehalf - Position owner.
 * @param params.collateralIndex - Optional collateral index for withdrawal; defaults to `0n`.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundles`.
 * @throws {NegativeMidnightAmountError} when any amount, collateral index, or deadline is negative.
 * @throws {NonPositiveMidnightAmountError} when both repay and withdrawal amounts are zero.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a positive withdrawal targets an unconfigured collateral index.
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
 * ```
 */
export const midnightRepayWithdrawCollateral = (
  params: MidnightRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> => {
  if (params.repayAssets < 0n) {
    throw new NegativeMidnightAmountError("repayAssets", params.repayAssets);
  }
  if (params.withdrawCollateralAssets < 0n) {
    throw new NegativeMidnightAmountError(
      "withdrawCollateralAssets",
      params.withdrawCollateralAssets,
    );
  }
  if (params.deadline < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline);
  }
  const collateralWithdrawals =
    params.withdrawCollateralAssets > 0n
      ? [
          {
            collateralIndex: params.collateralIndex ?? 0n,
            assets: params.withdrawCollateralAssets,
          },
        ]
      : [];
  for (const [index, withdrawal] of collateralWithdrawals.entries()) {
    if (withdrawal.collateralIndex < 0n) {
      throw new NegativeMidnightAmountError(
        `collateralWithdrawals[${index}].collateralIndex`,
        withdrawal.collateralIndex,
      );
    }
  }
  if (
    params.repayAssets === 0n &&
    collateralWithdrawals.every((withdrawal) => withdrawal.assets === 0n)
  ) {
    throw new NonPositiveMidnightAmountError("repay or withdraw amount", 0n);
  }

  // Reject markets from another chain deployment before encoding the bundle.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = MarketUtils.toId(params.market);
  const market = MarketUtils.toStruct(params.market);
  for (const withdrawal of collateralWithdrawals) {
    // Validate that every withdrawal targets a configured collateral.
    MarketUtils.getCollateralByIndex(market, withdrawal.collateralIndex);
  }
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
