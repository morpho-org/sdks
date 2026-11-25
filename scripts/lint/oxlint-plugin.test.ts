import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const cli = fileURLToPath(
  new URL("./bin/oxlint", import.meta.resolve("oxlint/package.json")),
);
const config = new URL("../../.oxlintrc.sdk.jsonc", import.meta.url);
const plugin = fileURLToPath(new URL("./oxlint-plugin.ts", import.meta.url));
const address = "0x52908400098527886E0F7030069857D2E4169EE7";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "sdk-address-lint-"));
  writeFileSync(
    join(cwd, ".oxlintrc.sdk.jsonc"),
    readFileSync(config, "utf8").replace(
      '"./scripts/lint/oxlint-plugin.ts"',
      JSON.stringify(plugin),
    ),
  );
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

const lint = (...args: string[]) =>
  spawnSync(process.execPath, [cli, "-c", ".oxlintrc.sdk.jsonc", ...args], {
    cwd,
    encoding: "utf8",
  });

describe.sequential("checksum-address", () => {
  test("reports address casing without changing the file, then fixes only the address ranges", () => {
    const lower = address.toLowerCase();
    const upperPrefix = address.replace("0x", "0X");
    const longerHex = `${lower}00`;
    const source = `\uFEFF// 📦 ${lower}\r\nexport const address = \`${upperPrefix}\`;\r\n// ${address} ${longerHex}\r\n`;
    const file = join(cwd, "address.ts");
    writeFileSync(file, source);

    const check = lint("address.ts");
    expect(check.status, check.stdout + check.stderr).toBe(1);
    expect(check.stdout.match(/morpho-sdk\(checksum-address\)/g)).toHaveLength(
      2,
    );
    expect(readFileSync(file, "utf8")).toBe(source);

    const fix = lint("--fix", "address.ts");
    expect(fix.status, fix.stdout + fix.stderr).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(
      source.replace(lower, address).replace(upperPrefix, address),
    );
    expect(lint("address.ts").status).toBe(0);
  });

  test("scoped fixes leave other source files and ignored output alone", () => {
    const source = `export const address = "${address.toLowerCase()}";\n`;
    mkdirSync(join(cwd, "lib"));
    writeFileSync(join(cwd, "staged.js"), source);
    writeFileSync(join(cwd, "unstaged.js"), source);
    writeFileSync(join(cwd, "lib/ignored.js"), source);

    const fix = lint("--fix", "staged.js", "lib/ignored.js");
    expect(fix.status, fix.stdout + fix.stderr).toBe(0);
    expect(readFileSync(join(cwd, "staged.js"), "utf8")).toContain(address);
    expect(readFileSync(join(cwd, "unstaged.js"), "utf8")).toBe(source);
    expect(readFileSync(join(cwd, "lib/ignored.js"), "utf8")).toBe(source);
  });
});
