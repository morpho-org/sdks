import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress } from "viem";
import config from "../../biome.json" with { type: "json" };

const lint = (path) => {
  const files = readdirSync(path, { encoding: "utf-8" });

  for (const file of files) {
    if (file === ".git" || file === "node_modules") continue;

    const filePath = join(path, file);
    if (lstatSync(filePath).isDirectory()) {
      lint(filePath);
      continue;
    }

    if (
      (!file.endsWith(".ts") && !file.endsWith(".js")) ||
      config.files.ignore.some((ignored) => file.includes(ignored))
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
