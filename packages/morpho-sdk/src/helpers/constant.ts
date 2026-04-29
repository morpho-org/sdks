import { MathLib } from "@morpho-org/blue-sdk";

/** Maximum slippage tolerance: 10% */
export const MAX_SLIPPAGE_TOLERANCE = MathLib.WAD / 10n;

/** Default LLTV buffer: 0.5% below LLTV. Prevents instant liquidation on new positions. */
export const DEFAULT_LLTV_BUFFER = MathLib.WAD / 200n;

/** Maximum absolute share price cap (100 RAY). Prevents absurd maxSharePrice values in repay. */
export const MAX_ABSOLUTE_SHARE_PRICE = 100n * MathLib.RAY;
