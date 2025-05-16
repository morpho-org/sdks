import type { ParaswapOffsets } from "../operations";

// Filled with ABI at https://etherscan.io/address/0x00000000fdac7708d0d360bddc1bc7d097f47439#code.
export const paraswapContractMethodOffsets = {
  swapExactAmountOut: {
    exactAmount: 4n + 32n * 4n,
    limitAmount: 4n + 32n * 3n,
    quotedAmount: 4n + 32n * 5n,
  },
  swapExactAmountIn: {
    exactAmount: 4n + 32n * 3n,
    limitAmount: 4n + 32n * 4n,
    quotedAmount: 4n + 32n * 5n,
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
  swapExactAmountOutOnBalancerV2: {
    exactAmount: 4n + 32n * 0n,
    limitAmount: 4n + 32n * 1n,
    quotedAmount: 4n + 32n * 2n,
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
