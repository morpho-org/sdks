import { parseUint256 } from "../../helpers/parse.js";
import {
  MaxRepayAssetsBelowRepayAssetsError,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import {
  getBlueBundlesV1SignedAuthorization,
  getBlueBundlesV1TokenPermit,
} from "./common.js";
import type {
  BlueRepayInput,
  parseBlueRepayMode,
} from "./repayWithdrawCollateral.internal.js";
import type { BlueRepayWithdrawCollateralParams } from "./repayWithdrawCollateral.js";
import type { BlueSupplyCollateralBorrowInput } from "./supplyCollateralBorrow.internal.js";
import type { BlueSupplyCollateralBorrowParams } from "./supplyCollateralBorrow.js";

/** Validates signature presence for inactive legs. @internal */
export const validateBlueSupplyCollateralBorrowSignatureLegs = (
  amounts: { readonly collateralAssets: bigint; readonly borrowAssets: bigint },
  signatures: Pick<
    BlueSupplyCollateralBorrowParams["args"],
    "requirementSignature" | "authorizationSignature"
  >,
) => {
  const { collateralAssets, borrowAssets } = amounts;
  const { requirementSignature, authorizationSignature } = signatures;
  if (collateralAssets === 0n && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  if (borrowAssets === 0n && authorizationSignature != null) {
    throw new UnexpectedRequirementSignatureError("authorization");
  }
};

/** Independently binds signatures for active funding and borrow legs. @internal */
export const bindBlueSupplyCollateralBorrowSignatures = (
  parsed: Pick<
    BlueSupplyCollateralBorrowInput,
    "chainId" | "userAddress" | "marketParams" | "collateralAssets" | "value"
  >,
  signatures: Pick<
    BlueSupplyCollateralBorrowParams["args"],
    "requirementSignature" | "authorizationSignature"
  >,
): {
  readonly collateralPermit: ReturnType<typeof getBlueBundlesV1TokenPermit>;
  readonly signedAuthorization: ReturnType<
    typeof getBlueBundlesV1SignedAuthorization
  >;
} => {
  const { chainId, userAddress, marketParams, collateralAssets, value } =
    parsed;
  const { requirementSignature, authorizationSignature } = signatures;
  if (value > 0n && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  const collateralPermit = getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.collateralToken,
    amount: collateralAssets,
    requirementSignature,
  });
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    chainId,
    userAddress,
    authorizationSignature,
  });

  return { collateralPermit, signedAuthorization };
};

/** Validates signatures for inactive repay/withdraw legs. @internal */
export const validateBlueRepaySignatureLegs = (
  mode: Pick<
    ReturnType<typeof parseBlueRepayMode>,
    "hasRepay" | "collateralAssets"
  >,
  signatures: Pick<
    BlueRepayWithdrawCollateralParams["args"],
    "requirementSignature" | "authorizationSignature"
  >,
) => {
  const { hasRepay, collateralAssets } = mode;
  const { requirementSignature, authorizationSignature } = signatures;
  if (!hasRepay && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  if (collateralAssets === 0n && authorizationSignature != null) {
    throw new UnexpectedRequirementSignatureError("authorization");
  }
};

/** Parses fresh signature-selected full-repay funding. @internal */
export const parseBlueRepaySignatureFunding = (
  parsed: BlueRepayInput,
  signatures: Pick<
    BlueRepayWithdrawCollateralParams["args"],
    "requirementSignature" | "authorizationSignature"
  > & { readonly signatureFunding?: boolean },
) => {
  const { repayShares } = parsed;
  const { requirementSignature, signatureFunding = false } = signatures;
  const selectedMaxRepayAssets =
    signatureFunding && repayShares > 0n && requirementSignature != null
      ? requirementSignature.args.amount
      : parsed.maxRepayAssets;
  if (selectedMaxRepayAssets < parsed.maxRepayAssets) {
    throw new MaxRepayAssetsBelowRepayAssetsError(
      selectedMaxRepayAssets,
      parsed.maxRepayAssets,
    );
  }
  const maxRepayAssets =
    signatureFunding && repayShares > 0n && requirementSignature != null
      ? parseUint256("maxRepayAssets", selectedMaxRepayAssets)
      : selectedMaxRepayAssets;

  return maxRepayAssets;
};

/** Binds independently supplied token and authorization signatures. @internal */
export const bindBlueRepaySignatures = (
  parsed: BlueRepayInput,
  params: {
    readonly maxRepayAssets: bigint;
    readonly signatures: Pick<
      BlueRepayWithdrawCollateralParams["args"],
      "requirementSignature" | "authorizationSignature"
    >;
  },
): {
  readonly maxRepayAssets: bigint;
  readonly loanTokenPermit: ReturnType<typeof getBlueBundlesV1TokenPermit>;
  readonly signedAuthorization: ReturnType<
    typeof getBlueBundlesV1SignedAuthorization
  >;
} => {
  const { chainId, userAddress, marketParams, value } = parsed;
  const {
    maxRepayAssets,
    signatures: { requirementSignature, authorizationSignature },
  } = params;
  if (value > 0n && requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      requirementSignature.action.type,
    );
  }
  const loanTokenPermit = getBlueBundlesV1TokenPermit({
    chainId,
    userAddress,
    token: marketParams.loanToken,
    amount: maxRepayAssets,
    requirementSignature,
  });
  const signedAuthorization = getBlueBundlesV1SignedAuthorization({
    chainId,
    userAddress,
    authorizationSignature,
  });

  return { maxRepayAssets, loanTokenPermit, signedAuthorization };
};
