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
import type {
  MidnightReferralFeeParams,
  MidnightTakeableOffer,
} from "./types.js";

interface MidnightTakeBaseParams extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly reduceOnly: boolean;
  readonly offerFills: readonly MidnightTakeableOffer[];
  readonly deadline: bigint;
}

type MidnightTakeParams = MidnightTakeBaseParams &
  (
    | {
        readonly side: "buy";
        readonly target: MidnightBuyTarget;
        readonly repayEnabled: boolean;
        readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
        readonly collateralReceiver: Address;
        readonly maxContinuousFee: bigint;
      }
    | {
        readonly side: "sell";
        readonly target: MidnightSellTarget;
        readonly receiver: Address;
        readonly collateralSupplies: readonly MidnightCollateralTransfer[];
      }
  );

const validatePositive = (field: string, value: bigint) => {
  if (value <= 0n) throw new NonPositiveInputError(field, value);
};

const validateNonNegative = (field: string, value: bigint) => {
  if (value < 0n) throw new NegativeInputError(field, value);
};

/**
 * Encodes a Midnight take: a buy (lend side, `side: "buy"`) or a sell (borrow side, `side: "sell"`).
 * `target.type` selects the assets- or units-target `MidnightBundlesV2` entrypoint.
 *
 * @internal
 */
export const midnightTake = (
  params: MidnightTakeParams,
): { readonly to: Address; readonly value: bigint; readonly data: Hex } => {
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  const market = MarketUtils.toStruct(params.market);
  const to = getChainAddress(params.chainId, "midnightBundlesV2");

  if (params.side === "buy") {
    const { target } = params;
    if (target.type === "assets") {
      validateNonNegative("target.assets", target.assets);
      validateNonNegative("target.minUnits", target.minUnits);
    } else {
      validatePositive("target.units", target.units);
      validateNonNegative("target.maxBuyerAssets", target.maxBuyerAssets);
    }
    validateNonNegative("maxContinuousFee", params.maxContinuousFee);
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
      to,
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
  }

  const { target } = params;
  if (target.type === "assets") {
    validatePositive("target.assets", target.assets);
    validatePositive("target.maxUnits", target.maxUnits);
  } else {
    validatePositive("target.units", target.units);
    validateNonNegative("target.minSellerAssets", target.minSellerAssets);
  }
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
    to,
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
