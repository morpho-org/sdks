import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AnyRequirementSignature,
  type Metadata,
  type MidnightRepayWithdrawCollateralAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import { encodeMidnightTokenPermit } from "./encodeMidnightTokenPermit.js";
import type { MidnightCollateralWithdrawal } from "./types.js";

/** Parameters for {@link midnightRepayWithdrawCollateral}. */
export interface MidnightRepayWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly onBehalf: Address;
  readonly receiver?: Address;
  readonly collateralIndex?: bigint;
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
  if (params.repayAssets === 0n && params.withdrawCollateralAssets === 0n) {
    throw new NonPositiveMidnightAmountError("repay or withdraw amount", 0n);
  }

  const marketId = MarketUtils.toId({
    market: params.market,
    chainId: params.chainId,
  });
  const market = MarketUtils.toStruct(params.market);
  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");
  const receiver = params.receiver ?? params.onBehalf;
  const collateralWithdrawals: readonly MidnightCollateralWithdrawal[] =
    params.withdrawCollateralAssets > 0n
      ? [
          {
            collateralIndex: params.collateralIndex ?? 0n,
            assets: params.withdrawCollateralAssets,
          },
        ]
      : [];

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "repayAndWithdrawCollateral",
      args: [
        market,
        params.repayAssets,
        params.onBehalf,
        encodeMidnightTokenPermit({
          token: market.loanToken,
          owner: params.onBehalf,
          spender: midnightBundles,
          amount: params.repayAssets,
          signatures: params.signatures,
        }),
        collateralWithdrawals,
        receiver,
        0n,
        zeroAddress,
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
        withdrawCollateralAssets: params.withdrawCollateralAssets,
        onBehalf: params.onBehalf,
        receiver,
      },
    },
  });
};
