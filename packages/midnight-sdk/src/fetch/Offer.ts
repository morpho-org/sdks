import {
  assertNonNegative,
  type BigIntish,
  getChainAddress,
} from "@morpho-org/morpho-ts";
import type { Address, Client, Hash } from "viem";
import { readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { ConsumableUnitsLib } from "../math/index.js";
import { OfferUtils } from "../offers/index.js";
import type { MidnightFetchParams } from "./types.js";
import { callParameters, resolveChainId } from "./utils.js";

/**
 * Fetches and computes remaining consumable units for an offer.
 *
 * Unit-capped offers skip settlement-fee lookup, matching the Solidity
 * library's early return. For asset-capped offers, pass the time to maturity
 * for the same block context as the quote.
 *
 * Reads `eth_chainId` only when the viem client has no configured chain id,
 * then reads `Midnight.consumed(offer.maker, group)` and
 * `Midnight.continuousFee(marketId)`. If the offer's continuous fee cap is
 * below the market's current continuous fee, returns zero. For asset-capped
 * offers where `offer.maxUnits` is zero, also reads
 * `Midnight.settlementFee(marketId, timeToMaturity)`.
 *
 * @param client - Viem client used for the reads.
 * @param params.marketId - Market id used for settlement-fee lookup on asset-capped offers.
 * @param params.offer.buy - Whether the maker buys loan assets.
 * @param params.offer.maker - Maker address whose consumed group amount is read.
 * @param params.offer.tick - Offer tick used for asset-to-unit conversion.
 * @param params.offer.maxUnits - Unit cap; when non-zero, settlement-fee lookup is skipped.
 * @param params.offer.maxAssets - Asset cap used when `params.offer.maxUnits` is zero.
 * @param params.offer.continuousFeeCap - Maximum market continuous fee accepted by this offer.
 * @param params.group - Offer group id whose consumed amount is read.
 * @param params.timeToMaturity - Time to maturity used for settlement-fee lookup on asset-capped offers.
 * @param params.account - Optional account used as the `from` field for the reads.
 * @param params.blockNumber - Optional block number used for the reads.
 * @param params.blockTag - Optional block tag used for the reads.
 * @param params.stateOverride - Optional state override set used for the reads.
 * @returns Consumable units.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @throws {NegativeValueError} when asset-capped `timeToMaturity`, offer caps, or SDK math inputs are negative.
 * @throws {InvalidOfferParameterError} when offer caps are both zero or both non-zero.
 * @throws {DivisionByZeroError} when the delegated units conversion divides by zero.
 * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy offer price.
 * @example
 * ```ts
 * import { fetchConsumableUnits } from "@morpho-org/midnight-sdk";
 * import { createPublicClient, http, zeroHash } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const units = await fetchConsumableUnits(client, {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   offer: {
 *     buy: true,
 *     maker: "0x0000000000000000000000000000000000009000",
 *     tick: 5_000n,
 *     maxUnits: 100n,
 *     maxAssets: 0n,
 *     continuousFeeCap: 317097919n,
 *   },
 *   group: zeroHash,
 *   timeToMaturity: 3_600n,
 * });
 * console.log(units);
 * ```
 */
export async function fetchConsumableUnits(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly offer: {
      readonly buy: boolean;
      readonly maker: Address;
      readonly tick: BigIntish;
      readonly maxUnits: BigIntish;
      readonly maxAssets: BigIntish;
      readonly continuousFeeCap: BigIntish;
    };
    readonly group: Hash;
    readonly timeToMaturity: BigIntish;
  },
) {
  const maxUnits = BigInt(params.offer.maxUnits);
  const maxAssets = BigInt(params.offer.maxAssets);
  const continuousFeeCap = BigInt(params.offer.continuousFeeCap);
  assertNonNegative("offer.maxUnits", maxUnits);
  assertNonNegative("offer.maxAssets", maxAssets);
  assertNonNegative("offer.continuousFeeCap", continuousFeeCap);
  OfferUtils.validateOfferCaps({ maxUnits, maxAssets });
  const needsSettlementFee = maxUnits === 0n;
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
    args: [params.offer.maker, params.group],
  });
  const continuousFee = readContract(client, {
    ...callParameters(params),
    address: midnight,
    abi: midnightAbi,
    functionName: "continuousFee",
    args: [params.marketId],
  });

  const [consumedValue, marketContinuousFee] = await Promise.all([
    consumed,
    continuousFee,
  ]);

  if (continuousFeeCap < BigInt(marketContinuousFee)) return 0n;

  const settlementFee = needsSettlementFee
    ? await readContract(client, {
        ...callParameters(params),
        address: midnight,
        abi: midnightAbi,
        functionName: "settlementFee",
        args: [params.marketId, timeToMaturity],
      })
    : 0n;

  return ConsumableUnitsLib.consumableUnits({
    offer: params.offer,
    consumed: consumedValue,
    settlementFee,
  });
}
