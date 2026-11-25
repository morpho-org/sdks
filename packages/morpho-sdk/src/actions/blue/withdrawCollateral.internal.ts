import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  BlueWithdrawCollateralAction,
  Transaction,
} from "../../types/index.js";
import { encodeBlueRepayWithdrawCollateral } from "./encode.js";
import {
  type BlueRepayInput,
  parseBlueRepayWithdrawCollateral,
} from "./repayWithdrawCollateral.internal.js";
import type { BlueWithdrawCollateralParams } from "./withdrawCollateral.js";

/** Complete collateral-withdrawal input with repayment disabled. @internal */
export interface BlueWithdrawCollateralInput extends BlueRepayInput {
  readonly repayAssets: 0n;
  readonly repayShares: 0n;
  readonly maxRepayAssets: 0n;
  readonly hasRepay: false;
}

/** Constructs the complete raw collateral withdrawal with repayment disabled. @internal */
export const parseBlueWithdrawCollateral = (
  params: BlueWithdrawCollateralParams & {
    readonly args: Pick<
      Parameters<typeof parseBlueRepayWithdrawCollateral>[0]["args"],
      "requirementSignature"
    >;
  },
): BlueWithdrawCollateralInput &
  Pick<ReturnType<typeof parseBlueRepayWithdrawCollateral>, "bound"> => ({
  ...parseBlueRepayWithdrawCollateral({
    ...params,
    args: {
      requirementSignature: params.args.requirementSignature,
      userAddress: params.args.userAddress,
      collateralAssets: params.args.collateralAssets,
      maxLtv: params.args.maxLtv,
      deadline: params.args.deadline,
      referralFeePct: params.args.referralFeePct,
      referralFeeRecipient: params.args.referralFeeRecipient,
      authorizationSignature: params.args.authorizationSignature,
      repayAssets: 0n,
      repayShares: 0n,
      maxRepayAssets: 0n,
    },
  }),
  repayAssets: 0n,
  repayShares: 0n,
  maxRepayAssets: 0n,
  hasRepay: false,
});

/** Encodes only a completed pure collateral-withdrawal operation. @internal */
export const buildBlueWithdrawCollateral = (
  parsed: ReturnType<typeof parseBlueWithdrawCollateral>,
): Readonly<Transaction<BlueWithdrawCollateralAction>> => {
  const transaction = encodeBlueRepayWithdrawCollateral(parsed);
  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueWithdrawCollateral" },
  });
};
