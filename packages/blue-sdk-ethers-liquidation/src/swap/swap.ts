import { BigNumberish, toBigInt } from "ethers";

import { retryPromiseLinearBackoff } from "@morpho-org/morpho-ts";
import { fetchOneInchSwap } from "./1inch";
import { fetchParaSwapSwap } from "./paraswap";

export interface SwapParams {
  chainId: BigNumberish;
  src: string;
  dst: string;
  amount: BigNumberish;
  from: string;
  slippage: BigNumberish;
  protocols?: string;
  fee?: BigNumberish;
  gasPrice?: BigNumberish;
  complexityLevel?: number;
  parts?: number;
  mainRouteParts?: number;
  gasLimit?: BigNumberish;
  includeTokensInfo?: boolean;
  includeProtocols?: boolean;
  includeGas?: boolean;
  connectorTokens?: string;
  excludedProtocols?: string;
  permit?: string;
  receiver?: string;
  referrer?: string;
  allowPartialFill?: boolean;
  disableEstimate?: boolean;
  usePermit2?: boolean;
}

export interface SwapToken {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  logoURI: string;
}

export interface SwapResponse {
  srcToken: SwapToken;
  dstToken: SwapToken;
  dstAmount: string;
  protocols: Array<any>;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: number;
  };
}

export async function fetchBestSwap(
  swapParams: SwapParams,
): Promise<SwapResponse | null> {
  const results = await Promise.allSettled([
    retryPromiseLinearBackoff(() => fetchOneInchSwap(swapParams), {
      timeout: 200,
      onError: (error) => {
        if (error instanceof Error) {
          if (error.message === "Not Found") return true;
        }
        return false;
      },
    }),
    retryPromiseLinearBackoff(() => fetchParaSwapSwap(swapParams), {
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
