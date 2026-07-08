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

/** One time-bounded offer leg to convert into a Midnight `Offer.create` input. */
export interface FixedRateOfferChainLeg {
  /** Spacing-aligned Midnight tick for this offer. */
  readonly tick: bigint;
  /** First timestamp at which the offer leg is active. */
  readonly startTimestamp: bigint;
  /** Last timestamp at which the offer leg is active. */
  readonly expiryTimestamp: bigint;
}

/** Parameters shared by lend-only and borrow-only fixed-rate offer-chain builders. */
export interface BuildFixedRateOfferChainParams {
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

/**
 * Utilities for building time-bounded Midnight offer chains.
 *
 * A Midnight offer has one fixed price, so its displayed yearly rate changes
 * as maturity approaches. The markets app uses these helpers when a maker wants
 * to post, for example, a 5% order for several months: the app builds several
 * adjacent offers sharing the same reserve, each with a different tick and time
 * window, so the order reviews and renders as a stable 5% order across the
 * selected window instead of drifting upward as time passes.
 *
 * @example
 * ```ts
 * import { OfferChainUtils } from "@morpho-org/midnight-sdk";
 *
 * const legs = OfferChainUtils.buildLendFixedRateOfferChain({
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
   * Use this cap before displaying an expiry picker for a fixed-rate maker
   * order. The last part of the maturity window is intentionally excluded
   * because tiny time changes cause large displayed-rate drift.
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
   * Builds borrow-side sell-offer legs that approximate one fixed maker rate over time.
   *
   * Use before a make-borrow or supply-collateral-and-make-borrow flow when a
   * borrower wants one displayed fixed borrow rate across a longer window. Map
   * the returned legs to `Offer.create({ buy: false, ... })`, then group and
   * submit them through the maker flow.
   *
   * Borrow chains read their target rate at each leg's expiry edge. If a leg
   * would need to extend past `chainEndTimestamp`, it is dropped rather than
   * clamped so the expiry edge remains the recoverable target-rate edge.
   *
   * @param params - Fixed-rate offer-chain parameters without a side field.
   * @returns Borrow-side offer legs that can be mapped to `Offer.create({ buy: false, ... })`.
   * @throws {InvalidOfferParameterError} when an input is invalid or the end timestamp exceeds the supported horizon.
   * @example
   * ```ts
   * import { Offer, OfferChainUtils } from "@morpho-org/midnight-sdk";
   *
   * const legs = OfferChainUtils.buildBorrowFixedRateOfferChain({
   *   targetRate: 0.08,
   *   tickSpacing: market.tickSpacing,
   *   maturityTimestamp: market.params.maturity,
   *   chainStartTimestamp: now,
   *   chainEndTimestamp: expiry,
   * });
   * const offers = legs.map((leg) =>
   *   Offer.create({
   *     ...baseOffer,
   *     buy: false,
   *     tick: leg.tick,
   *     start: leg.startTimestamp,
   *     expiry: leg.expiryTimestamp,
   *   }),
   * );
   * ```
   */
  export function buildBorrowFixedRateOfferChain(
    params: BuildFixedRateOfferChainParams,
  ): readonly FixedRateOfferChainLeg[] {
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

    const maxChainEndTimestamp = getMaxFixedRateOfferChainEndTimestamp({
      maturityTimestamp,
      chainStartTimestamp,
    });
    if (chainEndTimestamp > maxChainEndTimestamp) {
      throw new InvalidOfferParameterError({
        parameter: "chainEndTimestamp",
        value: chainEndTimestamp,
        instruction: `Use a timestamp no greater than "${maxChainEndTimestamp}".`,
      });
    }

    const tauInitial =
      Number(maturityTimestamp - chainStartTimestamp) / SECONDS_PER_YEAR;
    const tauStop =
      Number(maturityTimestamp - chainEndTimestamp) / SECONDS_PER_YEAR;
    const lowerRate = params.targetRate * (1 - FAVORABLE_RATE_DRIFT);
    /* v8 ignore next: positive finite targetRate validation keeps lowerRate positive for practical JS numbers. */
    if (lowerRate <= 0) return [];

    const legs: FixedRateOfferChainLeg[] = [];
    let tauTop = tauInitial;
    let iteration = 0;

    for (; iteration < MAX_CHAIN_LEGS; iteration++) {
      const price = (1 + lowerRate) ** -tauTop;
      let priceInput: bigint;
      if (!Number.isFinite(price) || price <= 0) {
        priceInput = 0n;
      } else if (price >= 1) {
        priceInput = MathLib.WAD;
      } else {
        priceInput = parseUnits(price.toFixed(18), 18);
      }
      const rawTick = TickLib.priceToTick(priceInput, 1n) - 1n;
      if (rawTick < 0n || rawTick > MAX_TICK) break;

      const tick = floorTickToSpacing(rawTick, tickSpacing);
      if (legs.at(-1)?.tick === tick) break;

      const tauMax = rateTau(tick, lowerRate);
      const tauMin = rateTau(tick, params.targetRate);
      if (tauMin >= tauTop) break;
      if (tauMin < tauStop) break;

      const startTimestamp =
        maturityTimestamp -
        BigInt(Math.round(Math.min(tauMax, tauTop) * SECONDS_PER_YEAR));
      const expiryTimestamp =
        maturityTimestamp - BigInt(Math.round(tauMin * SECONDS_PER_YEAR));
      /* v8 ignore next: tests cover positive legs; zero-width legs are skipped only on rounding ties. */
      if (expiryTimestamp > startTimestamp) {
        legs.push({ tick, startTimestamp, expiryTimestamp });
      }
      tauTop = tauMin;
    }

    /* v8 ignore next: the monotonic tick walk exits before exhausting the finite tick range. */
    if (iteration >= MAX_CHAIN_LEGS) {
      throw new InvalidOfferParameterError({
        parameter: "tickSpacing",
        value: tickSpacing,
        instruction: `Borrow chain exceeded "${MAX_CHAIN_LEGS}" legs.`,
      });
    }

    return legs;
  }

  /**
   * Builds lend-side buy-offer legs that approximate one fixed maker rate over time.
   *
   * Use before a make-lend flow when a lender wants one displayed fixed lend
   * rate across a longer window. Map the returned legs to
   * `Offer.create({ buy: true, ... })`, then group and submit them through the
   * maker flow.
   *
   * Lend chains read their target rate at each leg's start edge. The first leg
   * may start before `chainStartTimestamp`; clamping that edge would move the
   * recoverable display rate below the maker's target.
   *
   * @param params - Fixed-rate offer-chain parameters without a side field.
   * @returns Lend-side offer legs that can be mapped to `Offer.create({ buy: true, ... })`.
   * @throws {InvalidOfferParameterError} when an input is invalid or the end timestamp exceeds the supported horizon.
   * @example
   * ```ts
   * import { Offer, OfferChainUtils } from "@morpho-org/midnight-sdk";
   *
   * const legs = OfferChainUtils.buildLendFixedRateOfferChain({
   *   targetRate: 0.05,
   *   tickSpacing: market.tickSpacing,
   *   maturityTimestamp: market.params.maturity,
   *   chainStartTimestamp: now,
   *   chainEndTimestamp: expiry,
   * });
   * const offers = legs.map((leg) =>
   *   Offer.create({
   *     ...baseOffer,
   *     buy: true,
   *     tick: leg.tick,
   *     start: leg.startTimestamp,
   *     expiry: leg.expiryTimestamp,
   *   }),
   * );
   * ```
   */
  export function buildLendFixedRateOfferChain(
    params: BuildFixedRateOfferChainParams,
  ): readonly FixedRateOfferChainLeg[] {
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

    const maxChainEndTimestamp = getMaxFixedRateOfferChainEndTimestamp({
      maturityTimestamp,
      chainStartTimestamp,
    });
    if (chainEndTimestamp > maxChainEndTimestamp) {
      throw new InvalidOfferParameterError({
        parameter: "chainEndTimestamp",
        value: chainEndTimestamp,
        instruction: `Use a timestamp no greater than "${maxChainEndTimestamp}".`,
      });
    }

    const tauInitial =
      Number(maturityTimestamp - chainStartTimestamp) / SECONDS_PER_YEAR;
    const tauStop =
      Number(maturityTimestamp - chainEndTimestamp) / SECONDS_PER_YEAR;
    const upperRate = params.targetRate * (1 + FAVORABLE_RATE_DRIFT);
    const maxAlignedTick = floorTickToSpacing(MAX_TICK, tickSpacing);
    const highestDiscountTick = floorTickToSpacing(
      TickLib.priceToTick(MathLib.WAD, 1n) - 1n,
      tickSpacing,
    );
    const ceilingTick =
      highestDiscountTick < maxAlignedTick
        ? highestDiscountTick
        : maxAlignedTick;

    const tauCeiling = rateTau(ceilingTick, upperRate);
    let tauBottom = Math.max(tauStop, tauCeiling);
    if (tauBottom >= tauInitial) return [];

    const tauLegs: {
      readonly tick: bigint;
      readonly tauMax: number;
      readonly tauMin: number;
    }[] = [];
    let iteration = 0;

    for (; iteration < MAX_CHAIN_LEGS; iteration++) {
      const price = (1 + upperRate) ** -tauBottom;
      let priceInput: bigint;
      if (!Number.isFinite(price) || price <= 0) {
        priceInput = 0n;
      } else {
        /* v8 ignore next: positive rates that survive the grid-floor check keep lend-chain prices below one. */
        if (price >= 1) {
          priceInput = MathLib.WAD;
        } else {
          priceInput = parseUnits(price.toFixed(18), 18);
        }
      }
      const rawTick = TickLib.priceToTick(priceInput, 1n);
      /* v8 ignore next: priceToTick returns in-range ticks; maxAlignedTick only tightens non-dividing spacing. */
      if (rawTick < 0n || rawTick > MAX_TICK || rawTick > maxAlignedTick) break;

      const alignedTick =
        ((rawTick + tickSpacing - 1n) / tickSpacing) * tickSpacing;
      /* v8 ignore next: non-dividing spacing boundary clamp is defensive; normal alignment is covered. */
      const tick = alignedTick < maxAlignedTick ? alignedTick : maxAlignedTick;
      if (tauLegs.at(-1)?.tick === tick) break;

      const tauMax = rateTau(tick, params.targetRate);
      const tauMin = rateTau(tick, upperRate);
      if (tauMax <= tauBottom) break;

      tauLegs.push({ tick, tauMax, tauMin: Math.max(tauMin, tauBottom) });
      if (tauMax >= tauInitial) break;

      tauBottom = tauMax;
    }

    /* v8 ignore next: the monotonic tick walk exits before exhausting the finite tick range. */
    if (iteration >= MAX_CHAIN_LEGS) {
      throw new InvalidOfferParameterError({
        parameter: "tickSpacing",
        value: tickSpacing,
        instruction: `Lend chain exceeded "${MAX_CHAIN_LEGS}" legs.`,
      });
    }

    const leftmostLeg = tauLegs.at(-1);
    if (leftmostLeg && leftmostLeg.tauMax < tauInitial) return [];

    return tauLegs
      .reverse()
      .map((leg) => ({
        tick: leg.tick,
        startTimestamp:
          maturityTimestamp - BigInt(Math.round(leg.tauMax * SECONDS_PER_YEAR)),
        expiryTimestamp:
          maturityTimestamp - BigInt(Math.round(leg.tauMin * SECONDS_PER_YEAR)),
      }))
      .filter((leg) => leg.expiryTimestamp > leg.startTimestamp);
  }

  /**
   * Returns the latest supported end timestamp for a fixed-rate offer chain.
   *
   * Chains intentionally stop before the final part of the maturity window
   * because rate sensitivity accelerates near maturity and would require too
   * many short-lived offers for a stable maker quote.
   * Call this when constraining a make-offer expiry selector, then pass the
   * selected timestamp to the lend-only or borrow-only chain builder.
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

function rateTau(tick: bigint, rate: number): number {
  const price = Number(formatUnits(TickLib.tickToPrice(tick), 18));
  /* v8 ignore next: builders pass positive rates and discount ticks; this guards direct internal misuse. */
  if (price <= 0 || price >= 1 || rate <= 0) return 0;

  return Math.log(1 / price) / Math.log(1 + rate);
}

function floorTickToSpacing(tick: bigint, spacing: bigint) {
  return tick - (tick % spacing);
}
