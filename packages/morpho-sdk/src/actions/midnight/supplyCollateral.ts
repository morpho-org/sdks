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

/** Parameters for {@link midnightSupplyCollateral}. */
export interface MidnightSupplyCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralIndex?: bigint;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly metadata?: Metadata;
}

/** Encodes `Midnight.supplyCollateral`. */
export const midnightSupplyCollateral = (
  params: MidnightSupplyCollateralParams,
): Readonly<Transaction<MidnightSupplyCollateralAction>> => {
  if (params.assets <= 0n) {
    throw new NonPositiveMidnightAmountError("assets", params.assets);
  }

  const marketId = MarketUtils.toId(params.market);
  const midnight = getChainAddress(params.chainId, "midnight");
  const collateralIndex = params.collateralIndex ?? 0n;

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
