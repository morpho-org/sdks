import { MathLib } from "@morpho-org/blue-sdk";
import type { AccrualPosition, MarketInput } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  type MidnightMarket,
  parseMidnightAddress,
  parseMidnightMarket,
  parseMidnightOwner,
  parseMidnightPositiveAmount,
} from "../../helpers/parseMidnight.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  AccrualPositionUserMismatchError,
  InsufficientMidnightWithdrawableLiquidityError,
  type Metadata,
  type MidnightRedeemAction,
  MidnightRedeemExceedsCreditError,
  MissingAccrualPositionError,
  NoMidnightCreditToRedeemError,
  type Transaction,
} from "../../types/index.js";
import { encodeMidnightRedeem } from "./encode.js";
import { snapshotMidnightMetadata } from "./parse.js";

/** Parameters for encoding a direct Midnight credit redemption. */
export interface MidnightRedeemParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly units: bigint;
  readonly onBehalf: Address;
  readonly receiver?: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct Midnight credit redemption.
 *
 * Use this low-level builder after the caller has fetched and checked position
 * credit and market withdrawable liquidity. App flows should usually call
 * `client.morpho.midnight(chainId).redeem(...)`, which performs those checks
 * from the supplied `positionData` snapshot, after applying realized losses and accrued continuous
 * fees, before exposing `buildTx`. This builder bounds `units` by neither credit nor liquidity; a
 * redemption above the credit Midnight computes onchain reverts.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.market - Midnight market whose credit is redeemed.
 * @param params.units - Credit units to withdraw.
 * @param params.onBehalf - Account whose credit balance is reduced. `onBehalf`, or an operator
 *   it authorized, must send the transaction; otherwise Midnight reverts `Unauthorized()`.
 * @param params.receiver - Optional receiver for withdrawn loan assets; defaults to `onBehalf`.
 *   Midnight protocol and market token contracts are rejected.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRedeemAction>` targeting `Midnight`.
 * @throws {NonPositiveInputError} when `units <= 0n`.
 * @throws {InputExceedsMaxError} when `units` exceeds `uint128`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @throws {MidnightZeroReceiverError} when `receiver` resolves to the zero address.
 * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
 *   market token contract.
 * @example
 * ```ts
 * import { midnightRedeem } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightRedeem({
 *   chainId: 8453,
 *   market: marketData.params,
 *   units: positionData.faceValue,
 *   onBehalf: user,
 * });
 * ```
 */
export const midnightRedeem = (
  params: MidnightRedeemParams,
): Readonly<Transaction<MidnightRedeemAction>> =>
  encodeMidnightRedeem(parseMidnightRedeem(params));

const parsedRedeem = Symbol();

/** Owned inputs for the redeem encoder. @internal */
export interface ParsedMidnightRedeem
  extends Omit<MidnightRedeemParams, "market"> {
  readonly market: MidnightMarket;
  readonly units: bigint;
  readonly onBehalf: Address;
  readonly receiver: Address;
  readonly [parsedRedeem]: true;
}

/** Parses static redeem constraints using the existing error order. @internal */
export const parseMidnightRedeem = (
  params: MidnightRedeemParams,
): ParsedMidnightRedeem => {
  const address = parseMidnightAddress("onBehalf", params.onBehalf);
  const units = parseMidnightPositiveAmount("units", params.units);
  const onBehalf = parseMidnightOwner(address);

  // Reject markets from another chain deployment before encoding the call.
  const market = parseMidnightMarket(params.market, params.chainId);

  const receiver = params.receiver ?? params.onBehalf;
  // Rejects receivers that would strand the redeemed assets in a contract.
  validateMidnightReceiver({
    chainId: params.chainId,
    market: market.struct,
    field: "receiver",
    receiver,
  });

  return deepFreeze({
    chainId: params.chainId,
    market,
    onBehalf,
    units,
    receiver,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedRedeem]: true as const,
  });
};

/** Owner-bound position snapshot and optional amounts for a redemption. @internal */
export interface MidnightRedeemPreparationParams {
  readonly chainId: number;
  readonly accountAddress: Address;
  readonly positionData: AccrualPosition;
  readonly units?: bigint;
  readonly receiver?: Address;
  readonly now: bigint;
  readonly metadata?: Metadata;
}

/**
 * Owns redemption defaults and snapshot-dependent amount constraints in the same order as the
 * entity `redeem`, then mints the complete redeem contract. Used by TransactionPlan preparation;
 * the entity keeps its own copy of these checks.
 * @internal
 */
export const parseMidnightRedeemPreparation = (
  params: MidnightRedeemPreparationParams,
): ParsedMidnightRedeem => {
  const address = parseMidnightAddress("accountAddress", params.accountAddress);
  if (!params.positionData) {
    throw new MissingAccrualPositionError();
  }
  if (params.positionData.user != null) {
    validateMidnightAddress("positionData.user", params.positionData.user);
  }
  if (
    params.positionData.user == null ||
    !isAddressEqual(params.positionData.user, address)
  ) {
    throw new AccrualPositionUserMismatchError(
      params.positionData.user ?? "unbound",
      address,
    );
  }
  const marketData = params.positionData.market;
  // Reject market/deployment errors before snapshot accrual and amount checks.
  const market = parseMidnightMarket(marketData, params.chainId);
  const accrued = params.positionData.accrueInterest(
    MathLib.max(params.now, params.positionData.lastAccrual),
  );
  const units = params.units ?? accrued.faceValue;
  if (params.units === undefined && units <= 0n) {
    throw new NoMidnightCreditToRedeemError(marketData.id);
  }
  // Bound the resolved amount before checking credit and liquidity.
  parseMidnightPositiveAmount("units", units);
  if (accrued.credit < units) {
    throw new MidnightRedeemExceedsCreditError({
      market: marketData.id,
      units,
      credit: accrued.credit,
    });
  }
  if (marketData.withdrawable < units) {
    throw new InsufficientMidnightWithdrawableLiquidityError({
      market: marketData.id,
      units,
      withdrawable: marketData.withdrawable,
    });
  }
  // The owning action constructor mints the complete contract only after snapshot checks.
  return parseMidnightRedeem({
    chainId: params.chainId,
    market: market.struct,
    units,
    onBehalf: address,
    receiver: params.receiver ?? address,
    metadata: params.metadata,
  });
};
