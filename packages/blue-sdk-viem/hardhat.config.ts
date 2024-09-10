import "dotenv/config";
import "hardhat-deal";
import { HardhatUserConfig, subtask } from "hardhat/config";

import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-network-helpers";
import { basename, join } from "path";
import { inspect } from "util";
import { values } from "@morpho-org/morpho-ts";
import { writeFile } from "fs/promises";
import { TASK_COMPILE_SOLIDITY_EMIT_ARTIFACTS } from "hardhat/builtin-tasks/task-names";
import { Abi } from "viem";

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
  solidity: {
    compilers: [
      {
        version: "0.8.27",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  paths: {
    cache: "./cache",
  },
  mocha: {
    timeout: 300000,
    reporterOptions: {
      maxDiffSize: 2 ** 16,
    },
  },
};

subtask(TASK_COMPILE_SOLIDITY_EMIT_ARTIFACTS).setAction(
  async (args, _, next) => {
    const output = await next();

    await Promise.all(
      Object.entries(args.output.contracts).map(
        async ([sourceName, contract]) => {
          if (sourceName.includes("interfaces")) return;

          const {
            abi,
            evm: {
              bytecode: { object: bytecode },
            },
          } = values(
            contract as Record<
              string,
              { abi: Abi; evm: { bytecode: { object: string } } }
            >,
          )[0]!;

          await writeFile(
            join("src", "queries", basename(sourceName).replace(".sol", ".ts")),
            `export const abi = ${inspect(abi, false, null)} as const;

export const code = "0x${bytecode}";`,
          );
        },
      ),
    );

    return output;
  },
);

export default config;
