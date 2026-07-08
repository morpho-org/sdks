import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  type MidnightRepayWithdrawCollateralAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightRepayWithdrawCollateral}. */
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

/** Encodes the repay and/or withdraw-collateral Midnight bundle. */
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
    if (withdrawal.assets < 0n) {
      throw new NegativeMidnightAmountError(
        `collateralWithdrawals[${index}].assets`,
        withdrawal.assets,
      );
    }
  }
  if (
    params.repayAssets === 0n &&
    collateralWithdrawals.every((withdrawal) => withdrawal.assets === 0n)
  ) {
    throw new NonPositiveMidnightAmountError("repay or withdraw amount", 0n);
  }

  const marketId = MarketUtils.toId(params.market);
  const market = MarketUtils.toStruct(params.market);
  for (const withdrawal of collateralWithdrawals) {
    if (withdrawal.assets > 0n) {
      // Validate that every positive withdrawal targets a configured collateral.
      MarketUtils.getCollateralByIndex(market, withdrawal.collateralIndex);
    }
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
        { kind: 0, data: "0x" },
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
