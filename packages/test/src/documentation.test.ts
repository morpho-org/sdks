import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test.each(["README spawn", "getFunctionCalls JSDoc"])(
  "type-checks %s example",
  (example) => {
    const source =
      example === "README spawn"
        ? readFileSync(new URL("../README.md", import.meta.url), "utf8").split(
            "### Spawn anvil instances",
          )[1]!
        : readFileSync(
            new URL("./utils/getFunctionCalls.ts", import.meta.url),
            "utf8",
          ).replace(/^ \* ?/gm, "");
    const snippet = /```(?:typescript|ts)\n([\s\S]*?)```/.exec(source)?.[1];
    expect(snippet).toBeDefined();
    const prelude =
      example === "getFunctionCalls JSDoc"
        ? 'import type { AnvilTestClient } from "@morpho-org/test"; import type { Hash, Address } from "viem"; import { expect } from "vitest"; declare const client: AnvilTestClient;\n'
        : "";
    const code = prelude + snippet;
    const directory = mkdtempSync(join(import.meta.dirname, ".documentation-"));
    try {
      const fileName = join(directory, "example.ts");
      writeFileSync(fileName, code);
      const result = spawnSync(
        "pnpm",
        [
          "exec",
          "tsc",
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "--target",
          "es2022",
          "--module",
          "nodenext",
          fileName,
        ],
        { encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      // Check the example rather than unrelated source diagnostics in its imports.
      const diagnostics = result.stdout
        .split("\n")
        .filter(
          (line) => line.includes("example.ts(") || line.startsWith("error TS"),
        );
      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
