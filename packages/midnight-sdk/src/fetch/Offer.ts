import {
  assertNonNegative,
  type BigIntish,
  getChainAddress,
} from "@morpho-org/morpho-ts";
import type { Client, Hash } from "viem";
import { readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { ConsumableUnitsLib } from "../math/index.js";
import { type IOffer, type Offer, OfferUtils } from "../offers/index.js";
import type { MidnightFetchParams } from "./types.js";
import { callParameters, resolveChainId } from "./utils.js";

/**
 * Fetches and computes remaining consumable units for an offer.
 *
 * For unit-capped offers this only reads `consumed`, matching the Solidity
 * library's early return before any settlement-fee lookup. For asset-capped
 * offers, pass the time to maturity for the same block context as the quote.
 *
 * @param client - Viem client used for the reads.
 * @param params - Fetch parameters.
 * @returns Consumable units.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @throws NegativeValueError when asset-capped `timeToMaturity` or SDK math inputs are negative.
 * @throws DivisionByZeroError when the delegated units conversion divides by zero.
 * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
 * @example
 * ```ts
 * import { fetchConsumableUnits } from "@morpho-org/midnight-sdk";
 *
 * const units = await fetchConsumableUnits({} as never, {} as never);
 * console.log(units);
 * ```
 */
export async function fetchConsumableUnits(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly offer: IOffer | Offer;
    readonly group: Hash;
    readonly timeToMaturity: BigIntish;
  },
) {
  const offer = OfferUtils.normalizeOffer(params.offer);
  assertNonNegative("offer.maxUnits", offer.maxUnits);
  assertNonNegative("offer.maxAssets", offer.maxAssets);
  const needsSettlementFee = offer.maxUnits === 0n;
  const timeToMaturity = needsSettlementFee
    ? BigInt(params.timeToMaturity)
    : 0n;
  if (needsSettlementFee) {
    assertNonNegative("timeToMaturity", timeToMaturity);
  }

  const chainId = await resolveChainId(client);
  const midnight = getChainAddress(chainId, "midnight");
  const consumed = readContract(client, {
    ...callParameters(params),
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [offer.maker, params.group],
  });

  const [consumedValue, settlementFee] = needsSettlementFee
    ? await Promise.all([
        consumed,
        readContract(client, {
          ...callParameters(params),
          address: midnight,
          abi: midnightAbi,
          functionName: "settlementFee",
          args: [params.marketId, timeToMaturity],
        }),
      ])
    : [await consumed, 0n];

  return ConsumableUnitsLib.consumableUnits({
    offer,
    consumed: consumedValue,
    settlementFee,
  });
}
