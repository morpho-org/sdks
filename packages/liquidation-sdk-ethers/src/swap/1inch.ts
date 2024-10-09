import { type BigNumberish, toBigInt } from "ethers";

import type { SwapParams, SwapResponse } from "./types.js";

export namespace OneInch {
  export const API_BASE_URL = "https://api.1inch.dev";

  export const getSwapApiPath = (chainId: BigNumberish) =>
    `/swap/v6.0/${chainId}/swap`;
  export const getSwapApiUrl = (chainId: BigNumberish) =>
    new URL(getSwapApiPath(chainId), API_BASE_URL).toString();

  export async function fetchSwap(
    swapParams: SwapParams,
    apiKey = process.env.ONE_INCH_SWAP_API_KEY,
  ) {
    const url = new URL(getSwapApiPath(swapParams.chainId), API_BASE_URL);
    url.searchParams.set(
      "slippage",
      toBigInt(swapParams.slippage).toString(16),
    );
    Object.entries(swapParams).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, value.toString());
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
