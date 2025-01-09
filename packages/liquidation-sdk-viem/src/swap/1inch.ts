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
    log: boolean,
    apiKey = "D1fFYGfPv0v6DRmOKx8gwEGyex21evwV",
  ) {
    swapParams.slippage = 1;

    const url = new URL(getSwapApiPath(swapParams.chainId), API_BASE_URL);
    url.searchParams.set("slippage", BigInt(swapParams.slippage).toString(16));
    Object.entries(swapParams).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, value.toString());
      }
    });

    url.searchParams.set("origin", swapParams.from);

    if (log) console.log("1inch url", url);

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // if (log) console.log("1inch response", res);

    if (!res.ok) throw Error(res.statusText);

    return (await res.json()) as SwapResponse;
  }
}
