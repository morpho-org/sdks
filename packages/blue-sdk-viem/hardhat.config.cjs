const { subtask } = require("hardhat/config");
const { writeFile } = require("node:fs/promises");
const { basename, join } = require("node:path");
const { inspect } = require("node:util");
const {
  TASK_COMPILE_SOLIDITY_EMIT_ARTIFACTS,
} = require("hardhat/builtin-tasks/task-names");

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
          } = Object.values(contract)[0];

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

exports.default = {
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
