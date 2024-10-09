import { toBigInt } from "ethers";

import { retryPromiseLinearBackoff } from "@morpho-org/morpho-ts";
import { OneInch } from "./1inch.js";
import { Paraswap } from "./paraswap.js";
import type { SwapParams, SwapResponse } from "./types.js";

export * from "./1inch.js";
export * from "./paraswap.js";
export * from "./types.js";

export async function fetchBestSwap(
  swapParams: SwapParams,
): Promise<SwapResponse | null> {
  const results = await Promise.allSettled([
    retryPromiseLinearBackoff(() => OneInch.fetchSwap(swapParams), {
      timeout: 200,
      onError: (error) => {
        if (error instanceof Error) {
          if (error.message === "Not Found") return true;
        }
        return false;
      },
    }),
    retryPromiseLinearBackoff(() => Paraswap.fetchSwap(swapParams), {
      timeout: 200,
      onError: (error) => {
        if (error instanceof Error) {
          if (
            error.message === "Not Found" ||
            error.message.startsWith("invalid json response body")
          )
            return true;
        }
        return false;
      },
    }),
  ]);

  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<SwapResponse> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  if (successfulResults.length === 0) {
    return null;
  }

  // Compare the results and return the best one
  return successfulResults.reduce((best, current) => {
    const bestDstAmount = toBigInt(best.dstAmount);
    const currentDstAmount = toBigInt(current.dstAmount);

    if (currentDstAmount > bestDstAmount) {
      return current;
    }
    return best;
  });
}
