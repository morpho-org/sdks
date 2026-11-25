import { deepFreeze } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import type { BlueRepayAction, Transaction } from "../../types/index.js";
import { encodeBlueRepayWithdrawCollateral } from "./encode.js";
import type { BlueRepayParams } from "./repay.js";
import {
  type BlueRepayInput,
  parseBlueRepayWithdrawCollateral,
} from "./repayWithdrawCollateral.internal.js";

/** Complete pure-repay input with collateral withdrawal disabled. @internal */
export interface BlueRepayOnlyInput extends BlueRepayInput {
  readonly collateralAssets: 0n;
}

/** Constructs the complete raw repay with a fixed inactive collateral leg. @internal */
export const parseBlueRepay = (
  params: BlueRepayParams & {
    readonly args: Pick<
      Parameters<typeof parseBlueRepayWithdrawCollateral>[0]["args"],
      "authorizationSignature"
    >;
  },
): BlueRepayOnlyInput &
  Pick<ReturnType<typeof parseBlueRepayWithdrawCollateral>, "bound"> => ({
  ...parseBlueRepayWithdrawCollateral({
    ...params,
    args: {
      authorizationSignature: params.args.authorizationSignature,
      userAddress: params.args.userAddress,
      repayAssets: params.args.repayAssets,
      repayShares: params.args.repayShares,
      maxRepayAssets: params.args.maxRepayAssets,
      nativeAmount: params.args.nativeAmount,
      deadline: params.args.deadline,
      referralFeePct: params.args.referralFeePct,
      referralFeeRecipient: params.args.referralFeeRecipient,
      requirementSignature: params.args.requirementSignature,
      collateralAssets: 0n,
      maxLtv: maxUint256,
    },
  }),
  collateralAssets: 0n,
});

/** Encodes only a completed pure repay operation. @internal */
export const buildBlueRepay = (
  parsed: ReturnType<typeof parseBlueRepay>,
): Readonly<Transaction<BlueRepayAction>> => {
  const transaction = encodeBlueRepayWithdrawCollateral(parsed);
  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueRepay" },
  });
};
