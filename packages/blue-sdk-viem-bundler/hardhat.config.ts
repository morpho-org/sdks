import "dotenv/config";
import "hardhat-deal";
import "hardhat-tracer";
import { HardhatUserConfig } from "hardhat/config";
import { HardhatNetworkUserConfig } from "hardhat/types";

import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

const hardhatNetworkConfigs: Record<string, HardhatNetworkUserConfig> = {
  ethereum: {
    chainId: 1,
    forking: {
      url: process.env.MAINNET_RPC_URL!,
      blockNumber: 19_750_000,
    },
  },
  base: {
    chainId: 8453,
    forking: {
      url: process.env.BASE_RPC_URL!,
      blockNumber: 16_260_000,
    },
  },
};

const network = process.env.NETWORK || "ethereum";
const hardhatNetworkConfig = hardhatNetworkConfigs[network];
if (!hardhatNetworkConfig) throw Error(`invalid network: ${network}`);
if (!hardhatNetworkConfig.forking?.url)
  throw Error(`no RPC url provided for network: ${network}`);

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
      allowBlocksWithSameTimestamp: true,
      mining: {
        mempool: {
          order: "fifo",
        },
      },
      ...hardhatNetworkConfig,
    },
  },
  paths: {
    tests: "./tests/e2e/",
    cache: "./cache",
  },
  mocha: {
    timeout: 300000,
    reporterOptions: {
      maxDiffSize: 2 ** 16,
    },
    fgrep: network,
  },
  tracer: {
    nameTags: {
      [addresses[ChainId.EthMainnet].bundler]: "EthereumBundler",
      [addresses[ChainId.BaseMainnet].bundler]: "BaseBundler",
    },
  },
};

export default config;
