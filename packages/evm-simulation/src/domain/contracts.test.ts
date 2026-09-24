import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("v5 compiler contracts", () => {
  test("behavior: invalid inputs and mutable output writes are compiler errors", () => {
    const directory = mkdtempSync(join(tmpdir(), "simulation-type-contracts-"));
    const domain = fileURLToPath(new URL(".", import.meta.url));
    const cases = [
      {
        name: "final-authorizations",
        code: 2322,
        source: `import type { SimulateParams } from "${domain}request.js";
const value: SimulateParams = { chainId: 1, transactions: [], authorizations: [] };`,
      },
      {
        name: "permit-single",
        code: 2322,
        source: `import type { Permit2SignatureTransferTypedData } from "${domain}authorizations.js";
declare const payload: Permit2SignatureTransferTypedData;
const value: Permit2SignatureTransferTypedData = { ...payload, primaryType: "PermitSingle" };`,
      },
      {
        name: "wrong-limit-field",
        code: 2353,
        source: `import type { OperationLimit } from "${domain}limits.js";
declare const borrow: Extract<OperationLimit, { type: "blueBorrow" }>;
const value: OperationLimit = { ...borrow, maxSharesBurned: 1n };`,
      },
      {
        name: "mutable-output",
        code: 2540,
        source: `import type { VerifiedSimulationResult } from "${domain}result.js";
declare const result: VerifiedSimulationResult;
result.verification.before.wallet[0]!.assets = 1n;`,
      },
      {
        name: "mutable-output-array",
        code: 2339,
        source: `import type { VerifiedSimulationResult } from "${domain}result.js";
declare const result: VerifiedSimulationResult;
result.simulationTxs.push(result.simulationTxs[0]!);`,
      },
      {
        name: "mismatched-schema",
        code: 2322,
        source: `import type { Permit2SignatureTransferTypedData } from "${domain}authorizations.js";
declare const payload: Permit2SignatureTransferTypedData;
const value: Permit2SignatureTransferTypedData = {
  ...payload,
  types: { ...payload.types, TokenPermissions: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }] }
};`,
      },
      {
        name: "incomplete-result",
        code: 2741,
        source: `import type { VerifiedSimulationResult } from "${domain}result.js";
const value: VerifiedSimulationResult = { simulationTxs: [], calls: [], transfers: [], assetChanges: [] };`,
      },
    ];
    try {
      writeFileSync(join(directory, "package.json"), '{"type":"module"}');
      writeFileSync(
        join(directory, "tsconfig.json"),
        JSON.stringify({
          extends: fileURLToPath(
            new URL("../../../../tsconfig.json", import.meta.url),
          ),
          compilerOptions: { rootDir: "/", noEmit: true, types: [] },
          include: ["./*.ts"],
        }),
      );
      for (const fixture of cases)
        writeFileSync(join(directory, `${fixture.name}.ts`), fixture.source);

      const result = spawnSync(
        fileURLToPath(new URL("../../node_modules/.bin/tsc", import.meta.url)),
        ["--project", join(directory, "tsconfig.json"), "--pretty", "false"],
        { encoding: "utf8", timeout: 10_000 },
      );
      expect(result.error).toBeUndefined();
      expect([1, 2], result.stdout + result.stderr).toContain(result.status);
      const diagnostics = result.stdout
        .split("\n")
        .filter((line) => line.includes("error TS"));
      expect(diagnostics).toHaveLength(cases.length);
      for (const fixture of cases)
        expect(
          diagnostics.some(
            (line) =>
              line.includes(`${fixture.name}.ts(`) &&
              line.includes(`error TS${fixture.code}:`),
          ),
        ).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
