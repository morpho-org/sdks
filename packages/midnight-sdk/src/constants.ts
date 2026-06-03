/**
 * Midnight WAD scale.
 *
 * @example
 * ```ts
 * import { WAD } from "@morpho-org/midnight-sdk";
 *
 * console.log(WAD === 10n ** 18n);
 * ```
 */
export const WAD = 1_000000000000000000n;

/**
 * Midnight oracle price scale.
 *
 * @example
 * ```ts
 * import { ORACLE_PRICE_SCALE } from "@morpho-org/midnight-sdk";
 *
 * console.log(ORACLE_PRICE_SCALE);
 * ```
 */
export const ORACLE_PRICE_SCALE = 1_000000000000000000000000000000000000n;

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
 * Maximum Midnight tick.
 *
 * @example
 * ```ts
 * import { MAX_TICK } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_TICK);
 * ```
 */
export const MAX_TICK = 5820n;

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
export const PRICE_ROUNDING_STEP = 1_000000000000n;

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
 * Permit2 deployment used by MidnightBundles.
 *
 * @example
 * ```ts
 * import { PERMIT2_ADDRESS } from "@morpho-org/midnight-sdk";
 *
 * console.log(PERMIT2_ADDRESS);
 * ```
 */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/**
 * Allowed LLTV tiers copied from Midnight ConstantsLib.
 *
 * @example
 * ```ts
 * import { ALLOWED_LLTVS } from "@morpho-org/midnight-sdk";
 *
 * console.log(ALLOWED_LLTVS.includes(770000000000000000n));
 * ```
 */
export const ALLOWED_LLTVS = [
  385000000000000000n,
  625000000000000000n,
  770000000000000000n,
  860000000000000000n,
  915000000000000000n,
  945000000000000000n,
  965000000000000000n,
  980000000000000000n,
  WAD,
] as const;

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
 * Low liquidation cursor used by default `maxLif` helpers.
 *
 * @example
 * ```ts
 * import { LIQUIDATION_CURSOR_LOW } from "@morpho-org/midnight-sdk";
 *
 * console.log(LIQUIDATION_CURSOR_LOW);
 * ```
 */
export const LIQUIDATION_CURSOR_LOW = 250000000000000000n;

/**
 * High liquidation cursor from Midnight ConstantsLib.
 *
 * @example
 * ```ts
 * import { LIQUIDATION_CURSOR_HIGH } from "@morpho-org/midnight-sdk";
 *
 * console.log(LIQUIDATION_CURSOR_HIGH);
 * ```
 */
export const LIQUIDATION_CURSOR_HIGH = 500000000000000000n;

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
  "0xaf44a88eb50ebdbbebd980e5a23045c44f61ece5f80ab708a1bbe8718102e6af";

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
  "0x358117e98511cc3df97175dca58053b06675b43ad090b0553f8a1eff008b6e2e";

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
  "0x980a4cfc9766df84667f316d76e10cefc8caf04fb4cd4a9fca00a8e7b34f619c";

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

/**
 * Source commit used for the pinned Midnight interface and library shapes.
 *
 * @example
 * ```ts
 * import { MIDNIGHT_SOURCE_COMMIT } from "@morpho-org/midnight-sdk";
 *
 * console.log(MIDNIGHT_SOURCE_COMMIT);
 * ```
 */
export const MIDNIGHT_SOURCE_COMMIT =
  "a7c6da7e70cb216982f6c5d20b46f40b943e67e4";
