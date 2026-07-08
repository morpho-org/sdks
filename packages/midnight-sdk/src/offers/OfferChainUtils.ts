import { type BigIntish, MathLib, Time } from "@morpho-org/morpho-ts";
import { formatUnits, parseUnits } from "viem";
import { MAX_TICK } from "../constants.js";
import { InvalidOfferParameterError } from "../errors.js";
import { TickLib } from "../math/index.js";

const FAVORABLE_RATE_DRIFT = 0.1;
const MAX_EXPIRY_TTM_NUMERATOR = 75n;
const MAX_EXPIRY_TTM_DENOMINATOR = 100n;
const MAX_CHAIN_LEGS = Number(MAX_TICK) + 1;
const SECONDS_PER_YEAR = Number(Time.s.from.y(1n));

/** One time-bounded offer leg in a fixed-rate Midnight offer chain. */
export interface FixedRateOfferChainLeg {
  /** Spacing-aligned Midnight tick for this offer. */
  readonly tick: bigint;
  /** First timestamp at which the offer leg is active. */
  readonly startTimestamp: bigint;
  /** Last timestamp at which the offer leg is active. */
  readonly expiryTimestamp: bigint;
}

/** Parameters for {@link OfferChainUtils.buildFixedRateOfferChain}. */
export interface BuildFixedRateOfferChainParams {
  /** Maker side: `"lend"` for buy offers, `"borrow"` for sell offers. */
  readonly side: "borrow" | "lend";
  /** Target yearly fixed rate as a decimal number, for example `0.05` for 5%. */
  readonly targetRate: number;
  /** Tick spacing enforced by the market. */
  readonly tickSpacing: BigIntish;
  /** Market maturity timestamp in seconds. */
  readonly maturityTimestamp: BigIntish;
  /** First timestamp the chain should cover. */
  readonly chainStartTimestamp: BigIntish;
  /** Latest timestamp the chain may cover. */
  readonly chainEndTimestamp: BigIntish;
}

interface NormalizedBuildFixedRateOfferChainParams {
  readonly side: "borrow" | "lend";
  readonly targetRate: number;
  readonly tickSpacing: bigint;
  readonly maturityTimestamp: bigint;
  readonly chainStartTimestamp: bigint;
  readonly chainEndTimestamp: bigint;
}

interface TauLeg {
  readonly tick: bigint;
  readonly tauMax: number;
  readonly tauMin: number;
}

/**
 * Utilities for building time-bounded Midnight offer chains.
 *
 * @example
 * ```ts
 * import { OfferChainUtils } from "@morpho-org/midnight-sdk";
 *
 * const legs = OfferChainUtils.buildFixedRateOfferChain({
 *   side: "lend",
 *   targetRate: 0.05,
 *   tickSpacing: 4n,
 *   maturityTimestamp: 1_798_761_600n,
 *   chainStartTimestamp: 1_767_225_600n,
 *   chainEndTimestamp: 1_791_153_600n,
 * });
 * console.log(legs[0]?.tick);
 * ```
 */
export namespace OfferChainUtils {
  /**
   * Maximum fraction of the initial time-to-maturity covered by a fixed-rate offer chain.
   *
   * @example
   * ```ts
   * import { OfferChainUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(OfferChainUtils.MAX_EXPIRY_TTM_FRACTION);
   * ```
   */
  export const MAX_EXPIRY_TTM_FRACTION = 0.75;

  /**
   * Builds offer legs that approximate one fixed maker rate over time.
   *
   * A Midnight offer has one fixed price, so its displayed yearly rate changes
   * as maturity approaches. The markets app uses this helper when a maker wants
   * to post, for example, a 5% lend order for several months: the app builds
   * several adjacent offers sharing the same reserve, each with a different
   * tick and time window, so the order reviews and renders as a stable 5% order
   * across the selected window instead of drifting upward as time passes.
   *
   * The returned legs are contiguous, use increasing spacing-aligned ticks, and
   * stay on the maker-favorable side of `targetRate` within each leg: borrow
   * chains stay at or below the target, while lend chains stay at or above it.
   * Returns `[]` when the requested rate/window cannot be represented on the
   * tick grid.
   *
   * @param params - Fixed-rate offer-chain parameters.
   * @returns Offer legs that can be mapped to `Offer.create` inputs.
   * @throws {InvalidOfferParameterError} when an input is invalid or the end timestamp exceeds the supported horizon.
   * @example
   * ```ts
   * import { Offer, OfferChainUtils } from "@morpho-org/midnight-sdk";
   *
   * const legs = OfferChainUtils.buildFixedRateOfferChain({
   *   side: "lend",
   *   targetRate: 0.05,
   *   tickSpacing: market.tickSpacing,
   *   maturityTimestamp: market.params.maturity,
   *   chainStartTimestamp: now,
   *   chainEndTimestamp: expiry,
   * });
   *
   * const offers = legs.map((leg) =>
   *   Offer.create({
   *     market: market.params,
   *     buy: true,
   *     maker,
   *     tick: leg.tick,
   *     start: leg.startTimestamp,
   *     expiry: leg.expiryTimestamp,
   *     ratifier,
   *     maxAssets: loanAssets,
   *   }),
   * );
   * ```
   */
  export function buildFixedRateOfferChain(
    params: BuildFixedRateOfferChainParams,
  ): readonly FixedRateOfferChainLeg[] {
    const normalized = normalizeBuildParams(params);
    const maxChainEndTimestamp = getMaxFixedRateOfferChainEndTimestamp({
      maturityTimestamp: normalized.maturityTimestamp,
      chainStartTimestamp: normalized.chainStartTimestamp,
    });
    if (normalized.chainEndTimestamp > maxChainEndTimestamp) {
      throw new InvalidOfferParameterError({
        parameter: "chainEndTimestamp",
        value: normalized.chainEndTimestamp,
        instruction: `Use a timestamp no greater than "${maxChainEndTimestamp}".`,
      });
    }

    const tauInitial =
      Number(normalized.maturityTimestamp - normalized.chainStartTimestamp) /
      SECONDS_PER_YEAR;
    const tauStop =
      Number(normalized.maturityTimestamp - normalized.chainEndTimestamp) /
      SECONDS_PER_YEAR;
    const legs =
      normalized.side === "borrow"
        ? buildBorrowChain({
            targetRate: normalized.targetRate,
            tauInitial,
            tauStop,
            tickSpacing: normalized.tickSpacing,
          })
        : buildLendChain({
            targetRate: normalized.targetRate,
            tauInitial,
            tauStop,
            tickSpacing: normalized.tickSpacing,
          });

    return legs
      .map((leg) => ({
        tick: leg.tick,
        startTimestamp: tauToTimestamp(
          normalized.maturityTimestamp,
          leg.tauMax,
        ),
        expiryTimestamp: tauToTimestamp(
          normalized.maturityTimestamp,
          leg.tauMin,
        ),
      }))
      .filter((leg) => leg.expiryTimestamp > leg.startTimestamp);
  }

  /**
   * Returns the latest supported end timestamp for a fixed-rate offer chain.
   *
   * Chains intentionally stop before the final part of the maturity window
   * because rate sensitivity accelerates near maturity and would require too
   * many short-lived offers for a stable maker quote.
   *
   * @param params - Maturity and chain-start timestamps.
   * @returns Latest accepted chain end timestamp.
   * @throws {InvalidOfferParameterError} when a timestamp is invalid.
   * @example
   * ```ts
   * import { OfferChainUtils } from "@morpho-org/midnight-sdk";
   *
   * const maxExpiry = OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp({
   *   maturityTimestamp: market.params.maturity,
   *   chainStartTimestamp: now,
   * });
   * console.log(maxExpiry);
   * ```
   */
  export function getMaxFixedRateOfferChainEndTimestamp(params: {
    readonly maturityTimestamp: BigIntish;
    readonly chainStartTimestamp: BigIntish;
  }) {
    const maturityTimestamp = normalizeSafeInteger(
      "maturityTimestamp",
      params.maturityTimestamp,
    );
    const chainStartTimestamp = normalizeSafeInteger(
      "chainStartTimestamp",
      params.chainStartTimestamp,
    );
    if (maturityTimestamp <= chainStartTimestamp) {
      throw new InvalidOfferParameterError({
        parameter: "maturityTimestamp",
        value: maturityTimestamp,
        instruction:
          "Use a maturity timestamp greater than chainStartTimestamp.",
      });
    }

    return (
      chainStartTimestamp +
      ((maturityTimestamp - chainStartTimestamp) * MAX_EXPIRY_TTM_NUMERATOR) /
        MAX_EXPIRY_TTM_DENOMINATOR
    );
  }
}

function buildBorrowChain(params: {
  readonly targetRate: number;
  readonly tauInitial: number;
  readonly tauStop: number;
  readonly tickSpacing: bigint;
}): readonly TauLeg[] {
  const lowerRate = params.targetRate * (1 - FAVORABLE_RATE_DRIFT);
  if (lowerRate <= 0) return [];

  const legs: TauLeg[] = [];
  let tauTop = params.tauInitial;
  let iteration = 0;

  for (; iteration < MAX_CHAIN_LEGS; iteration++) {
    const rawTick =
      TickLib.priceToTick(rateToPriceAtTau(lowerRate, tauTop), 1n) - 1n;
    if (rawTick < 0n || rawTick > MAX_TICK) break;

    const tick = floorTickToSpacing(rawTick, params.tickSpacing);
    if (legs.at(-1)?.tick === tick) break;

    const tauMax = rateTau(tick, lowerRate);
    const tauMin = rateTau(tick, params.targetRate);
    if (tauMin >= tauTop) break;
    if (tauMin < params.tauStop) break;

    legs.push({ tick, tauMax: Math.min(tauMax, tauTop), tauMin });
    tauTop = tauMin;
  }

  if (iteration >= MAX_CHAIN_LEGS) {
    throw new InvalidOfferParameterError({
      parameter: "tickSpacing",
      value: params.tickSpacing,
      instruction: `Borrow chain exceeded "${MAX_CHAIN_LEGS}" legs.`,
    });
  }

  return legs;
}

function buildLendChain(params: {
  readonly targetRate: number;
  readonly tauInitial: number;
  readonly tauStop: number;
  readonly tickSpacing: bigint;
}): readonly TauLeg[] {
  const upperRate = params.targetRate * (1 + FAVORABLE_RATE_DRIFT);
  const maxAlignedTick = floorTickToSpacing(MAX_TICK, params.tickSpacing);
  const ceilingTick = minBigint(
    highestDiscountTick(params.tickSpacing),
    maxAlignedTick,
  );

  const tauCeiling = rateTau(ceilingTick, upperRate);
  let tauBottom = Math.max(params.tauStop, tauCeiling);
  if (tauBottom >= params.tauInitial) return [];

  const legs: TauLeg[] = [];
  let iteration = 0;

  for (; iteration < MAX_CHAIN_LEGS; iteration++) {
    const rawTick = TickLib.priceToTick(
      rateToPriceAtTau(upperRate, tauBottom),
      1n,
    );
    if (rawTick < 0n || rawTick > MAX_TICK || rawTick > maxAlignedTick) break;

    const tick = ceilTickToSpacing(rawTick, params.tickSpacing);
    if (legs.at(-1)?.tick === tick) break;

    const tauMax = rateTau(tick, params.targetRate);
    const tauMin = rateTau(tick, upperRate);
    if (tauMax <= tauBottom) break;

    legs.push({ tick, tauMax, tauMin: Math.max(tauMin, tauBottom) });
    if (tauMax >= params.tauInitial) break;

    tauBottom = tauMax;
  }

  if (iteration >= MAX_CHAIN_LEGS) {
    throw new InvalidOfferParameterError({
      parameter: "tickSpacing",
      value: params.tickSpacing,
      instruction: `Lend chain exceeded "${MAX_CHAIN_LEGS}" legs.`,
    });
  }

  const leftmostLeg = legs.at(-1);
  if (leftmostLeg && leftmostLeg.tauMax < params.tauInitial) return [];

  return legs.reverse();
}

function normalizeBuildParams(
  params: BuildFixedRateOfferChainParams,
): NormalizedBuildFixedRateOfferChainParams {
  if (params.side !== "borrow" && params.side !== "lend") {
    throw new InvalidOfferParameterError({
      parameter: "side",
      value: params.side,
      instruction: 'Use "borrow" or "lend".',
    });
  }
  if (!Number.isFinite(params.targetRate)) {
    throw new InvalidOfferParameterError({
      parameter: "targetRate",
      value: params.targetRate,
      instruction: "Use a finite positive yearly rate.",
    });
  }
  if (params.targetRate <= 0) {
    throw new InvalidOfferParameterError({
      parameter: "targetRate",
      value: params.targetRate,
      instruction: "Use a positive yearly rate.",
    });
  }

  const tickSpacing = normalizeSafeInteger("tickSpacing", params.tickSpacing);
  if (tickSpacing <= 0n) {
    throw new InvalidOfferParameterError({
      parameter: "tickSpacing",
      value: tickSpacing,
      instruction: "Use a positive tick spacing.",
    });
  }

  const maturityTimestamp = normalizeSafeInteger(
    "maturityTimestamp",
    params.maturityTimestamp,
  );
  const chainStartTimestamp = normalizeSafeInteger(
    "chainStartTimestamp",
    params.chainStartTimestamp,
  );
  const chainEndTimestamp = normalizeSafeInteger(
    "chainEndTimestamp",
    params.chainEndTimestamp,
  );
  if (maturityTimestamp <= chainStartTimestamp) {
    throw new InvalidOfferParameterError({
      parameter: "maturityTimestamp",
      value: maturityTimestamp,
      instruction: "Use a timestamp greater than chainStartTimestamp.",
    });
  }
  if (chainEndTimestamp <= chainStartTimestamp) {
    throw new InvalidOfferParameterError({
      parameter: "chainEndTimestamp",
      value: chainEndTimestamp,
      instruction: "Use a timestamp greater than chainStartTimestamp.",
    });
  }

  return {
    side: params.side,
    targetRate: params.targetRate,
    tickSpacing,
    maturityTimestamp,
    chainStartTimestamp,
    chainEndTimestamp,
  };
}

function normalizeSafeInteger(parameter: string, value: BigIntish) {
  let normalized: bigint;
  try {
    normalized = BigInt(value);
  } catch (cause) {
    throw new InvalidOfferParameterError({
      parameter,
      value,
      instruction: "Use a safe integer value.",
      cause,
    });
  }

  const numberValue = Number(normalized);
  if (!Number.isSafeInteger(numberValue)) {
    throw new InvalidOfferParameterError({
      parameter,
      value,
      instruction: "Use a JavaScript-safe integer value.",
    });
  }

  return normalized;
}

function rateToPriceAtTau(rate: number, tau: number): bigint {
  const price = (1 + rate) ** -tau;
  if (!Number.isFinite(price) || price <= 0) return 0n;
  if (price >= 1) return MathLib.WAD;

  return parseUnits(price.toFixed(18), 18);
}

function rateTau(tick: bigint, rate: number): number {
  const price = Number(formatUnits(TickLib.tickToPrice(tick), 18));
  if (price <= 0 || price >= 1 || rate <= 0) return 0;

  return Math.log(1 / price) / Math.log(1 + rate);
}

function tauToTimestamp(maturityTimestamp: bigint, tau: number) {
  return maturityTimestamp - BigInt(Math.round(tau * SECONDS_PER_YEAR));
}

function floorTickToSpacing(tick: bigint, spacing: bigint) {
  return tick - (tick % spacing);
}

function ceilTickToSpacing(tick: bigint, spacing: bigint) {
  return ((tick + spacing - 1n) / spacing) * spacing;
}

function highestDiscountTick(tickSpacing: bigint) {
  return floorTickToSpacing(
    TickLib.priceToTick(MathLib.WAD, 1n) - 1n,
    tickSpacing,
  );
}

function minBigint(a: bigint, b: bigint) {
  return a < b ? a : b;
}
