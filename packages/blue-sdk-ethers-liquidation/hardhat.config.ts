import "dotenv/config";
import "hardhat-deal";
import "hardhat-tracer";
import type { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";
import "@typechain/hardhat";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

const rpcUrl = process.env.MAINNET_RPC_URL;
if (!rpcUrl) throw Error(`no RPC provided`);

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: rpcUrl,
        blockNumber: 20_818_976,
      },
      mining: {
        mempool: {
          order: "fifo",
        },
      },
      allowBlocksWithSameTimestamp: true,
      // Config tweak to be able to easily impersonate accounts without big ETH balance
      gasPrice: 10,
      initialBaseFeePerGas: 10,
    },
  },
  solidity: {
    version: "0.8.26",
  },
  paths: {
    sources: "./mocks",
    tests: "./test",
    cache: "./cache",
  },
  mocha: {
    timeout: 300000,
    reporterOptions: {
      maxDiffSize: 2 ** 16,
    },
  },
  typechain: {
    outDir: "./mocks/types/",
    target: "ethers-v6",
  },
  tracer: {
    nameTags: {
      [addresses[ChainId.EthMainnet].morpho]: "Morpho",
      "0x111111125421cA6dc452d289314280a0f8842A65": "1inch",
    },
  },
};

export default config;
