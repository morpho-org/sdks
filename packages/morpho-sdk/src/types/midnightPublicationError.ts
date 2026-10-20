import type { Address, Hex } from "viem";

/** Thrown when a maker offer expires at or before the pinned publication timestamp.
 *
 * @throws {MidnightOfferExpiredError} when expiry is not later than the pinned publication timestamp.
 *
 * @example
 * ```ts
 * import { MidnightOfferExpiredError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferExpiredError({ index: 0, expiry: 10n, now: 10n });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferExpiredError extends Error {
  /** Creates an expiry error. */
  public constructor(params: {
    readonly index: number;
    readonly expiry: bigint;
    readonly now: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" expires at "${params.expiry}", which is not after publication timestamp "${params.now}". Choose a future expiry.`,
    );
    this.index = params.index;
    this.expiry = params.expiry;
    this.now = params.now;
    this.name = "MidnightOfferExpiredError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Offer expiry timestamp. */
  public readonly expiry: bigint;
  /** Pinned publication timestamp. */
  public readonly now: bigint;
}

/** Thrown when an offer expires after its market matures.
 *
 * @throws {MidnightOfferExpiryAfterMaturityError} when expiry exceeds market maturity.
 *
 * @example
 * ```ts
 * import { MidnightOfferExpiryAfterMaturityError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferExpiryAfterMaturityError({ index: 0, expiry: 20n, maturity: 10n });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferExpiryAfterMaturityError extends Error {
  /** Creates an expiry-after-maturity error. */
  public constructor(params: {
    readonly index: number;
    readonly expiry: bigint;
    readonly maturity: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" expires at "${params.expiry}", after market maturity "${params.maturity}". Choose an expiry at or before maturity.`,
    );
    this.index = params.index;
    this.expiry = params.expiry;
    this.maturity = params.maturity;
    this.name = "MidnightOfferExpiryAfterMaturityError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Offer expiry timestamp. */
  public readonly expiry: bigint;
  /** Market maturity timestamp. */
  public readonly maturity: bigint;
}

/** Thrown when a maker's offer group has no remaining consumable units.
 *
 * @throws {MidnightOfferGroupConsumedError} when the group's remaining cap is zero.
 *
 * @example
 * ```ts
 * import { MidnightOfferGroupConsumedError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferGroupConsumedError({ index: 0, group: `0x${"00".repeat(32)}`, consumed: 1n });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferGroupConsumedError extends Error {
  /** Creates a consumed-group error. */
  public constructor(params: {
    readonly index: number;
    readonly group: Hex;
    readonly consumed: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" uses group "${params.group}" with consumed cap "${params.consumed}" and no remaining units. Rebuild the offers with a fresh group.`,
    );
    this.index = params.index;
    this.group = params.group;
    this.consumed = params.consumed;
    this.name = "MidnightOfferGroupConsumedError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Consumed group identifier. */
  public readonly group: Hex;
  /** Onchain consumed cap. */
  public readonly consumed: bigint;
}

/** Thrown when an offer tick is not aligned with its market's spacing.
 *
 * @throws {MidnightOfferTickSpacingError} when the tick is not accessible.
 *
 * @example
 * ```ts
 * import { MidnightOfferTickSpacingError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferTickSpacingError({ index: 0, tick: 5n, tickSpacing: 4 });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferTickSpacingError extends Error {
  /** Creates a tick-spacing error. */
  public constructor(params: {
    readonly index: number;
    readonly tick: bigint;
    readonly tickSpacing: number;
  }) {
    super(
      `Midnight offer "${params.index}" tick "${params.tick}" is not aligned to spacing "${params.tickSpacing}". Rebuild it on an accessible tick.`,
    );
    this.index = params.index;
    this.tick = params.tick;
    this.tickSpacing = params.tickSpacing;
    this.name = "MidnightOfferTickSpacingError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Offer tick. */
  public readonly tick: bigint;
  /** Onchain market tick spacing. */
  public readonly tickSpacing: number;
}

/** Thrown when the market continuous fee exceeds an offer's fee cap.
 *
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds the offer cap.
 *
 * @example
 * ```ts
 * import { MidnightOfferContinuousFeeCapBelowMarketFeeError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferContinuousFeeCapBelowMarketFeeError({ index: 0, marketId: `0x${"00".repeat(32)}`, continuousFeeCap: 0n, continuousFee: 1n });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferContinuousFeeCapBelowMarketFeeError extends Error {
  /** Creates a continuous-fee error. */
  public constructor(params: {
    readonly index: number;
    readonly marketId: Hex;
    readonly continuousFeeCap: bigint;
    readonly continuousFee: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" for market "${params.marketId}" accepts continuous fee up to "${params.continuousFeeCap}", below market fee "${params.continuousFee}". Use a market with a fee within the offer cap.`,
    );
    this.index = params.index;
    this.marketId = params.marketId;
    this.continuousFeeCap = params.continuousFeeCap;
    this.continuousFee = params.continuousFee;
    this.name = "MidnightOfferContinuousFeeCapBelowMarketFeeError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Midnight market identifier. */
  public readonly marketId: Hex;
  /** Maximum continuous fee accepted by the offer. */
  public readonly continuousFeeCap: bigint;
  /** Current market continuous fee. */
  public readonly continuousFee: bigint;
}

/** Thrown when a sell offer has zero price.
 *
 * @throws {MidnightOfferZeroPriceSellError} when a sell offer has a zero tick.
 *
 * @example
 * ```ts
 * import { MidnightOfferZeroPriceSellError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferZeroPriceSellError({ index: 0 });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferZeroPriceSellError extends Error {
  /** Creates a zero-price sell error. */
  public constructor(params: { readonly index: number }) {
    super(
      `Midnight sell offer "${params.index}" has tick "0" and would sell credit for no proceeds. Choose a positive tick.`,
    );
    this.index = params.index;
    this.name = "MidnightOfferZeroPriceSellError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
}

/** Thrown when a Rate V1 offer's price bound cannot become fillable.
 *
 * @throws {MidnightOfferRateBoundUnreachableError} when the bound cannot become fillable.
 *
 * @example
 * ```ts
 * import { MidnightOfferRateBoundUnreachableError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferRateBoundUnreachableError({ index: 0, rate: 1n, tick: 5n });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferRateBoundUnreachableError extends Error {
  /** Creates an unreachable-rate-bound error. */
  public constructor(params: {
    readonly index: number;
    readonly rate: bigint;
    readonly tick: bigint;
  }) {
    super(
      `Midnight Rate V1 offer "${params.index}" at tick "${params.tick}" cannot satisfy rate bound "${params.rate}" before its best fill time. Choose a reachable tick or rate.`,
    );
    this.index = params.index;
    this.rate = params.rate;
    this.tick = params.tick;
    this.name = "MidnightOfferRateBoundUnreachableError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Rate V1 entry rate. */
  public readonly rate: bigint;
  /** Offer tick. */
  public readonly tick: bigint;
}

/** Thrown when a reduce-only buy offer has no debt to repay.
 *
 * @throws {MidnightOfferNoDebtError} when a reduce-only buy has no maker debt.
 *
 * @example
 * ```ts
 * import { MidnightOfferNoDebtError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferNoDebtError({ index: 0, marketId: `0x${"00".repeat(32)}` });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferNoDebtError extends Error {
  /** Creates a no-debt error. */
  public constructor(params: {
    readonly index: number;
    readonly marketId: Hex;
  }) {
    super(
      `Midnight reduce-only buy offer "${params.index}" for market "${params.marketId}" has no maker debt to repay. Use a market where the maker has debt.`,
    );
    this.index = params.index;
    this.marketId = params.marketId;
    this.name = "MidnightOfferNoDebtError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Midnight market identifier. */
  public readonly marketId: Hex;
}

/** Thrown when a reduce-only sell offer has no credit to withdraw.
 *
 * @throws {MidnightOfferNoCreditError} when a reduce-only sell has no maker credit.
 *
 * @example
 * ```ts
 * import { MidnightOfferNoCreditError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferNoCreditError({ index: 0, marketId: `0x${"00".repeat(32)}` });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferNoCreditError extends Error {
  /** Creates a no-credit error. */
  public constructor(params: {
    readonly index: number;
    readonly marketId: Hex;
  }) {
    super(
      `Midnight reduce-only sell offer "${params.index}" for market "${params.marketId}" has no maker credit to withdraw. Use a market where the maker has credit.`,
    );
    this.index = params.index;
    this.marketId = params.marketId;
    this.name = "MidnightOfferNoCreditError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Midnight market identifier. */
  public readonly marketId: Hex;
}

/** Thrown when an uncreated market's maturity is more than 100 years after its latest possible
 * market creation time.
 *
 * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity exceeds the
 *   latest possible market creation time by more than 100 years.
 *
 * @example
 * ```ts
 * import { MidnightMarketMaturityTooFarError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightMarketMaturityTooFarError({ index: 0, maturity: 1_000n, maxMaturity: 500n });
 * console.log(error.message);
 * ```
 */
export class MidnightMarketMaturityTooFarError extends Error {
  /** Creates a maturity-range error. */
  public constructor(params: {
    readonly index: number;
    readonly maturity: bigint;
    readonly maxMaturity: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" market maturity "${params.maturity}" exceeds maximum "${params.maxMaturity}" for an uncreated market. Choose a maturity at or before "${params.maxMaturity}".`,
    );
    this.index = params.index;
    this.maturity = params.maturity;
    this.maxMaturity = params.maxMaturity;
    this.name = "MidnightMarketMaturityTooFarError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Market maturity timestamp. */
  public readonly maturity: bigint;
  /** Latest allowed maturity timestamp. */
  public readonly maxMaturity: bigint;
}

/** Thrown when an uncreated market uses a disabled LLTV.
 *
 * @throws {MidnightMarketLltvNotEnabledError} when the market LLTV is disabled.
 *
 * @example
 * ```ts
 * import { MidnightMarketLltvNotEnabledError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightMarketLltvNotEnabledError({ index: 0, lltv: 1n });
 * console.log(error.message);
 * ```
 */
export class MidnightMarketLltvNotEnabledError extends Error {
  /** Creates a disabled-LLTV error. */
  public constructor(params: {
    readonly index: number;
    readonly lltv: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" uses disabled LLTV "${params.lltv}" for an uncreated market. Choose an enabled LLTV.`,
    );
    this.index = params.index;
    this.lltv = params.lltv;
    this.name = "MidnightMarketLltvNotEnabledError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Disabled LLTV value. */
  public readonly lltv: bigint;
}

/** Thrown when an uncreated market uses a disabled liquidation cursor.
 *
 * @throws {MidnightMarketLiquidationCursorNotEnabledError} when the liquidation cursor is disabled.
 *
 * @example
 * ```ts
 * import { MidnightMarketLiquidationCursorNotEnabledError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightMarketLiquidationCursorNotEnabledError({ index: 0, liquidationCursor: 1n });
 * console.log(error.message);
 * ```
 */
export class MidnightMarketLiquidationCursorNotEnabledError extends Error {
  /** Creates a disabled-cursor error. */
  public constructor(params: {
    readonly index: number;
    readonly liquidationCursor: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" uses disabled liquidation cursor "${params.liquidationCursor}" for an uncreated market. Choose an enabled cursor.`,
    );
    this.index = params.index;
    this.liquidationCursor = params.liquidationCursor;
    this.name = "MidnightMarketLiquidationCursorNotEnabledError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Disabled liquidation cursor value. */
  public readonly liquidationCursor: bigint;
}

/** Thrown when an uncreated market's oracle address has no contract code.
 *
 * @throws {MidnightMarketOracleWithoutCodeError} when the oracle has no code.
 *
 * @example
 * ```ts
 * import { MidnightMarketOracleWithoutCodeError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightMarketOracleWithoutCodeError({ index: 0, oracle: "0x0000000000000000000000000000000000000001" });
 * console.log(error.message);
 * ```
 */
export class MidnightMarketOracleWithoutCodeError extends Error {
  /** Creates an oracle-code error. */
  public constructor(params: {
    readonly index: number;
    readonly oracle: Address;
  }) {
    super(
      `Midnight offer "${params.index}" uses oracle "${params.oracle}" without contract code for an uncreated market. Choose a deployed oracle.`,
    );
    this.index = params.index;
    this.oracle = params.oracle;
    this.name = "MidnightMarketOracleWithoutCodeError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Oracle address without code. */
  public readonly oracle: Address;
}

/** Thrown when a maker offer uses a callback unsupported by the selected flow.
 *
 * @throws {MidnightOfferCallbackNotSupportedError} when the callback is nonzero.
 *
 * @example
 * ```ts
 * import { MidnightOfferCallbackNotSupportedError } from "@morpho-org/morpho-sdk";
 * const error = new MidnightOfferCallbackNotSupportedError({ index: 0, callback: "0x0000000000000000000000000000000000000001" });
 * console.log(error.message);
 * ```
 */
export class MidnightOfferCallbackNotSupportedError extends Error {
  /** Creates an unsupported-callback error. */
  public constructor(params: {
    readonly index: number;
    readonly callback: Address;
  }) {
    super(
      `Midnight offer "${params.index}" uses callback "${params.callback}", which this maker flow cannot execute. Use the zero address or a supported callback flow.`,
    );
    this.index = params.index;
    this.callback = params.callback;
    this.name = "MidnightOfferCallbackNotSupportedError";
  }

  /** Offer index in its tree. */
  public readonly index: number;
  /** Unsupported callback address. */
  public readonly callback: Address;
}
