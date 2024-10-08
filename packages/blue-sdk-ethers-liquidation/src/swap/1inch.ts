import { type BigNumberish, toBigInt } from "ethers";

import type { SwapParams, SwapResponse } from "./swap";

export const ONE_INCH_API_BASE_URL = "https://api.1inch.dev";

export const getOneInchSwapApiPath = (chainId: BigNumberish) =>
  `/swap/v6.0/${chainId}/swap`;
export const getOneInchSwapApiUrl = (chainId: BigNumberish) =>
  new URL(getOneInchSwapApiPath(chainId), ONE_INCH_API_BASE_URL).toString();

export async function fetchOneInchSwap(
  swapParams: SwapParams,
  apiKey = process.env.ONE_INCH_SWAP_API_KEY,
) {
  const url = new URL(
    getOneInchSwapApiPath(swapParams.chainId),
    ONE_INCH_API_BASE_URL,
  );
  url.searchParams.set("slippage", toBigInt(swapParams.slippage).toString(16));
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
  return res.json() as Promise<SwapResponse>;
}
