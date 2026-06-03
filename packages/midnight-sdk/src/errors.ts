export { NegativeValueError } from "@morpho-org/morpho-ts";

import type { Address } from "viem";

/**
 * Thrown when a chain id has no pinned Midnight deployment entry.
 *
 * @example
 * ```ts
 * import { getMidnightAddresses, UnsupportedMidnightChainError } from "@morpho-org/midnight-sdk";
 *
 * try {
 *   getMidnightAddresses(1);
 * } catch (error) {
 *   console.log(error instanceof UnsupportedMidnightChainError);
 * }
 * ```
 */
export class UnsupportedMidnightChainError extends Error {
  public constructor(chainId: number) {
    super(`No Midnight deployment is registered for chain id "${chainId}".`);
    this.name = "UnsupportedMidnightChainError";
  }
}

/**
 * Thrown when a custom Midnight address registration is missing required entries.
 *
 * @example
 * ```ts
 * import { IncompleteMidnightAddressesError } from "@morpho-org/midnight-sdk";
 *
 * throw new IncompleteMidnightAddressesError(8453, ["midnight"]);
 * ```
 */
export class IncompleteMidnightAddressesError extends Error {
  public constructor(chainId: number, missingLabels: readonly string[]) {
    super(
      `Midnight addresses for chain id "${chainId}" are missing "${missingLabels.join('", "')}". Provide a complete deployment entry.`,
    );
    this.name = "IncompleteMidnightAddressesError";
  }
}

/**
 * Thrown when a custom Midnight address registration attempts to change an existing value.
 *
 * @example
 * ```ts
 * import { MidnightAddressAlreadyRegisteredError } from "@morpho-org/midnight-sdk";
 *
 * throw new MidnightAddressAlreadyRegisteredError({
 *   chainId: 8453,
 *   label: "midnight",
 *   registeredAddress: "0x0000000000000000000000000000000000000001",
 *   requestedAddress: "0x0000000000000000000000000000000000000002",
 * });
 * ```
 */
export class MidnightAddressAlreadyRegisteredError extends Error {
  public constructor({
    chainId,
    label,
    registeredAddress,
    requestedAddress,
  }: {
    chainId: number;
    label: string;
    registeredAddress: Address;
    requestedAddress: Address;
  }) {
    super(
      `Midnight address "${chainId}.${label}" is already registered as "${registeredAddress}", got "${requestedAddress}". Use the registered address or choose an unregistered chain id.`,
    );
    this.name = "MidnightAddressAlreadyRegisteredError";
  }
}

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
 * Thrown when an offer builder cannot resolve an offer group id.
 *
 * @example
 * ```ts
 * import { MissingOfferGroupError } from "@morpho-org/midnight-sdk";
 *
 * throw new MissingOfferGroupError();
 * ```
 */
export class MissingOfferGroupError extends Error {
  public constructor() {
    super(
      "Offer group must be provided or generated with an injected random byte source.",
    );
    this.name = "MissingOfferGroupError";
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
 * Thrown when a computation would divide by zero.
 *
 * @example
 * ```ts
 * import { DivisionByZeroError } from "@morpho-org/midnight-sdk";
 *
 * throw new DivisionByZeroError("price");
 * ```
 */
export class DivisionByZeroError extends Error {
  public constructor(field: string) {
    super(`${field} must be non-zero.`);
    this.name = "DivisionByZeroError";
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
 * Thrown when a settlement-fee index is outside the deployed fee table.
 *
 * @example
 * ```ts
 * import { InvalidSettlementFeeIndexError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidSettlementFeeIndexError(8);
 * ```
 */
export class InvalidSettlementFeeIndexError extends Error {
  public constructor(index: number) {
    super(`Settlement-fee index "${index}" is not supported.`);
    this.name = "InvalidSettlementFeeIndexError";
  }
}

/**
 * Thrown when an offer tree height exceeds the ratifier typehash table.
 *
 * @example
 * ```ts
 * import { InvalidOfferTreeHeightError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidOfferTreeHeightError(21);
 * ```
 */
export class InvalidOfferTreeHeightError extends Error {
  public constructor(height: number) {
    super(`Offer tree height "${height}" is not supported.`);
    this.name = "InvalidOfferTreeHeightError";
  }
}

/**
 * Thrown when an offer tree payload cannot be represented by the ratifiers.
 *
 * @example
 * ```ts
 * import { InvalidOfferPayloadError } from "@morpho-org/midnight-sdk";
 *
 * throw new InvalidOfferPayloadError("Offer payload must not be empty.");
 * ```
 */
export class InvalidOfferPayloadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidOfferPayloadError";
  }
}

/**
 * Thrown when an injected offer-payload validator rejects a payload.
 *
 * @example
 * ```ts
 * import { PayloadValidationFailedError } from "@morpho-org/midnight-sdk";
 *
 * throw new PayloadValidationFailedError("Router rejected payload.");
 * ```
 */
export class PayloadValidationFailedError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PayloadValidationFailedError";
  }
}
