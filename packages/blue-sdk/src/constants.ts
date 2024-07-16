import { Time } from "@morpho-org/morpho-ts";

/**
 * The liquidation cursor used to calculate the liquidation incentive. Hardcoded to 30%.
 */
export const LIQUIDATION_CURSOR = 30_0000000000000000n;

/**
 * The maximum liquidation incentive factor. Hardcoded to 115%.
 */
export const MAX_LIQUIDATION_INCENTIVE_FACTOR = 1_150000000000000000n;

export const ORACLE_PRICE_OFFSET = 36;

/**
 * The scale of the oracle price. Hardcoded to 1e36.
 */
export const ORACLE_PRICE_SCALE = 1_000000000000000000000000000000000000n;

/**
 * The default slippage tolerance used in the SDK. Hardcoded to 0.03%.
 */
export const DEFAULT_SLIPPAGE_TOLERANCE = 3_00000000000000n;

/**
 * The default withdrawal target utilization used by the shared liquidity algorithm. Hardcoded to 92%.
 */
export const DEFAULT_WITHDRAWAL_TARGET_UTILIZATION = 92_0000000000000000n;

/**
 * The default supply target utilization used by the shared liquidity algorithm. Hardcoded to 90.5%.
 */
export const DEFAULT_SUPPLY_TARGET_UTILIZATION = 90_5000000000000000n;

/**
 * The number of seconds in a year.
 */
export const SECONDS_PER_YEAR = Time.s.from.y(1n);
