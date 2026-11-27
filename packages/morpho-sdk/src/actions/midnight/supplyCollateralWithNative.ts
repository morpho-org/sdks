import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress, zeroHash } from "viem";
import {
  encodeMidnightCalldata,
  encodeMidnightMarketId,
  wrapMidnightEncoding,
} from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { parseMidnightNativeCollateralAmount } from "../../helpers/parseMidnight.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
} from "../../helpers/validate.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { emptyBlueMarket } from "../../helpers/validateMidnightCancelAndMakePublication.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightSupplyCollateralWithNativeAction,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for encoding a Midnight collateral supply. */
export interface MidnightSupplyCollateralWithNativeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralIndex?: bigint;
  readonly assets: bigint;
  readonly accountAddress: Address;
  /** Native funding in wei, capped at the supplied wNative collateral. */
  readonly nativeAmount: bigint;
  /** Bundle execution deadline. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a payable MidnightBundlesV2 collateral supply without a borrow or offer.
 * The bundle credits the sender, which must match `accountAddress`.
 * Validates the account and market before checking the native funding and deadline.
 *
 * @param params.chainId - Chain containing the Midnight and MidnightBundlesV2 deployments.
 * @param params.market - Midnight market receiving the collateral.
 * @param params.collateralIndex - Optional index of the registered wNative collateral; defaults to `0n`.
 * @param params.assets - Total collateral to supply, in wNative base units.
 * @param params.accountAddress - Transaction sender and collateral beneficiary.
 * @param params.nativeAmount - Positive amount to wrap in wei, at most `assets`.
 * @param params.deadline - Positive Unix timestamp in seconds for bundle execution.
 * @param params.metadata.origin - Hex origin tag of up to four bytes, when metadata is supplied.
 * @param params.metadata.timestamp - Optional Unix timestamp in uint32 seconds; `false` or unset omits it.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralWithNativeAction>` with
 *   `to` set to MidnightBundlesV2 and `value` set to `nativeAmount`.
 * @throws {MidnightCalldataEncodingError} when an address is malformed or a market or bundle argument cannot be ABI-encoded.
 * @throws {InvalidBigIntInputError} when `assets` is not a bigint.
 * @throws {NonPositiveInputError} when `assets` is not positive; also when subsequent funding or
 *   deadline validation finds zero `nativeAmount` or a non-positive `deadline`.
 * @throws {InputExceedsMaxError} when `assets` exceeds `uint128`; also on subsequent checks
 *   when `nativeAmount` exceeds `assets`, `deadline` exceeds `uint256`, or a metadata
 *   timestamp exceeds `uint32`.
 * @throws {MidnightZeroOnBehalfError} when `accountAddress` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {UnsupportedChainIdError} when the chain has no address registry.
 * @throws {UnknownAddressError} when Midnight is not registered, or later when resolving MidnightBundlesV2.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
 * @throws {NegativeInputError} when `nativeAmount` is negative, or a later metadata check finds a negative timestamp.
 * @throws {ChainWNativeMissingError} when the chain has no wrapped-native asset.
 * @throws {NativeAmountOnNonWNativeAssetError} when the selected collateral is not wNative.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import {
 *   midnightSupplyCollateralWithNative,
 *   type MidnightSupplyCollateralWithNativeParams,
 * } from "@morpho-org/morpho-sdk";
 *
 * export function wrapAndSupply(
 *   inputs: Pick<MidnightSupplyCollateralWithNativeParams,
 *     "chainId" | "market" | "collateralIndex" | "accountAddress">,
 * ) {
 *   const tx = midnightSupplyCollateralWithNative({
 *     ...inputs,
 *     assets: 1_000_000_000_000_000n,
 *     nativeAmount: 1_000_000_000_000_000n,
 *     deadline: maxUint256,
 *   });
 *   return tx; // Readonly<Transaction<MidnightSupplyCollateralWithNativeAction>>
 * }
 * ```
 */
export const midnightSupplyCollateralWithNative = (
  params: MidnightSupplyCollateralWithNativeParams,
): Readonly<Transaction<MidnightSupplyCollateralWithNativeAction>> =>
  prepareMidnightSupplyCollateralWithNative(params).tx;

/** Returns the transaction and the token pulled by its encoded collateral slot. @internal */
export function prepareMidnightSupplyCollateralWithNative(
  params: MidnightSupplyCollateralWithNativeParams,
) {
  validateMidnightAddress("accountAddress", params.accountAddress);
  const assets = parseMidnightNativeCollateralAmount("assets", params.assets);
  if (isAddressEqual(params.accountAddress, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("accountAddress");
  }

  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const market = wrapMidnightEncoding("marketId", () =>
    MarketUtils.toStruct(params.market),
  );
  const marketId = encodeMidnightMarketId(market);
  const collateralIndex = params.collateralIndex ?? 0n;
  const { token } = MarketUtils.getCollateralByIndex(market, collateralIndex);
  if (params.nativeAmount === 0n || params.nativeAmount === undefined) {
    throw new NonPositiveInputError("nativeAmount", params.nativeAmount ?? 0n);
  }
  const { value, wrappedNative } = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [{ token, assets }],
  });
  const deadline = params.deadline ?? 0n;
  validateDeadline(deadline);
  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value,
    data: encodeMidnightCalldata({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        emptyBlueMarket, // blueMarket
        0n, // assetsToPark
        zeroHash, // callbackSalt
        market, // market
        [{ collateralIndex, assets }], // collateralSupplies
        zeroAddress, // ratifier
        zeroHash, // newRoot
        0n, // signatureHeight
        0n, // signatureNonce
        0n, // signatureDeadline
        0, // v
        zeroHash, // r
        zeroHash, // s
        [], // groupsToCancel
        "0x", // payload
        deadline, // deadline
        wrappedNative, // wrappedNative
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return {
    token,
    tx: deepFreeze<Transaction<MidnightSupplyCollateralWithNativeAction>>({
      ...tx,
      action: {
        type: "midnightSupplyCollateralWithNative",
        args: {
          market: marketId,
          collateralIndex,
          assets,
          accountAddress: params.accountAddress,
          nativeAmount: value,
          deadline,
        },
      },
    }),
  };
}

/** Owned native collateral supply inputs, checked in the encoder's order. @internal */
export interface ParsedMidnightSupplyCollateralWithNative {
  readonly chainId: number;
  readonly market: ReturnType<typeof MarketUtils.toStruct>;
  readonly marketId: ReturnType<typeof encodeMidnightMarketId>;
  readonly collateralIndex: bigint;
  readonly assets: bigint;
  /** wNative collateral pulled from the sender. */
  readonly token: Address;
  readonly accountAddress: Address;
  /** Native funding sent as transaction value. */
  readonly value: bigint;
  readonly wrappedNative: Address;
  readonly deadline: bigint;
}

/**
 * Parses a native collateral supply with the same checks, in the same order, as
 * `midnightSupplyCollateralWithNative`, without encoding the bundle call. Resolving
 * MidnightBundlesV2 is left to the caller. `assetsField` names the amount in its errors, so a
 * caller can report its own parameter name. @internal
 */
export function parseMidnightSupplyCollateralWithNative(
  params: Omit<MidnightSupplyCollateralWithNativeParams, "metadata">,
  assetsField: "assets" | "collateralAssets" = "assets",
): ParsedMidnightSupplyCollateralWithNative {
  validateMidnightAddress("accountAddress", params.accountAddress);
  const assets = parseMidnightNativeCollateralAmount(
    assetsField,
    params.assets,
  );
  if (isAddressEqual(params.accountAddress, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("accountAddress");
  }
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const market = wrapMidnightEncoding("marketId", () =>
    MarketUtils.toStruct(params.market),
  );
  const marketId = encodeMidnightMarketId(market);
  const collateralIndex = params.collateralIndex ?? 0n;
  const { token } = MarketUtils.getCollateralByIndex(market, collateralIndex);
  if (params.nativeAmount === 0n || params.nativeAmount === undefined) {
    throw new NonPositiveInputError("nativeAmount", params.nativeAmount ?? 0n);
  }
  const { value, wrappedNative } = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [{ token, assets }],
  });
  const deadline = params.deadline ?? 0n;
  validateDeadline(deadline);
  return deepFreeze({
    chainId: params.chainId,
    market,
    marketId,
    collateralIndex,
    assets,
    token,
    accountAddress: params.accountAddress,
    value,
    wrappedNative,
    deadline,
  });
}
