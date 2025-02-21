import { UnsupportedChainIdError } from "./errors.js";

export enum ChainId {
  EthMainnet = 1,
  BaseMainnet = 8453,
  ArbitrumMainnet = 42161,
  OptimismMainnet = 10,
}

export interface ChainMetadata {
  readonly name: string;
  readonly id: ChainId;
  readonly explorerUrl: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly identifier: string;
}

export namespace ChainUtils {
  export const toHexChainId = (chainId: ChainId) => {
    return `0x${chainId.toString(16)}`;
  };

  export const getExplorerUrl = (chainId: ChainId) => {
    return ChainUtils.CHAIN_METADATA[chainId].explorerUrl;
  };

  export const getExplorerAddressUrl = (chainId: ChainId, address: string) => {
    return `${getExplorerUrl(chainId)}/address/${address}`;
  };

  export const getExplorerTransactionUrl = (chainId: ChainId, tx: string) => {
    return `${getExplorerUrl(chainId)}/tx/${tx}`;
  };

  export function isSupported(chainId: number): chainId is ChainId {
    return Object.values(ChainId).includes(chainId);
  }

  export function parseSupportedChainId(candidate: unknown): ChainId {
    const chainId = Number.parseInt(candidate as string); // Force cast to string to silence TS because it works.

    if (!isSupported(chainId)) throw new UnsupportedChainIdError(chainId);

    return chainId;
  }

  export const CHAIN_METADATA: Record<ChainId, ChainMetadata> = {
    [ChainId.EthMainnet]: {
      name: "Ethereum",
      id: ChainId.EthMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      explorerUrl: "https://etherscan.io",
      identifier: "mainnet",
    },
    [ChainId.BaseMainnet]: {
      name: "Base",
      id: ChainId.BaseMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      explorerUrl: "https://basescan.org",
      identifier: "base",
    },
    [ChainId.ArbitrumMainnet]: {
      name: "Arbitrum Mainnet",
      id: ChainId.ArbitrumMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      explorerUrl: "https://arbiscan.io",
      identifier: "arbitrum",
    },
    [ChainId.OptimismMainnet]: {
      name: "Optimism Mainnet",
      id: ChainId.OptimismMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      explorerUrl: "https://optimistic.etherscan.io",
      identifier: "optimism",
    },
  };
}
