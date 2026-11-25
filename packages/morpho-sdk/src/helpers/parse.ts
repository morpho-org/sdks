import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, maxUint256 } from "viem";
import {
  InputExceedsMaxError,
  NativeFundingAmountMismatchError,
  NegativeInputError,
} from "../types/index.js";
import {
  validateDeadline,
  validateMarketParamsId,
  validateNativeAsset,
  validateReferralFee,
  validateUint256Field,
} from "./validate.js";

declare const blueMarket: unique symbol;

/** An owned, immutable market tuple with its validated identifier. @internal */
export interface BlueMarket
  extends Readonly<
    Pick<
      MarketParams,
      "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv" | "id"
    >
  > {
  readonly [blueMarket]: true;
}
/** Validates and owns a frozen plain snapshot of the market tuple and identifier. @internal */
export const parseBlueMarket = (value: MarketParams): BlueMarket => {
  const { loanToken, collateralToken, oracle, irm, lltv, id } = value;
  const snapshot = Object.freeze({
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv,
    id,
  });
  // Check the owned tuple, not getters on the caller's instance.
  validateMarketParamsId(snapshot);
  return snapshot as BlueMarket;
};

/** Parses an unsigned ABI amount without changing validator error semantics. @internal */
export const parseUint256 = (field: string, value: bigint): bigint => {
  // Enforce the ABI bound before granting the amount contract.
  validateUint256Field(field, value);
  return value;
};

/** Parses a positive ABI deadline; expiry belongs to the entity. @internal */
export const parseDeadline = (value: bigint): bigint => {
  // Enforce deadline shape without consulting the clock.
  validateDeadline(value);
  return value;
};

/** Parses the referral pair using the existing fixed-bundle normalizer. @internal */
export const parseReferralFee = (params: {
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
}) => validateReferralFee(params);

/** Parses exclusive native funding; signature exclusivity is checked at encoding. @internal */
export const parseNativeFunding = (params: {
  readonly chainId: number;
  readonly token: Address;
  readonly fundedAmount: bigint;
  readonly nativeAmount?: bigint;
}): bigint => {
  const amount = params.nativeAmount ?? 0n;
  if (amount < 0n) {
    throw new NegativeInputError("nativeAmount", amount);
  }
  if (amount > 0n) {
    // Reject native funding for a token other than the chain's wrapped native asset.
    validateNativeAsset(params.chainId, params.token);
    if (amount !== params.fundedAmount) {
      throw new NativeFundingAmountMismatchError(amount, params.fundedAmount);
    }
  }
  return amount;
};

/** Parses the lower amount bound independently of ABI encoding limits. @internal */
export const parseNonnegative = (field: string, value: bigint): bigint => {
  if (value < 0n) {
    throw new NegativeInputError(field, value);
  }
  return value;
};

/** Completes a nonnegative amount with its ABI upper bound. @internal */
export const parseUint256Max = (field: string, value: bigint): bigint => {
  if (value > maxUint256) {
    throw new InputExceedsMaxError({ field, value, max: maxUint256 });
  }
  return value;
};
