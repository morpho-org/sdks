import {
  type MarketInput,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightRedeemAction,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

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
 * from the supplied `positionData` snapshot before returning the transaction plan.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.market - Midnight market whose credit is redeemed.
 * @param params.units - Credit units to withdraw.
 * @param params.onBehalf - Account whose credit balance is reduced.
 * @param params.receiver - Optional receiver for withdrawn loan assets; defaults to `onBehalf`.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightRedeemAction>` targeting `Midnight`.
 * @throws {NonPositiveInputError} when `units <= 0n`.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
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
): Readonly<Transaction<MidnightRedeemAction>> => {
  if (params.units <= 0n) {
    throw new NonPositiveInputError("units", params.units);
  }

  // Reject markets from another chain deployment before encoding the call.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = MarketUtils.toId(params.market);
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
