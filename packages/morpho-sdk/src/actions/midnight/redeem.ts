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
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  type Metadata,
  type MidnightRedeemAction,
  MidnightZeroOnBehalfError,
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
): Readonly<Transaction<MidnightRedeemAction>> => {
  // Reject a malformed account before comparing it with the zero address.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (params.units <= 0n) {
    throw new NonPositiveInputError("units", params.units);
  }
  validateMidnightUint128Field("units", params.units);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }

  // Reject markets from another chain deployment before encoding the call.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = encodeMidnightMarketId(params.market);
  const midnight = getChainAddress(params.chainId, "midnight");
  const receiver = params.receiver ?? params.onBehalf;
  // Rejects receivers that would strand the redeemed assets in a contract.
  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.market,
    field: "receiver",
    receiver,
  });

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeMidnightCalldata({
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
