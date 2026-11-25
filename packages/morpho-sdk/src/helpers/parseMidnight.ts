import {
  type AccrualPosition,
  type Market,
  type MarketInput,
  MarketUtils,
} from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isAddressEqual, zeroAddress } from "viem";
import {
  AccrualPositionUserMismatchError,
  InvalidBigIntInputError,
  MarketIdMismatchError,
  MidnightZeroOnBehalfError,
} from "../types/index.js";
import { wrapMidnightEncoding } from "./encodeMidnightCalldata.js";
import { validateMidnightNativeAmount } from "./validate.js";
import {
  validateMidnightAccount,
  validateMidnightAddress,
} from "./validateMidnightAccount.js";
import { validateMidnightUint128Field } from "./validateMidnightBounds.js";
import { validateMidnightMarket } from "./validateMidnightMarket.js";
import { validatePositiveInput } from "./validatePositiveInput.js";

declare const midnightMarket: unique symbol;

/** An owned market tuple bound to a deployment, awaiting its ABI bound. @internal */
export interface MidnightMarketDeployment {
  readonly struct: ReturnType<typeof MarketUtils.toStruct>;
}

/** An owned, ABI-encodable Midnight market and identifier. @internal */
export interface MidnightMarket extends MidnightMarketDeployment {
  readonly id: Hex;
  readonly [midnightMarket]: true;
}

/** Checks the existing uint128 bound; the operation owns the field context. @internal */
export const parseMidnightUint128 = (field: string, value: bigint): bigint => {
  // Enforce the storage bound before the operation uses the amount.
  validateMidnightUint128Field(field, value);
  return value;
};

/** Owns and validates the ABI tuple instead of retaining caller-owned classes. @internal */
export const parseMidnightMarket = (
  market: MarketInput,
  chainId: number,
): MidnightMarket =>
  parseMidnightMarketInput(parseMidnightMarketDeployment(market, chainId));

/** Owns a market and checks deployment before operation-specific validation. @internal */
export const parseMidnightMarketDeployment = (
  market: MarketInput,
  chainId: number,
): MidnightMarketDeployment => {
  // Preserve deployment errors before normalizing malformed raw market fields.
  validateMidnightMarket({ market, chainId });
  const struct = deepFreeze(MarketUtils.toStruct(market));
  return Object.freeze({ struct });
};

/** Completes the market ABI bound after mandatory operation checks. @internal */
export const parseMidnightMarketInput = (
  market: MidnightMarketDeployment,
  input = "marketId",
): MidnightMarket =>
  Object.freeze({
    ...market,
    id: wrapMidnightEncoding(input, () => MarketUtils.toId(market.struct)),
  }) as MidnightMarket;

/** Checks address shape using Midnight's existing typed error. @internal */
export const parseMidnightAddress = (
  field: string,
  value: Address,
): Address => {
  // Reject malformed addresses before comparisons or encoding.
  validateMidnightAddress(field, value);
  return value;
};

/** Checks a shaped direct-call owner with the existing zero-owner error. @internal */
export const parseMidnightOwner = (value: Address): Address => {
  if (isAddressEqual(value, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  return value;
};

/** Checks an entity account using its established zero-account error. @internal */
export const parseMidnightAccount = (
  field: "accountAddress" | "owner",
  value: Address,
): Address => {
  // Reject invalid accounts before preparing entity state.
  validateMidnightAccount(field, value);
  return value;
};

/** Checks a positive direct-call amount using the operation's error label. @internal */
export const parseMidnightPositiveAmount = (
  field: string,
  value: bigint,
): bigint => {
  // Validation only; retain the canonical positivity guard before the uint128 bound.
  validatePositiveInput(field, value);
  return parseMidnightUint128(field, value);
};

/** Checks the collateral amount for standalone native supply. @internal */
export const parseMidnightNativeCollateralAmount = (
  field: "assets" | "collateralAssets",
  value: bigint,
): bigint => {
  if (typeof value !== "bigint") {
    throw new InvalidBigIntInputError(field, value);
  }
  return parseMidnightPositiveAmount(field, value);
};

/** Resolves a configured collateral before balance or approval calculations. @internal */
export const parseMidnightCollateral = (
  market: MidnightMarketDeployment,
  index: bigint,
) => {
  const collateral = MarketUtils.getCollateralByIndex(market.struct, index);
  return Object.freeze({ index, token: collateral.token });
};

/** Checks snapshot ownership without treating it as permanent onchain proof. @internal */
export const validateMidnightPositionBinding = (params: {
  readonly positionData: AccrualPosition;
  readonly accountAddress: Address;
  readonly marketData: Market;
}): void => {
  if (params.positionData.marketId !== params.marketData.id) {
    throw new MarketIdMismatchError(
      params.positionData.marketId,
      params.marketData.id,
    );
  }
  // Reject a malformed address before viem compares it.
  validateMidnightAddress("positionData.user", params.positionData.user);
  if (!isAddressEqual(params.positionData.user, params.accountAddress)) {
    throw new AccrualPositionUserMismatchError(
      params.positionData.user,
      params.accountAddress,
    );
  }
};

/** Checks partial native funding, retaining full-pull approval semantics. @internal */
export const parseMidnightNativeFunding = (
  params: Parameters<typeof validateMidnightNativeAmount>[0],
) => Object.freeze(validateMidnightNativeAmount(params));
