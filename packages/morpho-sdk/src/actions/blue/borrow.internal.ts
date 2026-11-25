import { deepFreeze } from "@morpho-org/morpho-ts";
import type { BlueBorrowAction, Transaction } from "../../types/index.js";
import type { BlueBorrowParams } from "./borrow.js";
import { encodeBlueSupplyCollateralBorrow } from "./encode.js";
import {
  type BlueSupplyCollateralBorrowInput,
  parseBlueSupplyCollateralBorrow,
} from "./supplyCollateralBorrow.internal.js";

/** Complete borrow input with collateral supply disabled. @internal */
export interface BlueBorrowInput extends BlueSupplyCollateralBorrowInput {
  readonly collateralAssets: 0n;
}

/** Constructs the complete raw borrow with a fixed inactive collateral leg. @internal */
export const parseBlueBorrow = (
  params: BlueBorrowParams & {
    readonly args: Pick<
      Parameters<typeof parseBlueSupplyCollateralBorrow>[0]["args"],
      "requirementSignature"
    >;
  },
): BlueBorrowInput &
  Pick<ReturnType<typeof parseBlueSupplyCollateralBorrow>, "bound"> => ({
  ...parseBlueSupplyCollateralBorrow({
    ...params,
    args: {
      requirementSignature: params.args.requirementSignature,
      userAddress: params.args.userAddress,
      borrowAssets: params.args.borrowAssets,
      maxLtv: params.args.maxLtv,
      reallocations: params.args.reallocations,
      deadline: params.args.deadline,
      referralFeePct: params.args.referralFeePct,
      referralFeeRecipient: params.args.referralFeeRecipient,
      authorizationSignature: params.args.authorizationSignature,
      collateralAssets: 0n,
    },
  }),
  collateralAssets: 0n,
});

/** Encodes only a completed pure borrow operation. @internal */
export const buildBlueBorrow = (
  parsed: ReturnType<typeof parseBlueBorrow>,
): Readonly<Transaction<BlueBorrowAction>> => {
  const transaction = encodeBlueSupplyCollateralBorrow(parsed);
  return deepFreeze({
    ...transaction,
    action: { ...transaction.action, type: "blueBorrow" },
  });
};
