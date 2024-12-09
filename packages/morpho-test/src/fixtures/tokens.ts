import { ChainId, addresses } from "@morpho-org/blue-sdk";

export const withSimplePermit = {
  [ChainId.EthMainnet]: new Set([
    addresses[ChainId.EthMainnet].wstEth,
    addresses[ChainId.EthMainnet].sDai,
    addresses[ChainId.EthMainnet].osEth,
    addresses[ChainId.EthMainnet].usdc,
    addresses[ChainId.EthMainnet].dai,
  ]),
  [ChainId.BaseMainnet]: new Set([
    addresses[ChainId.BaseMainnet].usdc,
    addresses[ChainId.BaseMainnet].verUsdc,
  ]),
} as const;
