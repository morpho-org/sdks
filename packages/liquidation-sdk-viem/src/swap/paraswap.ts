import { SwapSide, constructSimpleSDK } from "@paraswap/sdk";

import type { Address, Hex } from "viem";
import type { SwapParams, SwapResponse } from "./types.js";

export namespace Paraswap {
  export const API_URL = "https://api.paraswap.io";

  export async function fetchSwap(
    swapParams: SwapParams,
  ): Promise<SwapResponse> {
    const paraSwap = constructSimpleSDK({
      chainId: Number(swapParams.chainId),
      fetch: fetch,
    });

    const priceRoute = await paraSwap.swap.getRate({
      srcToken: swapParams.src,
      destToken: swapParams.dst,
      amount: swapParams.amount.toString(),
      userAddress: swapParams.from,
      side: SwapSide.SELL,
    });

    const calldata = await paraSwap.swap.buildTx({
      srcToken: swapParams.src,
      destToken: swapParams.dst,
      srcAmount: swapParams.amount.toString(),
      userAddress: swapParams.from,
      priceRoute: priceRoute,
      slippage: Number(swapParams.slippage.toString(16)),
    });

    return {
      dstAmount: priceRoute.destAmount,
      srcToken: {
        address: swapParams.src,
        decimals: priceRoute.srcDecimals,
        symbol: "",
        name: "",
        logoURI: "",
      },
      dstToken: {
        address: swapParams.dst,
        decimals: priceRoute.destDecimals,
        symbol: "",
        name: "",
        logoURI: "",
      },
      tx: {
        from: calldata.from as Address,
        to: calldata.to as Address,
        data: calldata.data as Hex,
        value: calldata.value,
        gasPrice: calldata.gasPrice,
        gas: Number(calldata.gas),
      },
      protocols: [],
    };
  }
}
