// SPDX-License-Identifier: Apache-2.0
//
// Jest resolves `@morpho-org/*` workspace packages by reading `package.json#main`,
// which points at the TypeScript source (e.g. `src/index.ts`). Jest can't parse TS
// without extra config, so we map the workspace `@morpho-org/*` imports to the
// built ESM output produced by each package's `tsc --build` step. CI builds these
// before running the suite (`pnpm --filter '@morpho-org/wdk-protocol-lending-morpho-evm^...' build`).
// Phase 2 of TIB-2026-05-18 retires this jest config in favour of Vitest, which
// resolves the workspace `src/` directly.

const workspacePackages = [
  "blue-sdk",
  "blue-sdk-viem",
  "bundler-sdk-viem",
  "morpho-sdk",
  "morpho-ts",
  "simulation-sdk",
];

const moduleNameMapper = Object.fromEntries(
  workspacePackages.map((name) => [
    `^@morpho-org/${name}$`,
    `<rootDir>/../${name}/lib/esm/index.js`,
  ]),
);

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  moduleNameMapper,
  // Polyfill `BigInt.prototype.toJSON` before any test loads. Fork tests on
  // viem clients routinely throw errors carrying bigint fields (amounts, chain
  // ids), and jest's worker IPC JSON.stringify's those payloads to forward to
  // the parent — without the polyfill it throws "Do not know how to serialize
  // a BigInt" and masks the underlying error.
  setupFiles: ["<rootDir>/jest.setup.mjs"],
};
