import { encodeFunctionData } from "viem";
import { blueBundlesV1Abi } from "../../abis.js";
import type {
  BlueRefinanceAction,
  BlueRepayWithdrawCollateralAction,
  BlueSupplyCollateralBorrowAction,
  BlueWithdrawAction,
  Transaction,
} from "../../types/index.js";
import { getBundlesReferralFeeAssets } from "../bundles/common.js";
import {
  finalizeBlueBundlesV1Transaction,
  type getBlueBundlesV1SignedAuthorization,
} from "./common.js";
import type { BlueRefinanceInput } from "./refinance.internal.js";
import type { BlueRepayInput } from "./repayWithdrawCollateral.internal.js";
import type {
  bindBlueRepaySignatures,
  bindBlueSupplyCollateralBorrowSignatures,
} from "./signatures.js";
import type { BlueSupplyCollateralBorrowInput } from "./supplyCollateralBorrow.internal.js";
import type { BlueWithdrawInput } from "./withdraw.internal.js";

/** Encodes bound withdrawal signatures without validating inputs again. @internal */
export const encodeBlueWithdraw = (
  parsed: BlueWithdrawInput & {
    readonly signedAuthorization: ReturnType<
      typeof getBlueBundlesV1SignedAuthorization
    >;
  },
): Readonly<Transaction<BlueWithdrawAction>> => {
  const {
    deadline,
    marketParams,
    userAddress,
    withdrawAssets,
    withdrawShares,
    referralFeePct,
    referralFeeRecipient,
    publicAllocations,
    reallocationPenaltyAssets,
    signedAuthorization,
  } = parsed;
  return finalizeBlueBundlesV1Transaction({
    common: parsed,
    value: 0n,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1Withdraw",
      args: [
        marketParams,
        withdrawAssets,
        withdrawShares,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    }),
    action: {
      type: "blueWithdraw",
      args: {
        market: marketParams.id,
        withdrawAssets,
        withdrawShares,
        onBehalf: userAddress,
        reallocations: publicAllocations.length,
        reallocationPenaltyAssets,
        referralFeePct,
        referralFeeRecipient,
        referralFeeAssets:
          withdrawAssets > 0n
            ? getBundlesReferralFeeAssets(
                withdrawAssets - reallocationPenaltyAssets,
                referralFeePct,
              )
            : undefined,
        deadline,
      },
    },
  });
};

/** Encodes bound refinance signatures without repeating validation. @internal */
export const encodeBlueRefinance = (
  parsed: BlueRefinanceInput & {
    readonly signedAuthorization: ReturnType<
      typeof getBlueBundlesV1SignedAuthorization
    >;
  },
): Readonly<Transaction<BlueRefinanceAction>> => {
  const {
    deadline,
    sourceMarketParams,
    destinationMarketParams,
    userAddress,
    maxLtv,
    referralFeePct,
    referralFeeRecipient,
    publicAllocations,
    reallocationPenaltyAssets,
    signedAuthorization,
  } = parsed;
  return finalizeBlueBundlesV1Transaction({
    common: parsed,
    value: 0n,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1MigrateBorrowPosition",
      args: [
        sourceMarketParams,
        destinationMarketParams,
        maxLtv,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    }),
    action: {
      type: "blueRefinance",
      args: {
        sourceMarket: sourceMarketParams.id,
        destinationMarket: destinationMarketParams.id,
        maxLtv,
        onBehalf: userAddress,
        reallocations: publicAllocations.length,
        reallocationPenaltyAssets,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    },
  });
};

/** Encodes fully parsed inputs and bound signatures. @internal */
export const encodeBlueSupplyCollateralBorrow = (
  parsed: BlueSupplyCollateralBorrowInput & {
    readonly bound: ReturnType<typeof bindBlueSupplyCollateralBorrowSignatures>;
  },
): Readonly<Transaction<BlueSupplyCollateralBorrowAction>> => {
  const {
    deadline,
    marketParams,
    userAddress,
    collateralAssets,
    borrowAssets,
    maxLtv,
    referralFeePct,
    referralFeeRecipient,
    value,
    publicAllocations,
    reallocationPenaltyAssets,
  } = parsed;

  const { collateralPermit, signedAuthorization } = parsed.bound;
  return finalizeBlueBundlesV1Transaction({
    common: parsed,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        marketParams,
        collateralAssets,
        borrowAssets,
        maxLtv,
        collateralPermit,
        signedAuthorization,
        publicAllocations,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    }),
    action: {
      type: "blueSupplyCollateralBorrow",
      args: {
        market: marketParams.id,
        collateralAssets,
        borrowAssets,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        reallocations: publicAllocations.length,
        reallocationPenaltyAssets,
        referralFeePct,
        referralFeeRecipient,
        referralFeeAssets: getBundlesReferralFeeAssets(
          borrowAssets - reallocationPenaltyAssets,
          referralFeePct,
        ),
        deadline,
      },
    },
  });
};

/** Encodes parsed inputs and bound signatures without another validation pass. @internal */
export const encodeBlueRepayWithdrawCollateral = (
  parsed: BlueRepayInput & {
    readonly bound: ReturnType<typeof bindBlueRepaySignatures>;
  },
): Readonly<Transaction<BlueRepayWithdrawCollateralAction>> => {
  const {
    deadline,
    marketParams,
    userAddress,
    repayAssets,
    repayShares,
    collateralAssets,
    maxLtv,
    referralFeePct,
    referralFeeRecipient,
    minimumRepayAssets,
    value,
  } = parsed;

  const { maxRepayAssets, loanTokenPermit, signedAuthorization } = parsed.bound;
  return finalizeBlueBundlesV1Transaction({
    common: parsed,
    value,
    data: encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1RepayAndWithdrawCollateral",
      args: [
        marketParams,
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        maxLtv,
        loanTokenPermit,
        signedAuthorization,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    }),
    action: {
      type: "blueRepayWithdrawCollateral",
      args: {
        market: marketParams.id,
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: value > 0n ? value : undefined,
        referralFeePct,
        referralFeeRecipient,
        referralFeeAssets:
          repayAssets > 0n ? minimumRepayAssets - repayAssets : undefined,
        deadline,
      },
    },
  });
};
