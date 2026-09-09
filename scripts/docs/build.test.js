import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

let fixture;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "sdk-docs-test-"));
  mkdirSync(join(fixture, "scripts/docs"), { recursive: true });
  mkdirSync(join(fixture, "docs/api-markdown"), { recursive: true });
  symlinkSync(
    resolve("node_modules"),
    join(fixture, "node_modules"),
    "junction",
  );
  for (const name of ["build.mjs", "comments.mjs", "model.mjs"])
    copyFileSync(
      resolve("scripts/docs", name),
      join(fixture, "scripts/docs", name),
    );
  copyFileSync(
    resolve("api-extractor.json"),
    join(fixture, "api-extractor.json"),
  );
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  writeFileSync(
    join(fixture, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        declaration: true,
      },
    }),
  );
  writeFileSync(
    join(fixture, "tsconfig.docs.json"),
    JSON.stringify({
      compilerOptions: {
        types: [],
        emitDeclarationOnly: true,
        noEmitOnError: true,
        removeComments: false,
      },
      files: ["packages/example/src/index.ts", "packages/shared/src/index.ts"],
    }),
  );
  for (const name of ["example", "shared"]) {
    const folder = join(fixture, "packages", name);
    mkdirSync(join(folder, "src"), { recursive: true });
    writeFileSync(
      join(folder, "package.json"),
      JSON.stringify({
        name: `@docs/${name}`,
        version: "1.0.0",
        type: "module",
        main: "src/index.ts",
        ...(name === "example"
          ? { dependencies: { "@docs/shared": "workspace:*" } }
          : {}),
        ...(name === "shared"
          ? { exports: { ".": "./src/index.ts", "./units": "./src/units.ts" } }
          : {}),
      }),
    );
    writeFileSync(
      join(folder, "tsconfig.build.esm.json"),
      JSON.stringify({ extends: "../../tsconfig.json", include: ["src"] }),
    );
  }
  mkdirSync(join(fixture, "packages/example/node_modules/@docs"), {
    recursive: true,
  });
  symlinkSync(
    join(fixture, "packages/shared"),
    join(fixture, "packages/example/node_modules/@docs/shared"),
    "junction",
  );
  writeFileSync(
    join(fixture, "packages/shared/src/index.ts"),
    "/** Asset amount. */\nexport type Amount = bigint;\n",
  );
  writeFileSync(
    join(fixture, "packages/shared/src/units.ts"),
    "export const UNIT = 1n;\n",
  );
  mkdirSync(join(fixture, "packages/example/src/internal"));
  writeFileSync(
    join(fixture, "packages/example/src/internal/helper.ts"),
    "export const hiddenByPath = 42;\n",
  );
  writeFileSync(
    join(fixture, "packages/example/src/index.ts"),
    [
      'import type { Amount } from "@docs/shared";',
      'import { UNIT } from "@docs/shared/units";',
      'export { hiddenByPath } from "./internal/helper.js";',
      "/** @internal */",
      "export const hiddenByTag = 7;",
      "/**",
      " * Builds a transaction.",
      " * @param input - Transaction inputs.",
      " * @param input.amount - Amount in the smallest unit.",
      " * @returns The scaled amount.",
      " * @throws {RangeError} when the amount is negative.",
      " * @example",
      " * ```ts",
      " * // @internal here is example text.",
      " * const amount = build({ amount: 2n });",
      " * ```",
      " */",
      "export const build = ({ amount }: { amount: Amount }): Amount => {",
      '  if (amount < 0n) throw new RangeError("negative");',
      "  return amount * UNIT;",
      "}",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function runBuild() {
  return execFileSync(
    process.execPath,
    [join(fixture, "scripts/docs/build.mjs")],
    { cwd: fixture, encoding: "utf8", stdio: "pipe" },
  );
}

function readPages() {
  const directory = join(fixture, "docs/api-markdown");
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(join(directory, name), "utf8")]),
  );
}

describe("documentation build", () => {
  test("default", () => {
    runBuild();
    const pages = readPages();
    const page = pages["example.build.md"];
    expect(page).toContain("Amount in the smallest unit.");
    expect(page).toContain("The scaled amount.");
    expect(page).toContain("`RangeError` when the amount is negative.");
    expect(page).toContain(
      "```ts\n// @internal here is example text.\nconst amount = build({ amount: 2n });\n```",
    );
    expect(page).toContain("shared.amount.md");
    expect(page).not.toContain("(not declared)");
    expect(pages["README.md"]).toBe(pages["index.md"]);
    expect(Object.keys(pages).some((name) => name.includes("hiddenby"))).toBe(
      false,
    );
    expect(
      Object.values(pages).some((contents) => contents.includes("\r\n")),
    ).toBe(false);
  });

  test("behavior: repeated builds produce identical Markdown and remove stale pages", () => {
    runBuild();
    const first = readPages();
    writeFileSync(join(fixture, "docs/api-markdown/stale.md"), "stale");
    runBuild();
    expect(readPages()).toEqual(first);
  });

  test("error: compiler failures preserve the previous reference", () => {
    writeFileSync(
      join(fixture, "docs/api-markdown/README.md"),
      "previous reference",
    );
    const previous = readPages();
    writeFileSync(
      join(fixture, "packages/example/src/index.ts"),
      'export const invalid: number = "not a number";',
    );
    expect(() => runBuild()).toThrow();
    expect(readPages()).toEqual(previous);
  });
});
