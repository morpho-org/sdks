import type { MarketInput } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { isAddressEqual } from "viem";
import { MidnightMarketAddressMismatchError } from "../types/index.js";
import { validateChainId } from "./validate.js";

/**
 * Validates that a Midnight market belongs to the configured chain deployment.
 *
 * @internal
 */
export const validateMidnightMarket = (params: {
  readonly market: MarketInput;
  readonly chainId: number;
}): void => {
  const market =
    "params" in params.market ? params.market.params : params.market;
  validateChainId(Number(market.chainId), params.chainId);

  const expectedMidnight = getChainAddress(params.chainId, "midnight");
  if (!isAddressEqual(market.midnight, expectedMidnight)) {
    throw new MidnightMarketAddressMismatchError({
      expectedMidnight,
      actualMidnight: market.midnight,
    });
  }
};
