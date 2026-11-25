import { deepFreeze } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import type {
  BlueSupplyCollateralAction,
  Transaction,
} from "../../types/index.js";
import { encodeBlueSupplyCollateralBorrow } from "./encode.js";
import type { BlueSupplyCollateralParams } from "./supplyCollateral.js";
import {
  type BlueSupplyCollateralBorrowInput,
  parseBlueSupplyCollateralBorrow,
} from "./supplyCollateralBorrow.internal.js";

/** Complete collateral-supply input with borrowing disabled. @internal */
export interface BlueSupplyCollateralInput
  extends BlueSupplyCollateralBorrowInput {
  readonly borrowAssets: 0n;
}

/** Constructs the complete raw collateral supply with a fixed inactive borrow leg. @internal */
export const parseBlueSupplyCollateral = (
  params: BlueSupplyCollateralParams & {
    readonly args: Pick<
      Parameters<typeof parseBlueSupplyCollateralBorrow>[0]["args"],
      "authorizationSignature" | "reallocations"
    >;
  },
): BlueSupplyCollateralInput &
  Pick<ReturnType<typeof parseBlueSupplyCollateralBorrow>, "bound"> => ({
  ...parseBlueSupplyCollateralBorrow({
    ...params,
    args: {
      authorizationSignature: params.args.authorizationSignature,
      reallocations: params.args.reallocations,
      userAddress: params.args.userAddress,
      collateralAssets: params.args.collateralAssets,
      nativeAmount: params.args.nativeAmount,
      deadline: params.args.deadline,
      referralFeePct: params.args.referralFeePct,
      referralFeeRecipient: params.args.referralFeeRecipient,
      requirementSignature: params.args.requirementSignature,
      borrowAssets: 0n,
      maxLtv: maxUint256,
    },
  }),
  borrowAssets: 0n,
});

/** Encodes only a completed pure collateral-supply operation. @internal */
export const buildBlueSupplyCollateral = (
  parsed: ReturnType<typeof parseBlueSupplyCollateral>,
): Readonly<Transaction<BlueSupplyCollateralAction>> => {
  const transaction = encodeBlueSupplyCollateralBorrow(parsed);
  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueSupplyCollateral" },
  });
};
