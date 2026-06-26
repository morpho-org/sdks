/**
 * Centibip scale used by settlement fees.
 *
 * @example
 * ```ts
 * import { CBP } from "@morpho-org/midnight-sdk";
 *
 * console.log(CBP);
 * ```
 */
export const CBP = 1_000000000000n;

/**
 * Settlement-fee time-to-maturity breakpoints in seconds.
 *
 * Midnight linearly interpolates each market's seven settlement-fee cbp
 * buckets across these breakpoints.
 *
 * @example
 * ```ts
 * import { SETTLEMENT_FEE_BREAKPOINTS } from "@morpho-org/midnight-sdk";
 *
 * console.log(SETTLEMENT_FEE_BREAKPOINTS[1]);
 * ```
 */
export const SETTLEMENT_FEE_BREAKPOINTS = [
  0n,
  1n * 24n * 60n * 60n,
  7n * 24n * 60n * 60n,
  30n * 24n * 60n * 60n,
  90n * 24n * 60n * 60n,
  180n * 24n * 60n * 60n,
  360n * 24n * 60n * 60n,
] as const;

/**
 * Maximum Midnight tick.
 *
 * @example
 * ```ts
 * import { MAX_TICK } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_TICK);
 * ```
 */
export const MAX_TICK = 6744n;

/**
 * WAD price quantum used by Midnight tick prices.
 *
 * @example
 * ```ts
 * import { PRICE_ROUNDING_STEP } from "@morpho-org/midnight-sdk";
 *
 * console.log(PRICE_ROUNDING_STEP);
 * ```
 */
export const PRICE_ROUNDING_STEP = 100_000000000n;

/**
 * Default Midnight tick spacing.
 *
 * @example
 * ```ts
 * import { DEFAULT_TICK_SPACING } from "@morpho-org/midnight-sdk";
 *
 * console.log(DEFAULT_TICK_SPACING);
 * ```
 */
export const DEFAULT_TICK_SPACING = 4n;

/**
 * Maximum collateral entries in a Midnight market.
 *
 * @example
 * ```ts
 * import { MAX_COLLATERALS } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_COLLATERALS);
 * ```
 */
export const MAX_COLLATERALS = 128n;

/**
 * Maximum active collateral entries per borrower.
 *
 * @example
 * ```ts
 * import { MAX_COLLATERALS_PER_BORROWER } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_COLLATERALS_PER_BORROWER);
 * ```
 */
export const MAX_COLLATERALS_PER_BORROWER = 16n;

/**
 * Maximum settlement-fee values by Midnight fee index.
 *
 * @example
 * ```ts
 * import { MAX_SETTLEMENT_FEES } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_SETTLEMENT_FEES[0]);
 * ```
 */
export const MAX_SETTLEMENT_FEES = [
  14000000000000n,
  14000000000000n,
  98000000000000n,
  417000000000000n,
  1250000000000000n,
  2500000000000000n,
  5000000000000000n,
] as const;

/**
 * Maximum continuous fee per second.
 *
 * @example
 * ```ts
 * import { MAX_CONTINUOUS_FEE } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_CONTINUOUS_FEE);
 * ```
 */
export const MAX_CONTINUOUS_FEE = 317097919n;

/**
 * Seconds after maturity over which post-maturity LIF reaches the computed
 * maximum liquidation incentive factor.
 *
 * @example
 * ```ts
 * import { TIME_TO_MAX_LIF } from "@morpho-org/midnight-sdk";
 *
 * console.log(TIME_TO_MAX_LIF);
 * ```
 */
export const TIME_TO_MAX_LIF = 60n * 60n;

/**
 * HashLib collateral params typehash.
 *
 * @example
 * ```ts
 * import { COLLATERAL_PARAMS_TYPEHASH } from "@morpho-org/midnight-sdk";
 *
 * console.log(COLLATERAL_PARAMS_TYPEHASH);
 * ```
 */
export const COLLATERAL_PARAMS_TYPEHASH =
  "0x39ed3f928d24fd00574b1a02aba9c2483abcf5d9a3a366118c9a5aa29885b841";

/**
 * HashLib market typehash.
 *
 * @example
 * ```ts
 * import { MARKET_TYPEHASH } from "@morpho-org/midnight-sdk";
 *
 * console.log(MARKET_TYPEHASH);
 * ```
 */
export const MARKET_TYPEHASH =
  "0x510b3862f3816a109c9340b76972e8a30984246be06e034ae12ed2934220391a";

/**
 * HashLib offer typehash.
 *
 * @example
 * ```ts
 * import { OFFER_TYPEHASH } from "@morpho-org/midnight-sdk";
 *
 * console.log(OFFER_TYPEHASH);
 * ```
 */
export const OFFER_TYPEHASH =
  "0xa316348449d1749c733fbf0befac14d04d6ed14ea8993956f5eb405e6191bb81";

/**
 * EcrecoverRatifier EIP-712 domain typehash.
 *
 * @example
 * ```ts
 * import { EIP712_DOMAIN_TYPEHASH } from "@morpho-org/midnight-sdk";
 *
 * console.log(EIP712_DOMAIN_TYPEHASH);
 * ```
 */
export const EIP712_DOMAIN_TYPEHASH =
  "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
