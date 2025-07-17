import type { ParaswapOffsets } from "../operations";

export const augustusV6_2Address = "0x6A000F20005980200259B80c5102003040001068";

// Filled with ABI at https://etherscan.io/address/0x6A000F20005980200259B80c5102003040001068#code.
export const paraswapContractMethodOffsets = {
  swapExactAmountIn: {
    exactAmount: 4n + 32n * 3n,
    limitAmount: 4n + 32n * 4n,
    quotedAmount: 4n + 32n * 5n,
  },
  swapExactAmountInOnBalancerV2: {
    exactAmount: 4n + 32n * 0n,
    limitAmount: 4n + 32n * 1n,
    quotedAmount: 4n + 32n * 2n,
  },
  swapExactAmountInOnCurveV1: {
    exactAmount: 4n + 32n * 4n,
    limitAmount: 4n + 32n * 5n,
    quotedAmount: 4n + 32n * 6n,
  },
  swapExactAmountInOnCurveV2: {
    exactAmount: 4n + 32n * 6n,
    limitAmount: 4n + 32n * 7n,
    quotedAmount: 4n + 32n * 8n,
  },
  swapExactAmountInOnUniswapV2: {
    exactAmount: 4n + 32n * 2n,
    limitAmount: 4n + 32n * 3n,
    quotedAmount: 4n + 32n * 4n,
  },
  swapExactAmountInOnUniswapV3: {
    exactAmount: 4n + 32n * 2n,
    limitAmount: 4n + 32n * 3n,
    quotedAmount: 4n + 32n * 4n,
  },
  swapExactAmountOut: {
    exactAmount: 4n + 32n * 4n,
    limitAmount: 4n + 32n * 3n,
    quotedAmount: 4n + 32n * 5n,
  },
  swapExactAmountOutOnBalancerV2: {
    exactAmount: 4n + 32n * 1n,
    limitAmount: 4n + 32n * 0n,
    quotedAmount: 4n + 32n * 2n,
  },
  swapExactAmountOutOnUniswapV2: {
    exactAmount: 4n + 32n * 3n,
    limitAmount: 4n + 32n * 2n,
    quotedAmount: 4n + 32n * 4n,
  },
  swapExactAmountOutOnUniswapV3: {
    exactAmount: 4n + 32n * 3n,
    limitAmount: 4n + 32n * 2n,
    quotedAmount: 4n + 32n * 4n,
  },
} as const satisfies Record<string, ParaswapOffsets>;

export const getParaswapContractMethodOffsets = (contractMethod: string) => {
  const offsets =
    paraswapContractMethodOffsets[
      contractMethod as keyof typeof paraswapContractMethodOffsets
    ];

  if (offsets == null)
    throw Error(`unsupported Paraswap contract method "${contractMethod}"`);

  return offsets;
};
