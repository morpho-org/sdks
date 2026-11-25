import {
  parseBlueMarket,
  parseNativeFunding,
  parseUint256,
} from "../../helpers/parse.js";
import {
  type BlueRepayWithdrawCollateralAction,
  InputExceedsMaxError,
  MaxRepayAssetsBelowRepayAssetsError,
  MutuallyExclusiveRepayAmountsError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type { BlueOperationInput } from "./common.js";
import {
  getBlueBundlesV1ReferralFeeAssets,
  parseBlueBundlesV1Common,
} from "./common.js";
import { encodeBlueRepayWithdrawCollateral } from "./encode.js";
import type { BlueRepayWithdrawCollateralParams } from "./repayWithdrawCollateral.js";
import {
  bindBlueRepaySignatures,
  parseBlueRepaySignatureFunding,
  validateBlueRepaySignatureLegs,
} from "./signatures.js";

declare const blueRepayBrand: unique symbol;
/** Complete repay params, including covered funding and exclusive legs. @internal */
export interface BlueRepayInput extends BlueOperationInput {
  readonly repayAssets: bigint;
  readonly repayShares: bigint;
  readonly collateralAssets: bigint;
  readonly maxLtv: bigint;
  readonly hasRepay: boolean;
  readonly minimumRepayAssets: bigint;
  readonly maxRepayAssets: bigint;
  readonly value: bigint;
  readonly [blueRepayBrand]: true;
}

/** Constructs the complete raw repay operation, preserving signature and funding precedence. @internal */
export const parseBlueRepayWithdrawCollateral = (
  params: BlueRepayWithdrawCollateralParams,
) => {
  const marketParams = parseBlueMarket(params.market.marketParams);
  const amounts = {
    repayAssets: parseUint256("repayAssets", params.args.repayAssets),
    repayShares: parseUint256("repayShares", params.args.repayShares),
    maxRepayAssets: parseUint256("maxRepayAssets", params.args.maxRepayAssets),
    collateralAssets: parseUint256(
      "collateralAssets",
      params.args.collateralAssets,
    ),
    maxLtv: parseUint256("maxLtv", params.args.maxLtv),
  };
  const mode = parseBlueRepayMode(marketParams, amounts);
  const cap = parseBlueRepayCap(mode, amounts.maxRepayAssets);
  // Reject signatures for inactive legs before continuing.
  validateBlueRepaySignatureLegs(mode, params.args);
  const common = {
    chainId: params.market.chainId,
    userAddress: params.args.userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const normalized = parseBlueBundlesV1Common(common);
  const legs = {
    ...normalized,
    chainId: common.chainId,
    userAddress: common.userAddress,
    marketParams,
    metadata: common.metadata,
    ...amounts,
    hasRepay: mode.hasRepay,
    minimumRepayAssets:
      amounts.repayAssets +
      getBlueBundlesV1ReferralFeeAssets(
        amounts.repayAssets,
        normalized.referralFeePct,
      ),
  };
  const maxRepayAssets = parseBlueRepayCoverage(legs, cap);
  const value = parseNativeFunding({
    chainId: common.chainId,
    token: marketParams.loanToken,
    fundedAmount: maxRepayAssets,
    nativeAmount: params.args.nativeAmount,
  });
  const fields: Omit<BlueRepayInput, symbol> = {
    ...legs,
    maxRepayAssets,
    value,
  };
  const input = fields as BlueRepayInput;
  return {
    ...input,
    bound: bindBlueRepaySignatures(input, {
      maxRepayAssets,
      signatures: params.args,
    }),
  };
};

/** Parses mutually exclusive repay modes and the nonempty leg rule. @internal */
export const parseBlueRepayMode = (
  marketParams: ReturnType<typeof parseBlueMarket>,
  amounts: {
    readonly repayAssets: bigint;
    readonly repayShares: bigint;
    readonly collateralAssets: bigint;
  },
) => {
  const { repayAssets, repayShares, collateralAssets } = amounts;
  if (repayAssets > 0n && repayShares > 0n) {
    throw new MutuallyExclusiveRepayAmountsError(marketParams.id);
  }
  const hasRepay = repayAssets > 0n || repayShares > 0n;
  if (!hasRepay && collateralAssets === 0n) {
    throw new NonPositiveInputError(
      "repayAssets, repayShares, or collateralAssets",
      0n,
    );
  }
  const result = { hasRepay, collateralAssets };
  return result;
};

/** Parses active/inactive funding-cap rules. @internal */
export const parseBlueRepayCap = (
  mode: Pick<ReturnType<typeof parseBlueRepayMode>, "hasRepay">,
  maxRepayAssets: ReturnType<typeof parseUint256>,
) => {
  if (mode.hasRepay && maxRepayAssets === 0n) {
    throw new NonPositiveInputError("maxRepayAssets", maxRepayAssets);
  }
  if (!mode.hasRepay && maxRepayAssets > 0n) {
    throw new InputExceedsMaxError({
      field: "maxRepayAssets",
      value: maxRepayAssets,
      max: 0n,
    });
  }
  return maxRepayAssets;
};

/** Parses cap coverage, after common referral normalization. @internal */
export const parseBlueRepayCoverage = (
  legs: { readonly minimumRepayAssets: bigint },
  maxRepayAssets: ReturnType<typeof parseBlueRepayCap>,
) => {
  if (legs.minimumRepayAssets > maxRepayAssets) {
    throw new MaxRepayAssetsBelowRepayAssetsError(
      maxRepayAssets,
      legs.minimumRepayAssets,
    );
  }
  return maxRepayAssets;
};

/** Independently validates fresh buildTx signatures before encoding. @internal */
export const buildBlueRepayWithdrawCollateral = (
  parsed: BlueRepayInput,
  signatures: Pick<
    BlueRepayWithdrawCollateralParams["args"],
    "requirementSignature" | "authorizationSignature"
  > & { readonly signatureFunding?: boolean } = {},
): Readonly<Transaction<BlueRepayWithdrawCollateralAction>> => {
  const maxRepayAssets = parseBlueRepaySignatureFunding(parsed, signatures);
  // Reject signatures for inactive legs before continuing.
  validateBlueRepaySignatureLegs(parsed, signatures);
  return encodeBlueRepayWithdrawCollateral({
    ...parsed,
    bound: bindBlueRepaySignatures(parsed, { maxRepayAssets, signatures }),
  });
};
