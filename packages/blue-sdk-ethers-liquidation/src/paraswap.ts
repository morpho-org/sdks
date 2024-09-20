import { SwapSide, constructSimpleSDK } from "@paraswap/sdk";

import { SwapParams, SwapResponse } from "./swap";

export const PARASWAP_API_URL = "https://api.paraswap.io";

export async function fetchParaSwapSwap(
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
      from: calldata.from,
      to: calldata.to,
      data: calldata.data,
      value: calldata.value,
      gasPrice: calldata.gasPrice,
      gas: Number(calldata.gas),
    },
    protocols: [],
  };
}
