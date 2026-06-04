import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress } from "viem";
import config from "../../biome.json" with { type: "json" };

const excludeDeprecated = process.argv.includes("--exclude-deprecated");

const deprecatedPackageDirs = new Set([
  "packages/liquidation-sdk-viem",
  "packages/bundler-sdk-viem",
  "packages/migration-sdk-viem",
  "packages/simulation-sdk",
  "packages/blue-sdk-wagmi",
  "packages/simulation-sdk-wagmi",
  "packages/test-wagmi",
]);

const ignored = (config.files?.includes ?? [])
  .filter((pattern) => pattern.startsWith("!"))
  .map((pattern) => pattern.replace(/^!(\*\*\/)?/, ""));

const lint = (path) => {
  const files = readdirSync(path, { encoding: "utf-8" });

  for (const file of files) {
    if (file === ".git" || file === "node_modules") continue;

    const filePath = join(path, file);
    const normalizedPath = filePath.replace(/^\.\//, "");
    if (lstatSync(filePath).isDirectory()) {
      if (excludeDeprecated && deprecatedPackageDirs.has(normalizedPath))
        continue;
      lint(filePath);
      continue;
    }

    if (
      (!file.endsWith(".ts") && !file.endsWith(".js")) ||
      ignored.some((pattern) => filePath.includes(pattern))
    )
      continue;

    const content = readFileSync(filePath, { encoding: "utf-8" });
    const checksummedContent = content.replaceAll(
      /0x[0-9a-f]{40}(?![0-9a-f])/gi,
      (address) => getAddress(address),
    );

    if (checksummedContent !== content)
      writeFileSync(filePath, checksummedContent);
  }
};

lint(".");
