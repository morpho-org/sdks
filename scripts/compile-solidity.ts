import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, parse, relative } from "node:path";
import process from "node:process";
import { inspect } from "node:util";
import solc from "solc";

const packageName = process.argv[2];

if (!packageName) {
  console.error("Usage: node scripts/compile-solidity.ts <package-name>");
  process.exit(1);
}

const workspaceRoot = join(import.meta.dirname, "..");
const packageDir = join(workspaceRoot, "packages", packageName);
const contractsDir = join(packageDir, "contracts");

interface PackageConfig {
  bytecodeExportName: string;
  describeArtifact(contractName: string): string;
  resolveOutputPath(sourceName: string): string | null;
}

const packageConfigs: Record<string, PackageConfig> = {
  "blue-sdk-viem": {
    bytecodeExportName: "code",
    describeArtifact(contractName) {
      return `Deployless \`${contractName}\` query`;
    },
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
  "midnight-sdk": {
    bytecodeExportName: "code",
    describeArtifact(contractName) {
      return `Deployless \`${contractName}\` query`;
    },
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
};

const config = packageConfigs[packageName];

if (!config) {
  console.error(`Unsupported package: ${packageName}`);
  process.exit(1);
}

const collectSoliditySources = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

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

interface SolcError {
  formattedMessage?: string;
  severity?: string;
}

interface SolcContractArtifact {
  abi: unknown;
  evm: {
    bytecode: {
      object: string;
    };
  };
}

interface SolcOutput {
  contracts: Record<string, Record<string, SolcContractArtifact | undefined>>;
  errors?: SolcError[];
}

const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;
const errors = output.errors ?? [];
const compilerErrors = errors.filter((error) => error.severity === "error");

if (errors.length > 0) {
  const stream = compilerErrors.length > 0 ? process.stderr : process.stdout;
  stream.write(`${errors.map((error) => error.formattedMessage).join("\n")}\n`);
}

if (compilerErrors.length > 0) process.exit(1);

const queriesDir = join(packageDir, "src", "queries");
const queriesStat = lstatSync(queriesDir, { throwIfNoEntry: false });
const linkedEntries = !queriesStat
  ? []
  : queriesStat.isSymbolicLink()
    ? [queriesDir]
    : readdirSync(queriesDir, { recursive: true, withFileTypes: true })
        .filter((entry) => !entry.isDirectory() && !entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));
if (linkedEntries.length > 0) {
  throw new Error(
    `Symlinks or special files under src/queries:\n${linkedEntries.map((file) => `- ${relative(workspaceRoot, file)}`).join("\n")}\nReplace them with regular files and directories so compile never writes outside src/queries.`,
  );
}

const writtenFiles: string[] = [];

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
    `/** @internal ${config.describeArtifact(contractName)} ABI. */
export const abi = ${inspect(artifact.abi, {
      compact: false,
      depth: null,
      maxArrayLength: null,
    })} as const;

/** @internal ${config.describeArtifact(contractName)} bytecode. */
export const ${config.bytecodeExportName} =
  ${JSON.stringify(`0x${artifact.evm.bytecode.object}`)};
`,
  );
  writtenFiles.push(outputPath);
}

const writtenFileSet = new Set(writtenFiles);
const unexpectedFiles: string[] = [];
for (const entry of existsSync(queriesDir)
  ? readdirSync(queriesDir, { recursive: true, withFileTypes: true })
  : []) {
  if (entry.isDirectory()) continue;
  const outputPath = join(entry.parentPath, entry.name);
  // Defense in depth: the pre-write scan already rejects these.
  if (!entry.isFile()) {
    unexpectedFiles.push(relative(workspaceRoot, outputPath));
    continue;
  }
  if (writtenFileSet.has(outputPath)) continue;

  if (parse(outputPath).base === "index.ts") {
    const barrelExports = readFileSync(outputPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "");
    if (
      !barrelExports.every((line) =>
        /^export \* (as [A-Za-z0-9_$]+ )?from "\.\/(?:[A-Za-z0-9_$-][A-Za-z0-9_$.-]*\/)*[A-Za-z0-9_$-][A-Za-z0-9_$.-]*\.js";$/.test(
          line,
        ),
      )
    ) {
      unexpectedFiles.push(relative(workspaceRoot, outputPath));
    }
    continue;
  }

  if (
    parse(outputPath).ext === ".ts" &&
    readFileSync(outputPath, "utf8").startsWith(
      `/** @internal ${config.describeArtifact(parse(outputPath).name)} ABI. */`,
    )
  ) {
    unlinkSync(outputPath);
    continue;
  }

  unexpectedFiles.push(relative(workspaceRoot, outputPath));
}

if (unexpectedFiles.length > 0) {
  throw new Error(
    `Unexpected files under src/queries with no Solidity source in contracts/:\n${unexpectedFiles.map((file) => `- ${file}`).join("\n")}\nEvery shipped file there must be generated from a contract; delete them, add their .sol source, or move fixtures and helpers to test/ and tests to test/**/*.integration.test.ts.`,
  );
}

if (writtenFiles.length > 0) {
  execFileSync("pnpm", ["exec", "biome", "check", "--write", ...writtenFiles], {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
}
