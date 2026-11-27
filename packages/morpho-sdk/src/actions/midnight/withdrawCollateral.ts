import type {
  AccrualPosition,
  Market,
  MarketInput,
} from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import {
  type MidnightMarket,
  parseMidnightAccount,
  parseMidnightAddress,
  parseMidnightCollateral,
  parseMidnightMarket,
  parseMidnightOwner,
  parseMidnightPositiveAmount,
  validateMidnightPositionBinding,
} from "../../helpers/parseMidnight.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import type {
  Metadata,
  MidnightWithdrawCollateralAction,
  Transaction,
} from "../../types/index.js";
import { encodeMidnightWithdrawCollateral } from "./encode.js";
import { snapshotMidnightMetadata } from "./parse.js";

/** Parameters for encoding a direct Midnight collateral withdrawal. */
export interface MidnightWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralIndex?: bigint;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly receiver: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct Midnight collateral withdrawal.
 *
 * This builder reads no position state. Prefer the entity method for balance and health checks.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.market - Midnight market from which collateral is withdrawn.
 * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
 * @param params.assets - Collateral assets to withdraw.
 * @param params.onBehalf - Collateral owner; the sender must be this account or its authorized operator.
 * @param params.receiver - Account receiving withdrawn collateral.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightWithdrawCollateralAction>` targeting `Midnight`.
 * @throws {MidnightZeroReceiverError} when receiver is zero.
 * @throws {MidnightContractReceiverError} when receiver cannot safely receive collateral.
 * @throws {NonPositiveInputError} when `assets <= 0n`.
 * @throws {InputExceedsMaxError} when `assets` exceeds `uint128`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @example
 * ```ts
 * import { midnightWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralIndex: 0n,
 *   assets: 2_000_000n,
 *   onBehalf: user,
 *   receiver: user,
 * });
 * ```
 */
export const midnightWithdrawCollateral = (
  params: MidnightWithdrawCollateralParams,
): Readonly<Transaction<MidnightWithdrawCollateralAction>> =>
  encodeMidnightWithdrawCollateral(parseMidnightWithdrawCollateral(params));

const parsedWithdrawCollateral = Symbol();

/** Owned inputs for the withdrawCollateral encoder. @internal */
export interface ParsedMidnightWithdrawCollateral
  extends Omit<MidnightWithdrawCollateralParams, "market"> {
  readonly market: MidnightMarket;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly collateralIndex: bigint;
  readonly [parsedWithdrawCollateral]: true;
}

/** Parses static withdrawCollateral constraints using the existing error order. @internal */
export const parseMidnightWithdrawCollateral = (
  params: MidnightWithdrawCollateralParams,
): ParsedMidnightWithdrawCollateral => {
  const address = parseMidnightAddress("onBehalf", params.onBehalf);
  const assets = parseMidnightPositiveAmount("assets", params.assets);
  const onBehalf = parseMidnightOwner(address);

  // Reject markets from another chain deployment before encoding the call.
  const market = parseMidnightMarket(params.market, params.chainId);
  const collateral = parseMidnightCollateral(
    market,
    params.collateralIndex ?? 0n,
  );
  const collateralIndex = collateral.index;

  validateMidnightReceiver({
    chainId: params.chainId,
    market: market.struct,
    field: "receiver",
    receiver: params.receiver,
  });

  return deepFreeze({
    chainId: params.chainId,
    market,
    onBehalf,
    assets,
    collateralIndex,
    receiver: params.receiver,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedWithdrawCollateral]: true as const,
  });
};

/** Complete raw withdrawal preparation; domain snapshots stay caller-owned. @internal */
export interface MidnightWithdrawCollateralPreparationParams
  extends Omit<
    MidnightWithdrawCollateralParams,
    "market" | "onBehalf" | "receiver"
  > {
  readonly accountAddress: Address;
  readonly marketData: Market;
  readonly positionData: AccrualPosition;
  /** Defaults to `accountAddress`. */
  readonly receiver?: Address;
}

/**
 * Owns the snapshot-bound withdrawal checks in entity order: account, market, position binding,
 * collateral index, `maxUint256` resolution to the snapshot balance, then the direct-call checks.
 * Balance and health checks against the snapshot are left to the caller. @internal
 */
export const parseMidnightWithdrawCollateralPreparation = (
  params: MidnightWithdrawCollateralPreparationParams,
): ParsedMidnightWithdrawCollateral => {
  const onBehalf = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  const market = parseMidnightMarket(params.marketData, params.chainId);
  // Bind the supplied snapshot before interpreting its collateral balances.
  validateMidnightPositionBinding(params);
  const collateral = parseMidnightCollateral(
    market,
    params.collateralIndex ?? 0n,
  );
  const available =
    params.positionData.collateral[Number(collateral.index)] ?? 0n;
  const action = parseMidnightWithdrawCollateral({
    chainId: params.chainId,
    market: market.struct,
    assets: params.assets === maxUint256 ? available : params.assets,
    onBehalf,
    receiver: params.receiver ?? onBehalf,
    collateralIndex: collateral.index,
    metadata: params.metadata,
  });
  return action;
};
