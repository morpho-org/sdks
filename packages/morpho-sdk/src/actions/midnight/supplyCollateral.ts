import {
  type MarketInput,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import {
  encodeMidnightCalldata,
  encodeMidnightMarketId,
} from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightUint128Field } from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightSupplyCollateralAction,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

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
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralAction>` targeting `Midnight`.
 * @throws {NonPositiveInputError} when `assets <= 0n`.
 * @throws {InputExceedsMaxError} when `assets` exceeds `uint128`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
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
): Readonly<Transaction<MidnightSupplyCollateralAction>> => {
  // Reject a malformed account before comparing it with the zero address.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (params.assets <= 0n) {
    throw new NonPositiveInputError("assets", params.assets);
  }
  validateMidnightUint128Field("assets", params.assets);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }

  // Reject markets from another chain deployment before encoding the call.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = encodeMidnightMarketId(params.market);
  const midnight = getChainAddress(params.chainId, "midnight");
  const collateralIndex = params.collateralIndex ?? 0n;
  // Validate that the supplied collateral index is configured before encoding.
  MarketUtils.getCollateralByIndex(params.market, collateralIndex);

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(params.market),
        collateralIndex,
        params.assets,
        params.onBehalf,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateral",
      args: {
        market: marketId,
        collateralIndex,
        assets: params.assets,
        onBehalf: params.onBehalf,
      },
    },
  });
};
