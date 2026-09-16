import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("compile-solidity", () => {
  test("behavior: cleanup preserves handwritten TypeScript files", () => {
    const root = mkdtempSync(join(tmpdir(), "compile-solidity-"));
    try {
      const scripts = join(root, "scripts");
      const contracts = join(
        root,
        "packages/blue-sdk-viem/contracts/interfaces",
      );
      const queries = join(root, "packages/blue-sdk-viem/src/queries");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(contracts, { recursive: true });
      mkdirSync(join(queries, "nested"), { recursive: true });
      writeFileSync(join(root, "package.json"), '{"type":"module"}');
      symlinkSync(
        join(import.meta.dirname, "../node_modules"),
        join(root, "node_modules"),
      );
      copyFileSync(
        join(import.meta.dirname, "compile-solidity.js"),
        join(scripts, "compile-solidity.js"),
      );
      // An interface exercises cleanup without producing artifacts that need formatting.
      writeFileSync(
        join(contracts, "IExample.sol"),
        "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ninterface IExample {}\n",
      );
      const handwritten = {
        "index.ts": 'export * from "./nested/helper.js";\n',
        "GetPosition.test.ts": 'import { test } from "vitest";\n',
        "nested/helper.ts": "export const value = 1;\n",
      };
      for (const [name, content] of Object.entries(handwritten)) {
        writeFileSync(join(queries, name), content);
      }
      const staleArtifact = join(queries, "nested/Removed.ts");
      writeFileSync(
        staleArtifact,
        "/** @internal Deployless `Removed` query ABI. */\nexport const abi = [] as const;\n",
      );

      execFileSync(process.execPath, [
        join(scripts, "compile-solidity.js"),
        "blue-sdk-viem",
      ]);

      for (const [name, content] of Object.entries(handwritten)) {
        expect(readFileSync(join(queries, name), "utf8")).toBe(content);
      }
      expect(existsSync(staleArtifact)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
