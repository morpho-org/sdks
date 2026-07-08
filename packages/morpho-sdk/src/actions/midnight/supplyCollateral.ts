import {
  type MarketInput,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  type MidnightSupplyCollateralAction,
  NonPositiveMidnightAmountError,
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
 * @param params.onBehalf - Account whose collateral balance increases.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralAction>` targeting `Midnight`.
 * @throws {NonPositiveMidnightAmountError} when `assets <= 0n`.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
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
  if (params.assets <= 0n) {
    throw new NonPositiveMidnightAmountError("assets", params.assets);
  }

  const marketId = MarketUtils.toId(params.market);
  const midnight = getChainAddress(params.chainId, "midnight");
  const collateralIndex = params.collateralIndex ?? 0n;
  // Validate that the supplied collateral index is configured before encoding.
  MarketUtils.getCollateralByIndex(params.market, collateralIndex);

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeFunctionData({
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
