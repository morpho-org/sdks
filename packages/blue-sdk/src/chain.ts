import { UnsupportedChainIdError } from "./errors.js";

export enum ChainId {
  EthMainnet = 1,
  BaseMainnet = 8453,
  // EthGoerliTestnet = 5,
  // PolygonMainnet = 137,
  // MumbaiTestnet = 80001,
  // OptimismMainnet = 10,
  // BscMainnet = 56,
  // ArbitrumMainnet = 42161,
  // ArbitrumTestnet = 421611,
  // GnosisChain = 100,
  // FantomMainnet = 250,
  // FantomTestnet = 4002,
  // HarmonyMainnet = 128,
  // HarmonyTestnet = 1666600000,
  // BscTestnet = 97,
  // OptimismTestnet = 69,
  // EthRopstenTestnet = 3,
  // EthRinkebyTestnet = 4,
  // EthKovanTestnet = 42,
  // GnosisChainTestnet = 10200,
  // AvalancheMainnet = 43114,
  // AvalancheFujiTestnet = 43113,
  // MoonbaseAlphaTestnet = 1287,
  // BaseGoerliTestnet = 84531,
}

export interface ChainMetadata {
  readonly name: string;
  readonly id: ChainId;
  readonly defaultRpcUrl: string;
  readonly explorerUrl: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly isTestnet: boolean;
  readonly shortName: string;
  readonly identifier: string;
  readonly logoSrc: string;
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
    return BLUE_AVAILABLE_CHAINS.includes(chainId as ChainId);
  }

  export function parseSupportedChainId(candidate: unknown): ChainId {
    const chainId = Number.parseInt(candidate as string); // Force cast to string to silence TS because it works.

    if (!isSupported(chainId)) throw new UnsupportedChainIdError(chainId);

    return chainId;
  }

  export const BLUE_AVAILABLE_CHAINS: [ChainId, ...ChainId[]] = [
    ChainId.EthMainnet,
    ChainId.BaseMainnet,
  ];

  export const CHAIN_METADATA: Record<ChainId, ChainMetadata> = {
    [ChainId.EthMainnet]: {
      name: "Ethereum",
      id: ChainId.EthMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      defaultRpcUrl:
        "https://mainnet.infura.io/V3/84842078b09946638c03157f83405213",
      explorerUrl: "https://etherscan.io",
      isTestnet: false,
      shortName: "ETH",
      logoSrc: "https://cdn.morpho.org/assets/chains/eth.svg",
      identifier: "mainnet",
    },
    [ChainId.BaseMainnet]: {
      name: "Base",
      id: ChainId.BaseMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      defaultRpcUrl: "https://rpc.baseprotocol.org",
      explorerUrl: "https://basescan.org",
      isTestnet: false,
      shortName: "Base",
      logoSrc: "https://cdn.morpho.org/assets/chains/base.png",
      identifier: "base",
    },
    // [ChainId.EthGoerliTestnet]: {
    //   name: "Ethereum Goerli Testnet",
    //   id: ChainId.EthGoerliTestnet,
    //   nativeCurrency: { name: "Goerli Ether", symbol: "ETH", decimals: 18 },
    //   defaultRpcUrl:
    //     "https://goerli.infura.io/V3/84842078b09946638c03157f83405213",
    //   explorerUrl: "https://goerli.etherscan.io",
    //   isTestnet: true,
    //   shortName: "Goerli",
    //   logoSrc: "https://cdn.morpho.org/assets/chains/eth.svg",
    //   identifier: "goerli",
    // },
    // [ChainId.PolygonMainnet]: {
    //   name: "Polygon Mainnet",
    //   id: ChainId.PolygonMainnet,
    //   nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18n },
    //   defaultRpcUrl: "https://rpc-mainnet.maticvigil.com",
    //   explorerUrl: "https://polygonscan.com",
    //   isTestnet: false,
    //   shortName: "Polygon",
    // },
    // [ChainId.MumbaiTestnet]: {
    //   name: "Mumbai Testnet",
    //   id: ChainId.MumbaiTestnet,
    //   nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18n },
    //   defaultRpcUrl: "https://rpc-mumbai.maticvigil.com",
    //   explorerUrl: "https://mumbai.polygonscan.com",
    //   isTestnet: true,
    //   shortName: "Mumbai",
    // },

    /* see https://chainid.network/chains.json */

    // [ChainId.PolygonMainnet]: {
    //   name: "Polygon Mainnet",
    //   id: ChainId.PolygonMainnet,
    //   nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18n },
    //   defaultRpcUrl: "https://rpc-mainnet.maticvigil.com",
    //   explorerUrl: "https://polygonscan.com",
    //   isTestnet: false,
    //   shortName: "Polygon",
    // },
    // [ChainId.MumbaiTestnet]: {
    //   name: "Mumbai Testnet",
    //   id: ChainId.MumbaiTestnet,
    //   nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18n },
    //   defaultRpcUrl: "https://rpc-mumbai.maticvigil.com",
    //   explorerUrl: "https://mumbai.polygonscan.com",
    //   isTestnet: true,
    //   shortName: "Mumbai",
    // },
    // [ChainId.OptimismMainnet]: {
    //   name: "Optimism Mainnet",
    //   id: ChainId.OptimismMainnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl: "https://mainnet.optimism.io",
    //   explorerUrl: "https://optimistic.etherscan.io",
    //   isTestnet: false,
    // },
    // [ChainId.BscMainnet]: {
    //   name: "Binance Smart Chain Mainnet",
    //   id: ChainId.BscMainnet,
    //   baseCurrency: "BNB",
    //   defaultRpcUrl: "https://bsc-dataseed.binance.org",
    //   explorerUrl: "https://bscscan.com",
    //   isTestnet: false,
    // },
    // [ChainId.ArbitrumMainnet]: {
    //   name: "Arbitrum Mainnet",
    //   id: ChainId.ArbitrumMainnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl: "https://arb1.arbitrum.io/rpc",
    //   explorerUrl: "https://arbiscan.io",
    //   isTestnet: false,
    // },
    // [ChainId.ArbitrumTestnet]: {
    //   name: "Arbitrum Testnet",
    //   id: ChainId.ArbitrumTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl: "https://rinkeby.arbitrum.io/rpc",
    //   explorerUrl: "https://rinkeby-explorer.arbitrum.io",
    //   isTestnet: true,
    // },
    // [ChainId.GnosisChain]: {
    //   name: "Gnosis Chain",
    //   id: ChainId.GnosisChain,
    //   baseCurrency: "XDAI",
    //   defaultRpcUrl: "https://rpc.xdaichain.com",
    //   explorerUrl: "https://gnosis.blockscout.com",
    //   isTestnet: false,
    // },
    // [ChainId.FantomMainnet]: {
    //   name: "Fantom Mainnet",
    //   id: ChainId.FantomMainnet,
    //   baseCurrency: "FTM",
    //   defaultRpcUrl: "https://rpcapi.fantom.network",
    //   explorerUrl: "https://ftmscan.com",
    //   isTestnet: false,
    // },
    // [ChainId.FantomTestnet]: {
    //   name: "Fantom Testnet",
    //   id: ChainId.FantomTestnet,
    //   baseCurrency: "FTM",
    //   defaultRpcUrl: "https://rpc.testnet.fantom.network",
    //   explorerUrl: "https://explorer.testnet.fantom.network",
    //   isTestnet: true,
    // },
    // [ChainId.HarmonyMainnet]: {
    //   name: "Harmony Mainnet",
    //   id: ChainId.HarmonyMainnet,
    //   baseCurrency: "ONE",
    //   defaultRpcUrl: "https://api.harmony.one",
    //   explorerUrl: "https://explorer.harmony.one",
    //   isTestnet: false,
    // },
    // [ChainId.HarmonyTestnet]: {
    //   name: "Harmony Testnet",
    //   id: ChainId.HarmonyTestnet,
    //   baseCurrency: "ONE",
    //   defaultRpcUrl: "https://api.s0.b.hmny.io",
    //   explorerUrl: "https://explorer.testnet.harmony.one",
    //   isTestnet: true,
    // },
    // [ChainId.BscTestnet]: {
    //   name: "Binance Smart Chain Testnet",
    //   id: ChainId.BscTestnet,
    //   baseCurrency: "BNB",
    //   defaultRpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    //   explorerUrl: "https://testnet.bscscan.com",
    //   isTestnet: true,
    // },
    // [ChainId.OptimismTestnet]: {
    //   name: "Optimism Testnet",
    //   id: ChainId.OptimismTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl: "https://kovan.optimism.io",
    //   explorerUrl: "https://kovan-optimistic.etherscan.io",
    //   isTestnet: true,
    // },
    // [ChainId.EthRopstenTestnet]: {
    //   name: "Ethereum Ropsten Testnet",
    //   id: ChainId.EthRopstenTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl:
    //     "https://ropsten.infura.io/V4/84842078b09946638c03157f83405213",
    //   explorerUrl: "https://ropsten.etherscan.io",
    //   isTestnet: true,
    // },
    // [ChainId.EthRinkebyTestnet]: {
    //   name: "Ethereum Rinkeby Testnet",
    //   id: ChainId.EthRinkebyTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl:
    //     "https://rinkeby.infura.io/V4/84842078b09946638c03157f83405213",
    //   explorerUrl: "https://rinkeby.etherscan.io",
    //   isTestnet: true,
    // },
    // [ChainId.EthKovanTestnet]: {
    //   name: "Ethereum Kovan Testnet",
    //   id: ChainId.EthKovanTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl:
    //     "https://kovan.infura.io/V4/84842078b09946638c03157f83405213",
    //   explorerUrl: "https://kovan.etherscan.io",
    //   isTestnet: true,
    // },
    // [ChainId.BaseGoerliTestnet]: {
    //   name: "Base Goerli Testnet",
    //   id: ChainId.BaseGoerliTestnet,
    //   baseCurrency: "ETH",
    //   defaultRpcUrl: "https://rpc-goerli.baseprotocol.org",
    //   explorerUrl: "https://goerli.basescan.org",
    //   isTestnet: true,
    // },
    // [ChainId.GnosisChainTestnet]: {
    //   name: "Gnosis Chain Testnet",
    //   id: ChainId.GnosisChainTestnet,
    //   baseCurrency: "XDAI",
    //   defaultRpcUrl: "https://rpc.chiado.gnosis.gateway.fm",
    //   explorerUrl: "https://gnosis-chiado.blockscout.com/",
    //   isTestnet: true,
    // },
    // [ChainId.AvalancheMainnet]: {
    //   name: "Avalanche Mainnet",
    //   id: ChainId.AvalancheMainnet,
    //   baseCurrency: "AVAX",
    //   defaultRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    //   explorerUrl: "https://cchain.explorer.avax.network",
    //   isTestnet: false,
    // },
    // [ChainId.AvalancheFujiTestnet]: {
    //   name: "Avalanche Fuji Testnet",
    //   id: ChainId.AvalancheFujiTestnet,
    //   baseCurrency: "AVAX",
    //   defaultRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    //   explorerUrl: "https://cchain.explorer.avax-test.network",
    //   isTestnet: true,
    // },
    // [ChainId.MoonbaseAlphaTestnet]: {
    //   name: "Moonbase Alpha Testnet",
    //   id: ChainId.MoonbaseAlphaTestnet,
    //   baseCurrency: "DEV",
    //   defaultRpcUrl: "https://rpc.testnet.moonbeam.network",
    //   explorerUrl: "https://moonbase-blockscout.testnet.moonbeam.network",
    //   isTestnet: true,
    // },
  };
}
