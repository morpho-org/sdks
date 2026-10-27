import type { MarketInput } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { isAddressEqual } from "viem";
import { MidnightMarketAddressMismatchError } from "../types/index.js";
import { validateChainId } from "./validate.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";

/**
 * Validates that a Midnight market belongs to the configured chain deployment.
 *
 * @throws {MidnightCalldataEncodingError} when `market.midnight` is not a 20-byte hex address.
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

  // Reject a malformed address before viem compares it.
  validateMidnightAddress("market.midnight", market.midnight);
  const expectedMidnight = getChainAddress(params.chainId, "midnight");
  if (!isAddressEqual(market.midnight, expectedMidnight)) {
    throw new MidnightMarketAddressMismatchError({
      expectedMidnight,
      actualMidnight: market.midnight,
    });
  }
};
