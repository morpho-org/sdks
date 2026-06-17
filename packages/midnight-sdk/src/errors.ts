/**
 * Thrown when an order conversion receives no executable quote entries.
 *
 * @example
 * ```ts
 * import { NoMatchingOffersError } from "@morpho-org/midnight-sdk";
 *
 * const error = new NoMatchingOffersError();
 * console.log(error.message);
 * ```
 */
export class NoMatchingOffersError extends Error {
  public constructor() {
    super(
      "No matching Midnight offers were provided. Refresh the quote and retry.",
    );
    this.name = "NoMatchingOffersError";
  }
}

/**
 * Thrown when a Midnight offer group violates protocol-level group mechanics.
 *
 * @example
 * ```ts
 * import { InvalidOfferGroupError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidOfferGroupError("All offers in a group must use the same maker.");
 * ```
 */
export class InvalidOfferGroupError extends Error {
  public constructor(reason: string) {
    super(`Invalid Midnight offer group. ${reason}`);
    this.name = "InvalidOfferGroupError";
  }
}

/**
 * Thrown when a quote contains an offer side that does not match the requested route.
 *
 * @example
 * ```ts
 * import { UnexpectedOfferSideError } from "@morpho-org/midnight-sdk";
 *
 * const error = new UnexpectedOfferSideError("buy", "sell");
 * console.log(error.name);
 * ```
 */
export class UnexpectedOfferSideError extends Error {
  public constructor(expected: "buy" | "sell", actual: "buy" | "sell") {
    super(`Expected "${expected}" Midnight offers, got "${actual}".`);
    this.name = "UnexpectedOfferSideError";
  }
}

/**
 * Thrown when a bundle helper receives takes from different markets.
 *
 * @example
 * ```ts
 * import { InconsistentMarketError } from "@morpho-org/midnight-sdk";
 *
 * throw new InconsistentMarketError();
 * ```
 */
export class InconsistentMarketError extends Error {
  public constructor() {
    super("All Midnight takes must reference the same market.");
    this.name = "InconsistentMarketError";
  }
}

/**
 * Thrown when a tick exceeds the deployed TickLib range.
 *
 * @example
 * ```ts
 * import { TickOutOfRangeError } from "@morpho-org/midnight-sdk";
 *
 * const error = new TickOutOfRangeError(6000n, 5820n);
 * console.log(error.message);
 * ```
 */
export class TickOutOfRangeError extends Error {
  public constructor(tick: bigint, maxTick: bigint) {
    super(`Tick "${tick}" exceeds maximum tick "${maxTick}".`);
    this.name = "TickOutOfRangeError";
  }
}

/**
 * Thrown when a price is above the maximum WAD price accepted by TickLib.
 *
 * @example
 * ```ts
 * import { PriceGreaterThanOneError } from "@morpho-org/midnight-sdk";
 *
 * throw new PriceGreaterThanOneError(2n * 10n ** 18n);
 * ```
 */
export class PriceGreaterThanOneError extends Error {
  public constructor(price: bigint) {
    super(`Price "${price}" is greater than WAD.`);
    this.name = "PriceGreaterThanOneError";
  }
}

/**
 * Thrown when tick spacing is invalid or a tick is not aligned to it.
 *
 * @example
 * ```ts
 * import { InvalidTickSpacingError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidTickSpacingError(5n, 4n);
 * ```
 */
export class InvalidTickSpacingError extends Error {
  public constructor(spacing: bigint);
  public constructor(tick: bigint, spacing: bigint);
  public constructor(tickOrSpacing: bigint, spacing?: bigint) {
    super(
      spacing == null
        ? `Tick spacing "${tickOrSpacing}" is invalid. Use a positive spacing that divides the maximum tick.`
        : `Tick "${tickOrSpacing}" is not aligned to spacing "${spacing}". Use a tick aligned to the market spacing.`,
    );
    this.name = "InvalidTickSpacingError";
  }
}

/**
 * Thrown when a buy offer's settlement fee exceeds its tick price.
 *
 * @example
 * ```ts
 * import { SettlementFeeExceedsPriceError } from "@morpho-org/midnight-sdk";
 *
 * throw new SettlementFeeExceedsPriceError(10n, 9n);
 * ```
 */
export class SettlementFeeExceedsPriceError extends Error {
  public constructor(settlementFee: bigint, price: bigint) {
    super(
      `Settlement fee "${settlementFee}" exceeds offer price "${price}". Use a lower fee or a higher tick.`,
    );
    this.name = "SettlementFeeExceedsPriceError";
  }
}

/**
 * Thrown when a local position accrual is requested for an impossible timestamp.
 *
 * @example
 * ```ts
 * import { InvalidPositionAccrualTimestampError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidPositionAccrualTimestampError(1n, 2n);
 * ```
 */
export class InvalidPositionAccrualTimestampError extends Error {
  public constructor(timestamp: bigint, lastAccrual: bigint) {
    super(
      `Position accrual timestamp "${timestamp}" is before last accrual "${lastAccrual}". Use a timestamp greater than or equal to last accrual.`,
    );
    this.name = "InvalidPositionAccrualTimestampError";
  }
}

/**
 * Thrown when a local position accrual sees a market loss factor older than the position.
 *
 * @example
 * ```ts
 * import { InvalidPositionLossFactorError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidPositionLossFactorError(1n, 2n);
 * ```
 */
export class InvalidPositionLossFactorError extends Error {
  public constructor(marketLossFactor: bigint, positionLossFactor: bigint) {
    super(
      `Market loss factor "${marketLossFactor}" is below position loss factor "${positionLossFactor}". Fetch a consistent market and position at the same block.`,
    );
    this.name = "InvalidPositionLossFactorError";
  }
}

/**
 * Thrown when local position accrual inputs violate Midnight accounting invariants.
 *
 * @example
 * ```ts
 * import { InvalidPositionAccrualStateError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidPositionAccrualStateError("Pending fee exceeds credit.");
 * ```
 */
export class InvalidPositionAccrualStateError extends Error {
  public constructor(reason: string) {
    super(`Invalid Midnight position accrual state. ${reason}`);
    this.name = "InvalidPositionAccrualStateError";
  }
}

/**
 * Thrown when an offer builder receives a parameter that cannot satisfy Midnight protocol rules.
 *
 * @example
 * ```ts
 * import { InvalidOfferParameterError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidOfferParameterError({ parameter: "tick", value: 5821n });
 * ```
 * @param params - Invalid parameter descriptor.
 */
export class InvalidOfferParameterError extends Error {
  /** Invalid offer parameter name. */
  public readonly parameter: string;

  /** Invalid offer parameter value. */
  public readonly value: unknown;

  public constructor(params: {
    readonly parameter: string;
    readonly value: unknown;
    readonly instruction?: string;
    readonly cause?: unknown;
  }) {
    super(
      `Invalid offer parameter "${params.parameter}" with value "${String(params.value)}".${params.instruction == null ? "" : ` ${params.instruction}`}`,
      params.cause === undefined ? undefined : { cause: params.cause },
    );
    this.name = "InvalidOfferParameterError";
    this.parameter = params.parameter;
    this.value = params.value;
  }
}

/**
 * Thrown when a tree height exceeds the ratifier typehash table.
 *
 * @example
 * ```ts
 * import { InvalidTreeHeightError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidTreeHeightError(21);
 * ```
 */
export class InvalidTreeHeightError extends Error {
  public constructor(height: number) {
    super(`Tree height "${height}" is not supported.`);
    this.name = "InvalidTreeHeightError";
  }
}

/**
 * Thrown when a tree cannot be represented by the ratifiers.
 *
 * @example
 * ```ts
 * import { InvalidTreeError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidTreeError("Tree must not be empty.");
 * ```
 */
export class InvalidTreeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidTreeError";
  }
}

/**
 * Thrown when the Midnight API returns a non-2xx response.
 *
 * @example
 * ```ts
 * import { MidnightApiError } from "@morpho-org/midnight-sdk";
 *
 * throw new MidnightApiError({
 *   status: 400,
 *   code: "BAD_REQUEST",
 *   message: "Limit must be greater than 0.",
 *   details: [{ field: "limit", issue: "Limit must be greater than 0." }],
 *   requestId: "req-123",
 * });
 * ```
 */
export class MidnightApiError extends Error {
  /** HTTP response status from the API. */
  public readonly status: number;
  /** API error code, when the response body includes one. */
  public readonly code?: string;
  /** API error details, when the response body includes them. */
  public readonly details?: unknown;
  /** API request id, when the response body includes one. */
  public readonly requestId?: string;

  public constructor(params: {
    readonly status: number;
    readonly code?: string;
    readonly message?: string;
    readonly details?: unknown;
    readonly requestId?: string;
    readonly cause?: unknown;
  }) {
    super(
      params.message ??
        `Midnight API request failed with HTTP status "${params.status}".`,
      params.cause === undefined ? undefined : { cause: params.cause },
    );
    this.name = "MidnightApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
  }
}

/**
 * Thrown when the Midnight API returns a malformed successful response.
 *
 * @example
 * ```ts
 * import { InvalidMidnightApiResponseError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidMidnightApiResponseError("API response is missing data.");
 * ```
 */
export class InvalidMidnightApiResponseError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidMidnightApiResponseError";
  }
}
