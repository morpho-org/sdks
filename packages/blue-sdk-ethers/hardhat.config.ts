import "dotenv/config";
import "hardhat-deal";
import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";

const rpcUrl = process.env.MAINNET_RPC_URL;
if (!rpcUrl) throw Error(`no RPC provided`);

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
      allowBlocksWithSameTimestamp: true,
      chainId: 1,
      forking: {
        url: rpcUrl,
        blockNumber: 19_530_000,
      },
      mining: {
        mempool: {
          order: "fifo",
        },
      },
    },
  },
  paths: {
    cache: "./cache",
    tests: "./test/e2e",
  },
  mocha: {
    timeout: 300000,
    reporterOptions: {
      maxDiffSize: 2 ** 16,
    },
  },
};

export default config;
