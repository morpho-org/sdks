import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
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
  type AnyRequirementSignature,
  type Metadata,
  type MidnightRepayWithdrawCollateralAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import { getMidnightTokenPermit } from "../signatures/getMidnightTokenPermit.js";
import type { MidnightCollateralWithdrawal } from "./types.js";

/** Parameters for {@link midnightRepayWithdrawCollateral}. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly onBehalf: Address;
  readonly receiver?: Address;
  readonly collateralReceiver?: Address;
  readonly collateralIndex?: bigint;
  readonly collateralWithdrawals?: readonly MidnightCollateralWithdrawal[];
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly deadline?: bigint;
  readonly signatures?:
    | AnyRequirementSignature
    | readonly AnyRequirementSignature[];
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
  if ((params.referralFeePct ?? 0n) < 0n) {
    throw new NegativeMidnightAmountError(
      "referralFeePct",
      params.referralFeePct ?? 0n,
    );
  }
  if ((params.deadline ?? maxUint256) < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline ?? 0n);
  }
  const collateralWithdrawals =
    params.collateralWithdrawals ??
    (params.withdrawCollateralAssets > 0n
      ? [
          {
            collateralIndex: params.collateralIndex ?? 0n,
            assets: params.withdrawCollateralAssets,
          },
        ]
      : []);
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
  const collateralReceiver =
    params.collateralReceiver ?? params.receiver ?? params.onBehalf;
  const referralFeePct = params.referralFeePct ?? 0n;
  const referralFeeRecipient = params.referralFeeRecipient ?? zeroAddress;
  const deadline = params.deadline ?? maxUint256;

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
        getMidnightTokenPermit({
          token: market.loanToken,
          owner: params.onBehalf,
          spender: midnightBundles,
          amount: params.repayAssets,
          signatures: params.signatures,
        }),
        collateralWithdrawals,
        collateralReceiver,
        referralFeePct,
        referralFeeRecipient,
        deadline,
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
        collateralReceiver,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    },
  });
};
