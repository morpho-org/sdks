import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex, zeroAddress } from "viem";
import {
  validateDeadline,
  validateReferralFee,
} from "../../helpers/validate.js";
import {
  type MidnightBuyTarget,
  type MidnightCollateralTransfer,
  type MidnightSellTarget,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Optional referral fee shared by the Midnight taker builders. */
export interface MidnightReferralFeeParams {
  /** WAD-scaled share of the filled loan assets paid to `referralFeeRecipient`. Defaults to `0n`. */
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
}

interface BundlesV2TakeParams extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly reduceOnly: boolean;
  readonly offerFills: readonly MidnightTakeableOffer[];
  readonly deadline: bigint;
}

const validatePositive = (field: string, value: bigint) => {
  if (value <= 0n) throw new NonPositiveInputError(field, value);
};

const validateNonNegative = (field: string, value: bigint) => {
  if (value < 0n) throw new NegativeInputError(field, value);
};

/**
 * Encodes a `MidnightBundlesV2` buy entrypoint, selected by `target.type`.
 *
 * @internal
 */
export const midnightBundlesV2Buy = (
  params: BundlesV2TakeParams & {
    readonly target: MidnightBuyTarget;
    readonly repayEnabled: boolean;
    readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
    readonly collateralReceiver: Address;
    readonly maxContinuousFee: bigint;
  },
): { readonly to: Address; readonly value: bigint; readonly data: Hex } => {
  const { target } = params;
  if (target.type === "assets") {
    validateNonNegative("target.assets", target.assets);
    validateNonNegative("target.minUnits", target.minUnits);
  } else {
    validatePositive("target.units", target.units);
    validateNonNegative("target.maxBuyerAssets", target.maxBuyerAssets);
  }
  validateNonNegative("maxContinuousFee", params.maxContinuousFee);
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  const market = MarketUtils.toStruct(params.market);
  const collateralWithdrawals = params.collateralWithdrawals.map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );
  const args = [
    params.reduceOnly, // reduceOnly
    params.repayEnabled, // repayEnabled
    params.offerFills, // offerFills
    collateralWithdrawals, // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.maxContinuousFee, // maxContinuousFee
    params.deadline, // deadline
    zeroAddress, // wrappedNative
  ] as const;

  return {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data:
      target.type === "assets"
        ? encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, target.assets, target.minUnits, ...args],
          })
        : encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target.units, target.maxBuyerAssets, ...args],
          }),
  };
};

/**
 * Encodes a `MidnightBundlesV2` sell entrypoint, selected by `target.type`.
 *
 * @internal
 */
export const midnightBundlesV2Sell = (
  params: BundlesV2TakeParams & {
    readonly target: MidnightSellTarget;
    readonly receiver: Address;
    readonly collateralSupplies: readonly MidnightCollateralTransfer[];
  },
): { readonly to: Address; readonly value: bigint; readonly data: Hex } => {
  const { target } = params;
  if (target.type === "assets") {
    validatePositive("target.assets", target.assets);
    validatePositive("target.maxUnits", target.maxUnits);
  } else {
    validatePositive("target.units", target.units);
    validateNonNegative("target.minSellerAssets", target.minSellerAssets);
  }
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  const market = MarketUtils.toStruct(params.market);
  const collateralSupplies = params.collateralSupplies.map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );
  const args = [
    params.reduceOnly, // reduceOnly
    params.receiver, // receiver
    collateralSupplies, // collateralSupplies
    params.offerFills, // offerFills
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.deadline, // deadline
    zeroAddress, // wrappedNative
  ] as const;

  return {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data:
      target.type === "assets"
        ? encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
            args: [market, target.units, target.minSellerAssets, ...args],
          }),
  };
};
