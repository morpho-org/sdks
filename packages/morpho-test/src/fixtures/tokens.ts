import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

export const withSimplePermit: Record<number, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    addressesRegistry[ChainId.EthMainnet].wstEth,
    addressesRegistry[ChainId.EthMainnet].sDai,
    addressesRegistry[ChainId.EthMainnet].osEth,
    addressesRegistry[ChainId.EthMainnet].usdc,
    addressesRegistry[ChainId.EthMainnet].dai,
  ]),
  [ChainId.BaseMainnet]: new Set([
    addressesRegistry[ChainId.BaseMainnet].usdc,
    addressesRegistry[ChainId.BaseMainnet].verUsdc,
  ]),
};
