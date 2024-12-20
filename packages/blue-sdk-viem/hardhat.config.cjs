const { subtask } = require("hardhat/config");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join, parse } = require("node:path");
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

          const source = parse(sourceName).name;
          const path = join("src", "queries", `${source}.ts`);

          const dir = dirname(path);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

          const {
            abi,
            evm: {
              bytecode: { object: bytecode },
            },
          } = Object.entries(contract).find(([name]) => name === source)[1];

          writeFileSync(
            path,
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
