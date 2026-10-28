import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

describe("compile-solidity", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "compile-solidity-"));
    const scripts = join(root, "scripts");
    const contracts = join(root, "packages/blue-sdk-viem/contracts/interfaces");
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
      join(import.meta.dirname, "compile-solidity.ts"),
      join(scripts, "compile-solidity.ts"),
    );
    // An interface exercises cleanup without producing artifacts that need formatting.
    writeFileSync(
      join(contracts, "IExample.sol"),
      "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ninterface IExample {}\n",
    );
    return { root, scripts, queries };
  };

  const runCompile = (scripts: string) => {
    try {
      execFileSync(
        process.execPath,
        [join(scripts, "compile-solidity.ts"), "blue-sdk-viem"],
        { stdio: "pipe" },
      );
      return { threw: false, stderr: "" };
    } catch (error) {
      const stderr =
        error &&
        typeof error === "object" &&
        "stderr" in error &&
        Buffer.isBuffer(error.stderr)
          ? error.stderr.toString()
          : "";
      return { threw: true, stderr };
    }
  };

  test("behavior: cleanup preserves query barrel files", () => {
    const { root, scripts, queries } = setup();
    try {
      const preserved = {
        "index.ts": 'export * as Nested from "./nested/index.js";\n',
        "nested/index.ts": 'export * from "./Other.js";\n',
      };
      for (const [name, content] of Object.entries(preserved)) {
        writeFileSync(join(queries, name), content);
      }
      const staleArtifact = join(queries, "nested/Removed.ts");
      writeFileSync(
        staleArtifact,
        "/** @internal Deployless `Removed` query ABI. */\nexport const abi = [] as const;\n",
      );

      execFileSync(process.execPath, [
        join(scripts, "compile-solidity.ts"),
        "blue-sdk-viem",
      ]);

      for (const [name, content] of Object.entries(preserved)) {
        expect(readFileSync(join(queries, name), "utf8")).toBe(content);
      }
      expect(existsSync(staleArtifact)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    {
      path: "nested/Removed.ts",
      content: '/** @internal tampered */\nexport const code = "0x00";\n',
    },
    {
      path: "__fixtures__/GetMarket.ts",
      content: 'export const code = "0x00";\n',
    },
    {
      path: "GetPosition.test.ts",
      content: 'export const code = "0x00";\n',
    },
    {
      path: "GetMarket.cts",
      content: 'export const code = "0x00";\n',
    },
    {
      path: ".Hidden.ts",
      content: 'export const code = "0x00";\n',
    },
    {
      path: ".dir/GetMarket.ts",
      content: 'export const code = "0x00";\n',
    },
    {
      path: "nested/data.json",
      content: '{"code":"0x00"}',
    },
    {
      path: "index.ts",
      content: 'export * from "./A.js";\nexport const code = "0x00";\n',
    },
    {
      path: "index.ts",
      content: 'export * from "./../evil.js";\n',
    },
    {
      path: "index.ts",
      content: 'export * from "./nested/../../evil.js";\n',
    },
    {
      path: "index.ts",
      content: 'export * from "./.h/GetMarket.js";\n',
    },
    {
      path: "index.ts",
      content: 'export * from "./x\\u002f..\\u002f..\\u002fevil.js";\n',
    },
    {
      path: "index.ts",
      content: 'export * from "./x\\\\..\\\\..\\\\evil.js";\n',
    },
  ])(
    "behavior: cleanup rejects a source-less query file $path",
    ({ path, content }) => {
      const { root, scripts, queries } = setup();
      try {
        mkdirSync(join(queries, "__fixtures__"), { recursive: true });
        const orphan = join(queries, path);
        mkdirSync(dirname(orphan), { recursive: true });
        writeFileSync(orphan, content);

        const { threw, stderr } = runCompile(scripts);

        expect(threw).toBe(true);
        expect(stderr).toContain(path);
        expect(readFileSync(orphan, "utf8")).toBe(content);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  test("behavior: compile succeeds when src/queries does not exist yet", () => {
    const { root, scripts, queries } = setup();
    try {
      rmSync(queries, { recursive: true });
      execFileSync(
        process.execPath,
        [join(scripts, "compile-solidity.ts"), "blue-sdk-viem"],
        { stdio: "pipe" },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("behavior: compile refuses to write through a symlinked src/queries", () => {
    const { root, scripts, queries } = setup();
    try {
      writeFileSync(
        join(root, "packages/blue-sdk-viem/contracts/GetZ.sol"),
        "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract GetZ {}\n",
      );
      const outside = join(root, "packages/blue-sdk-viem/outside");
      renameSync(queries, outside);
      symlinkSync(outside, queries);

      expect(() =>
        execFileSync(
          process.execPath,
          [join(scripts, "compile-solidity.ts"), "blue-sdk-viem"],
          { stdio: "pipe" },
        ),
      ).toThrow(/src\/queries/);
      expect(existsSync(join(outside, "GetZ.ts"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("behavior: compile refuses to write through a symlinked query directory", () => {
    const { root, scripts, queries } = setup();
    try {
      const contractDir = join(root, "packages/blue-sdk-viem/contracts/linked");
      mkdirSync(contractDir, { recursive: true });
      writeFileSync(
        join(contractDir, "GetY.sol"),
        "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract GetY {}\n",
      );
      const outside = join(root, "packages/blue-sdk-viem/outside");
      mkdirSync(outside);
      symlinkSync(outside, join(queries, "linked"));

      const { threw, stderr } = runCompile(scripts);
      expect(threw).toBe(true);
      expect(stderr).toContain("linked");
      expect(existsSync(join(outside, "GetY.ts"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("behavior: compile refuses to write a generated artifact through a symlink", () => {
    const { root, scripts, queries } = setup();
    try {
      writeFileSync(
        join(root, "packages/blue-sdk-viem/contracts/GetX.sol"),
        "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract GetX {}\n",
      );
      const content = 'export const code = "0x00";\n';
      const target = join(root, "packages/blue-sdk-viem/GetX.fixture.ts");
      const link = join(queries, "GetX.ts");
      writeFileSync(target, content);
      symlinkSync(target, link);

      const { threw, stderr } = runCompile(scripts);
      expect(threw).toBe(true);
      expect(stderr).toContain("GetX.ts");
      expect(readFileSync(target, "utf8")).toBe(content);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    { name: "GetMarket.ts", content: 'export const code = "0x00";\n' },
    { name: "index.ts", content: 'export * from "./GetMarket.js";\n' },
    { name: "Evil", content: 'export const code = "0x00";\n' },
  ])(
    "behavior: cleanup rejects a source-less query symlink $name",
    ({ name, content }) => {
      const { root, scripts, queries } = setup();
      try {
        const file = join(root, "packages/blue-sdk-viem/src/evil-dir/evil.ts");
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        const target = name === "Evil" ? dirname(file) : file;
        const orphan = join(queries, name);
        symlinkSync(target, orphan);

        const { threw, stderr } = runCompile(scripts);

        expect(threw).toBe(true);
        expect(stderr).toContain(name);
        expect(lstatSync(orphan).isSymbolicLink()).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
