import { ChainId, MathLib } from "@morpho-org/blue-sdk";
import { type Address, maxUint96 } from "viem";

/** Maximum slippage tolerance: 10% */
export const MAX_SLIPPAGE_TOLERANCE = MathLib.WAD / 10n;

/** Default LLTV buffer: 0.5% below LLTV. Prevents instant liquidation on new positions. */
export const DEFAULT_LLTV_BUFFER = MathLib.WAD / 200n;

/** Maximum absolute share price cap (100 RAY). Prevents absurd maxSharePrice values in repay. */
export const MAX_ABSOLUTE_SHARE_PRICE = 100n * MathLib.RAY;

/**
 * The default maximum utilization allowed to reach when withdrawing shared liquidity.
 */
export const DEFAULT_WITHDRAWAL_TARGET_UTILIZATION = 92_0000000000000000n;

/**
 * The default target utilization above which shared liquidity reallocations are triggered.
 */
export const DEFAULT_SUPPLY_TARGET_UTILIZATION = 90_5000000000000000n;

export const APPROVE_ONLY_ONCE_TOKENS: Partial<Record<number, Address[]>> = {
  [ChainId.EthMainnet]: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
  ],
};

export const MAX_TOKEN_APPROVALS: Partial<
  Record<number, Record<Address, bigint>>
> = {
  [ChainId.EthMainnet]: {
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": maxUint96, // UNI
    "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3": maxUint96, // ONDO
    "0xc00e94Cb662C3520282E6f5717214004A7f26888": maxUint96, // COMP
    "0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb": maxUint96, // FLUID
  },
};
