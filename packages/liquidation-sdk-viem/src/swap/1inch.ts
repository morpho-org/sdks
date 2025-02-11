import type { BigIntish } from "@morpho-org/blue-sdk";
import type { SwapParams, SwapResponse } from "./types.js";

export namespace OneInch {
  export const API_BASE_URL = "https://api.1inch.dev";

  export const getSwapApiPath = (chainId: BigIntish) =>
    `/swap/v6.0/${chainId}/swap`;
  export const getSwapApiUrl = (chainId: BigIntish) =>
    new URL(getSwapApiPath(chainId), API_BASE_URL).toString();

  export async function fetchSwap(
    swapParams: SwapParams,
    apiKey = process.env.ONE_INCH_SWAP_API_KEY,
  ) {
    const url = new URL(getSwapApiPath(swapParams.chainId), API_BASE_URL);
    Object.entries(swapParams).forEach(([key, value]) => {
      if (value == null) return;
      switch (key) {
        case "slippage":
          // 1inch expects slippage as a percentage, so we divide our value (in basis points) by 100
          url.searchParams.set(key, (Number(value) / 100).toString(10));
          break;
        default:
          url.searchParams.set(key, value);
      }
    });

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) throw Error(res.statusText);

    return (await res.json()) as SwapResponse;
  }
}
