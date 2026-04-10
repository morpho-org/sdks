import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, parse, relative } from "node:path";
import process from "node:process";
import { inspect } from "node:util";
import solc from "solc";

const packageName = process.argv[2];

if (!packageName) {
  console.error("Usage: node scripts/compile-solidity.js <package-name>");
  process.exit(1);
}

const workspaceRoot = join(import.meta.dirname, "..");
const packageDir = join(workspaceRoot, "packages", packageName);
const contractsDir = join(packageDir, "contracts");

const packageConfigs = {
  "blue-sdk-viem": {
    bytecodeExportName: "code",
    resolveOutputPath(sourceName) {
      if (sourceName.includes("/interfaces/")) return null;

      const parsed = parse(sourceName);
      return join(
        packageDir,
        "src",
        parsed.dir.replaceAll("contracts", "queries"),
        `${parsed.name}.ts`,
      );
    },
  },
  "liquidation-sdk-viem": {
    bytecodeExportName: "bytecode",
    resolveOutputPath(sourceName) {
      if (sourceName.includes("/interfaces/")) return null;

      return join(
        packageDir,
        "test",
        "contracts",
        `${parse(sourceName).name}.ts`,
      );
    },
  },
};

const config = packageConfigs[packageName];

if (!config) {
  console.error(`Unsupported package: ${packageName}`);
  process.exit(1);
}

const collectSoliditySources = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSoliditySources(entryPath));
      continue;
    }
    if (!entry.name.endsWith(".sol")) continue;

    files.push(entryPath);
  }

  return files.sort();
};

const sourceFiles = collectSoliditySources(contractsDir);
const sources = Object.fromEntries(
  sourceFiles.map((filePath) => {
    const sourceName = relative(packageDir, filePath).replaceAll("\\", "/");
    return [sourceName, { content: readFileSync(filePath, "utf8") }];
  }),
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "cancun",
    optimizer: {
      enabled: true,
      runs: 200,
    },
    viaIR: true,
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors ?? [];
const compilerErrors = errors.filter((error) => error.severity === "error");

if (errors.length > 0) {
  const stream = compilerErrors.length > 0 ? process.stderr : process.stdout;
  stream.write(`${errors.map((error) => error.formattedMessage).join("\n")}\n`);
}

if (compilerErrors.length > 0) process.exit(1);

const writtenFiles = [];

for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  const outputPath = config.resolveOutputPath(sourceName);
  if (!outputPath) continue;

  const contractName = parse(sourceName).name;
  const artifact = contracts[contractName];
  if (!artifact) {
    throw new Error(`Missing compiled artifact for ${sourceName}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  writeFileSync(
    outputPath,
    `export const abi = ${inspect(artifact.abi, {
      compact: false,
      depth: null,
      maxArrayLength: null,
    })} as const;

export const ${config.bytecodeExportName} =
  ${JSON.stringify(`0x${artifact.evm.bytecode.object}`)};
`,
  );
  writtenFiles.push(outputPath);
}

if (writtenFiles.length > 0) {
  execFileSync("pnpm", ["exec", "biome", "check", "--write", ...writtenFiles], {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
}
