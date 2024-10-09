import type { BigNumberish } from "ethers";

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
  protocols: {}[];
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: number;
  };
}
