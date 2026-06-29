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
  type MidnightRedeemAction,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightRedeem}. */
export interface MidnightRedeemParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly units: bigint;
  readonly onBehalf: Address;
  readonly receiver?: Address;
  readonly metadata?: Metadata;
}

/** Encodes `Midnight.withdraw` for credit redemption. */
export const midnightRedeem = (
  params: MidnightRedeemParams,
): Readonly<Transaction<MidnightRedeemAction>> => {
  if (params.units <= 0n) {
    throw new NonPositiveMidnightAmountError("units", params.units);
  }

  const marketId = MarketUtils.toId({
    market: params.market,
    chainId: params.chainId,
  });
  const midnight = getChainAddress(params.chainId, "midnight");
  const receiver = params.receiver ?? params.onBehalf;

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "withdraw",
      args: [
        MarketUtils.toStruct(params.market),
        params.units,
        params.onBehalf,
        receiver,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightRedeem",
      args: {
        market: marketId,
        units: params.units,
        onBehalf: params.onBehalf,
        receiver,
      },
    },
  });
};
