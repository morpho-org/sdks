import type { MarketId } from "@morpho-org/blue-sdk";
import type { ReallocationComputeOptions } from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";

/**
 * Resolves the effective supply target utilization for a market: the per-market
 * override, then the global default override, then
 * {@link DEFAULT_SUPPLY_TARGET_UTILIZATION}.
 *
 * @param marketId - The market whose supply target utilization to resolve.
 * @param options - Reallocation options carrying the per-market and default overrides.
 * @returns The supply target utilization, scaled by WAD.
 */
export const getSupplyTargetUtilization = (
  marketId: MarketId,
  options?: ReallocationComputeOptions,
): bigint =>
  options?.supplyTargetUtilization?.[marketId] ??
  options?.defaultSupplyTargetUtilization ??
  DEFAULT_SUPPLY_TARGET_UTILIZATION;
