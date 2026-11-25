import type { MarketInput } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import { parseNonnegative } from "../../helpers/parse.js";
import {
  type MidnightMarket,
  parseMidnightAddress,
  parseMidnightCollateral,
  parseMidnightMarket,
  parseMidnightMarketDeployment,
  parseMidnightMarketInput,
  parseMidnightOwner,
  parseMidnightPositiveAmount,
} from "../../helpers/parseMidnight.js";
import type {
  Metadata,
  MidnightSupplyCollateralAction,
  Transaction,
} from "../../types/index.js";
import { MidnightZeroOnBehalfError } from "../../types/index.js";
import { encodeMidnightSupplyCollateral } from "./encode.js";
import { snapshotMidnightMetadata } from "./parse.js";

/** Parameters for encoding a direct Midnight collateral supply. */
export interface MidnightSupplyCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralIndex?: bigint;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct Midnight collateral supply.
 *
 * Use this low-level builder when a flow already knows the market, collateral
 * index, and approval state. App flows should usually call
 * `client.morpho.midnight(chainId).supplyCollateral(...)`, which resolves the
 * ERC20 approval requirement before exposing `buildTx`.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.market - Midnight market receiving collateral.
 * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
 * @param params.assets - Collateral assets to supply.
 * @param params.onBehalf - Account whose collateral balance increases. `onBehalf`, or an
 *   operator it authorized, must send the transaction; otherwise Midnight reverts
 *   `Unauthorized()`. The collateral is pulled from the sender.
 * @param params.metadata.origin - Hex origin tag of up to four bytes, when metadata is supplied.
 * @param params.metadata.timestamp - Optional Unix timestamp in uint32 seconds; `false` or unset omits it.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralAction>` targeting `Midnight`.
 * @throws {MidnightCalldataEncodingError} when `onBehalf` or a market address is malformed, or an argument cannot be ABI-encoded.
 * @throws {NonPositiveInputError} when `assets <= 0n`.
 * @throws {InputExceedsMaxError} when `assets` exceeds `uint128`, or a later metadata check finds a timestamp above `uint32`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {UnsupportedChainIdError} when the chain has no address registry.
 * @throws {UnknownAddressError} when Midnight is not registered on the chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @throws {NegativeInputError} when the metadata timestamp is negative.
 * @example
 * ```ts
 * import { midnightSupplyCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralIndex: 0n,
 *   assets: 2_000_000n,
 *   onBehalf: user,
 * });
 * ```
 */
export const midnightSupplyCollateral = (
  params: MidnightSupplyCollateralParams,
): Readonly<Transaction<MidnightSupplyCollateralAction>> =>
  encodeMidnightSupplyCollateral(parseMidnightSupplyCollateral(params));

const parsedSupplyCollateral = Symbol();

/** Complete raw collateral-supply preparation input with entity field labels. @internal */
export interface MidnightSupplyCollateralPreparationParams
  extends Omit<MidnightSupplyCollateralParams, "assets" | "onBehalf"> {
  readonly accountAddress: Address;
  readonly collateralAssets: bigint;
  readonly reservedCollateralAssets?: bigint;
}

/**
 * Owns the entity supply contract in deployment/amount/reserve/index/owner/hash order.
 * Returns the zero-owner error for the entity to expose lazily; no incomplete action escapes.
 * @internal
 */
export const parseMidnightSupplyCollateralPreparation = (
  params: MidnightSupplyCollateralPreparationParams,
):
  | { readonly error: MidnightZeroOnBehalfError }
  | (ParsedMidnightSupplyCollateral & {
      readonly token: Address;
      readonly reservedCollateralAssets: bigint;
    }) => {
  const onBehalf = parseMidnightAddress(
    "accountAddress",
    params.accountAddress,
  );
  const deployment = parseMidnightMarketDeployment(
    params.market,
    params.chainId,
  );
  const assets = parseMidnightPositiveAmount(
    "collateralAssets",
    params.collateralAssets,
  );
  const reservedCollateralAssets = parseNonnegative(
    "reservedCollateralAssets",
    params.reservedCollateralAssets ?? 0n,
  );
  const collateral = parseMidnightCollateral(
    deployment,
    params.collateralIndex ?? 0n,
  );
  if (isAddressEqual(onBehalf, zeroAddress)) {
    return { error: new MidnightZeroOnBehalfError("onBehalf") };
  }
  // ABI hashing must follow the amount/index checks and lazy zero-owner branch.
  const market = parseMidnightMarketInput(deployment);
  return deepFreeze({
    chainId: params.chainId,
    market,
    assets,
    onBehalf,
    collateralIndex: collateral.index,
    token: collateral.token,
    reservedCollateralAssets,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedSupplyCollateral]: true as const,
  });
};

/** Owned inputs for the supplyCollateral encoder. @internal */
export interface ParsedMidnightSupplyCollateral
  extends Omit<MidnightSupplyCollateralParams, "market"> {
  readonly market: MidnightMarket;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly collateralIndex: bigint;
  readonly [parsedSupplyCollateral]: true;
}

/** Parses static supplyCollateral constraints using the existing error order. @internal */
export const parseMidnightSupplyCollateral = (
  params: MidnightSupplyCollateralParams,
): ParsedMidnightSupplyCollateral => {
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

  return deepFreeze({
    chainId: params.chainId,
    market,
    onBehalf,
    assets,
    collateralIndex,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedSupplyCollateral]: true as const,
  });
};
