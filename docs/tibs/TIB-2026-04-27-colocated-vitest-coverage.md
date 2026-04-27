# TIB-2026-04-27: Colocated vitest coverage across SDK packages

| Field      | Value                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Proposed                                                                                                                                       |
| **Date**   | 2026-04-27                                                                                                                                     |
| **Author** | @0xbulma                                                                                                                                       |
| **Scope**  | Repo-wide (packages: `morpho-ts`, `blue-sdk`, `blue-sdk-viem`, `bundler-sdk-viem`, `liquidation-sdk-viem`, `liquidity-sdk-viem`, `morpho-test`, `test`) |

---

## Context

Test coverage across the SDK monorepo is uneven. Some packages have substantial fork-based suites (e.g. `blue-sdk-viem`, `simulation-sdk`); others have none (`morpho-test`, the test-utility packages, parts of `liquidity-sdk-viem`). All current tests live in a per-package `test/` directory separate from `src/`, which has three practical drawbacks:

1. Test files are physically distant from the code they exercise — adding/removing a function rarely produces an adjacent test edit, and reviewers must hop between two trees to evaluate coverage of a change.
2. Most existing tests are integration-style and require an Anvil fork. A clean `pnpm test:coverage` run from a developer machine without `MAINNET_RPC_URL`/`BASE_RPC_URL` cannot complete: the public RPC (`eth.merkle.io`) rate-limits to HTTP 429 well before the suite finishes. CI succeeds because it has paid RPC URLs in secrets. As a baseline we measured `pnpm test:coverage --project morpho-ts` (the only project with no RPC dependency): 112/112 tests pass and v8 reports **4.10% statements / 3.77% branches / 4.76% functions / 4.02% lines** across `packages/**/src/**`. This is the floor; everything above it depends on RPC availability.
3. Generated files (`abis.ts`, `api/types.ts`, `api/sdk.ts`) are inside the `coverage.include` glob, deflating reported coverage with thousands of un-coverable lines.

The repo has just adopted the TIB convention (PR #555). This TIB records the decision before any migration commits land.

## Goals / Non-Goals

**Goals**

- Switch the test layout for the in-scope packages to **colocation**: every `src/Foo.ts` gets a sibling `src/Foo.test.ts`. Migrate every existing test in `test/` directories to its colocated home.
- Achieve **extensive** unit-test coverage of every exported function in the in-scope packages. "Extensive" means: every public function has at least one test; calculation/encoding-heavy modules have multi-case tests covering edge inputs.
- Replace fork-dependent unit tests with **mocked** tests where the function under test does not actually require chain state: viem's transport-level mock for RPC, `nock` for HTTP/GraphQL. This makes `pnpm test:coverage` runnable locally without RPC URLs.
- Keep existing fork-based integration tests — they test contract round-trips that mocks cannot — but relocate and rename them `Foo.integration.test.ts` next to their source.
- Prevent test files from shipping to npm via `tsc` build excludes.
- Exclude generated files from coverage so reported numbers reflect hand-written code.

**Non-Goals**

- Migrating test layout for `simulation-sdk`, `simulation-sdk-wagmi`, `migration-sdk-viem`, `blue-sdk-wagmi`, `test-wagmi`. These packages keep their `test/` directories and current vitest project entries unchanged.
- Replacing vitest, biome, tsc, or pnpm. No new tools.
- Rewriting fork-based tests as mocked tests where the test purpose is end-to-end contract verification.
- Adding browser/Playwright coverage beyond what already exists.
- Hitting a specific numeric coverage target. The aim is "extensive coverage of every function," measured qualitatively per file, not a global %.

## Current Solution

Each package owns a `test/` directory (e.g. `packages/blue-sdk-viem/test/`) holding:

- `setup.ts` exporting one or more custom `test` fixtures built from `createViemTest(chain, { forkUrl, forkBlockNumber })` (re-exported by `@morpho-org/test/vitest`).
- `utils.ts` / `helpers.ts` with package-specific test helpers.
- `*.test.ts` files importing `../src/...` and `./setup.js`.

Root `vitest.config.ts` declares twelve named projects, each with `include: ["packages/X/test/**/*.test.ts"]` and a per-project timeout (30/60/90 s). `coverage.include` is `packages/**/src/**`; coverage `exclude` lists the three test-utility packages but no generated files.

`tsc --build tsconfig.build.{cjs,esm}.json` emits to `lib/{cjs,esm}` from `src/`. Tests live outside `src/`, so they do not currently reach `lib/`. There is no `exclude` for `*.test.ts` because none exist under `src/` today.

Source files use `viem/actions` named imports — `import { readContract } from "viem/actions"` and `readContract(client, ...)` — not client methods. This is the key fact that determines mock placement.

## Proposed Solution

### Layout

For every in-scope package:

```
packages/X/
├── src/
│   ├── Foo.ts
│   ├── Foo.test.ts                  # colocated unit test
│   ├── sub/
│   │   ├── Bar.ts
│   │   └── Bar.test.ts
│   └── __test-utils__/              # relocated from test/
│       ├── fixtures.ts              # was test/setup.ts
│       ├── nock-setup.ts            # for HTTP-using packages
│       └── <package-specific>.ts    # was test/utils.ts, test/helpers.ts
└── (test/ directory deleted after migration)
```

Naming:

- Pure unit / mocked: `Foo.test.ts`. Runs unconditionally.
- Fork or external-service: `Foo.integration.test.ts` (still matches `**/*.test.ts`; the infix is informational).
- File casing follows source casing: `MathLib.test.ts` for PascalCase classes, `format.test.ts` for camelCase utilities. Never `.spec.ts`.

### Vitest configuration

Update `vitest.config.ts` per in-scope project:

```ts
{
  extends: true,
  test: {
    name: "blue-sdk-viem",
    include: ["packages/blue-sdk-viem/src/**/*.test.ts"],
    testTimeout: 60_000,
  },
},
```

Special case `liquidation-sdk-viem` because of `test/examples/`:

```ts
include: [
  "packages/liquidation-sdk-viem/src/**/*.test.ts",
  "packages/liquidation-sdk-viem/test/examples/**/*.test.ts",
],
```

Coverage block (root):

```ts
coverage: {
  reporter: ["text-summary", "lcov"],
  include: ["packages/**/src/**"],
  exclude: [
    "packages/test/**",
    "packages/test-wagmi/**",
    "packages/morpho-test/**",
    "packages/**/src/**/*.test.ts",
    "packages/**/src/**/__test-utils__/**",
    "packages/**/src/**/__mocks__/**",
    "packages/**/src/**/__fixtures__/**",
    "packages/**/src/**/*.d.ts",
    "packages/**/src/**/abis.ts",
    "packages/**/src/api/sdk.ts",
    "packages/**/src/api/types.ts",
  ],
},
```

`globalSetup: "vitest.setup.ts"` is unchanged. Out-of-scope projects keep their existing `test/` includes.

### Per-package build excludes

For all 8 in-scope packages, both `tsconfig.build.cjs.json` and `tsconfig.build.esm.json` get an `exclude` block:

```json
{
  "include": ["src"],
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test-d.ts",
    "src/**/__test-utils__/**",
    "src/**/__mocks__/**",
    "src/**/__fixtures__/**"
  ]
}
```

Dev `tsconfig.json` keeps `"include": ["src"]` so test files type-check during `tsc --noEmit`.

### Mocking patterns

**Transport-level viem mock.** New file `packages/test/src/mock.ts`, exposed via a new `./mock` sub-export in `packages/test/package.json` (`exports`, `typesVersions`, `publishConfig.exports` — three sites). Provides:

```ts
import { type Address, type Chain, createClient, custom, encodeFunctionResult, type Abi } from "viem";
import { mainnet } from "viem/chains";
import { vi } from "vitest";

export function createMockClient(chain: Chain = mainnet) {
  const request = vi.fn(async ({ method, params }) => {
    if (method === "eth_chainId") return `0x${chain.id.toString(16)}`;
    throw new Error(`Unhandled RPC ${method} ${JSON.stringify(params)}`);
  });
  const client = createClient({ chain, transport: custom({ request }) });
  return { client, request };
}

export function mockRead<abi extends Abi>(
  request: ReturnType<typeof vi.fn>,
  match: { address: Address; abi: abi; functionName: string },
  result: unknown,
): void { /* dispatch eth_call by `to` + selector → encodeFunctionResult */ }
```

Used by every test of `fetch/*.ts`, `queries/*.ts`, and encoders that call viem actions. Mocking at the transport (not at `client.readContract`) is required because source uses `import { readContract } from "viem/actions"`.

**HTTP via `nock`.** `nock` is already a devDep of `liquidation-sdk-viem` and `liquidity-sdk-viem`; add to `blue-sdk-viem` and `bundler-sdk-viem`. Each HTTP-using package gets `src/__test-utils__/nock-setup.ts`:

```ts
import nock from "nock";

nock.disableNetConnect();
nock.enableNetConnect("127.0.0.1");
```

Wired into the project's vitest entry as `setupFiles`. Per-test mocks are scoped via `beforeEach` / `afterEach(() => nock.cleanAll())`.

**GraphQL.** Mock at the HTTP layer (`nock(BLUE_API_BASE_URL).post("/graphql").reply(200, fixture)`), matching the existing pattern in `liquidity-sdk-viem`'s loader test. Avoid `vi.mock("./api/sdk.js", ...)` — concurrent test races (`sequence: { concurrent: true }` is global) and codegen-shape coupling.

### Implementation Phases

The migration is sequenced easiest-first to validate the patterns before applying them to the heavy packages. Each phase is one PR on a stack rooted at PR #555.

- **Phase 1 — `morpho-ts`:** Pure TS utilities, no mocking required. Validates the colocation tooling (vitest include update, tsconfig excludes, coverage excludes) and proves the convention before any dependency on viem mocks. Adds tests for `urls.ts`, `types.ts`, `format/string.ts`, `format/array.ts`, `format/locale.ts` (none today).
- **Phase 2 — `packages/test` + new `src/mock.ts`:** Introduces the `createMockClient` / `mockRead` primitives and the `./mock` sub-export. Adds tests for `mock.ts`, `fixtures.ts` (`randomAddress`, `testAccount`), `vitest.ts`, and the non-fork-bound logic of `anvil.ts` and `client.ts` (arg builders, action wiring shape).
- **Phase 3 — `blue-sdk`:** Largest pure-logic package. Migrates the existing `test/unit/*.test.ts` and the single `test/e2e/Market.test.ts` (renamed `Market.integration.test.ts`). Adds tests for every untested source file: `math/MathLib.ts`, `math/AdaptiveCurveIrmLib.ts`, `math/SharesMath.ts`, `errors.ts`, `addresses.ts`, `chain.ts`, `preLiquidation.ts`, all token classes, holdings, all vault classes (incl. v2 adapters), `MarketParams`, `Position`, `PreLiquidationPosition`. Uses fixtures from `@morpho-org/morpho-test`.
- **Phase 4 — `morpho-test`:** Small fixture package. Tests confirm each fixture passes the validators its consumers apply (e.g. `MarketParams` constructor accepts the shape; vault decimals offsets are valid).
- **Phase 5 — `liquidity-sdk-viem`:** Establishes the canonical `nock`/GraphQL pattern. Migrates `test/loader.test.ts` and JSON mocks; adds smoke-level tests for `api/sdk.ts`.
- **Phase 6 — `bundler-sdk-viem`:** Pure encoders. Migrates `test/helpers.ts` to `src/__test-utils__/bundle-helpers.ts`. Adds round-trip tests for `BundlerAction.ts`, `actions.ts`, `operations.ts`, `ActionBundle.ts`, `bundle.ts`, `errors.ts`, `types/*.ts` (decode the encoded calldata with viem's `decodeFunctionData` and assert the recovered structure equals the encoder input).
- **Phase 7 — `blue-sdk-viem`:** Largest viem-using surface. Migrates 12 existing fork tests as `*.integration.test.ts`. Adds **mocked** unit tests for every `fetch/*.ts` and `queries/*.ts` using `createMockClient` + `mockRead`. Adds tests for `utils.ts`, `error.ts`, `MetaMorphoAction.ts`, `signatures/*.ts` (deterministic test private keys; assert signature shape and recoverable signer), and `augment/*.ts` (assert the expected static/instance methods are attached).
- **Phase 8 — `liquidation-sdk-viem`:** Largest external-service surface; goes last so the patterns are settled. Keeps `test/examples/*.test.ts` in place via the union include. Migrates other tests, adds nock-based tests for `swap/1inch.ts`, `swap/paraswap.ts`, `swap/index.ts`, `flashbots.ts`, `api/index.ts`. Adds unit tests for `LiquidationEncoder.ts` (split into multiple `describe` blocks per public method), `positions/getters.ts`, `preLiquidation/*.ts`, `addresses.ts`, `thresholds.ts`, all `tokens/*.ts`.

Each phase's PR ends with: tests pass, `find packages/X/lib -name "*.test.*"` returns empty after build, `pnpm pack --dry-run` shows no test files, and the project's coverage rises.

## Considered Alternatives

### Alternative 1: Keep `test/` directories; only add new tests

Leave the existing layout untouched and only add new tests in the existing `test/` folders.

**Why rejected:** Misses the colocation goal entirely. Reviewers still hop between trees; new tests inherit the same drift risk as old tests; no benefit beyond raw coverage numbers.

### Alternative 2: Colocate but keep all tests fork-based

Move tests to `src/`-siblings but continue to use `createViemTest` everywhere.

**Why rejected:** Doesn't solve the local-RPC problem. Developers still cannot run `pnpm test:coverage` without a paid RPC URL; CI cost stays elevated; "unit" tests for pure functions remain coupled to a forked chain. The point of the migration is partly to make coverage runnable locally.

### Alternative 3: Mock `client.readContract` with `vi.spyOn`

Stub viem actions on the client object instead of intercepting at the transport.

**Why rejected:** Source code uses `import { readContract } from "viem/actions"; readContract(client, args)`. Those action functions read from `client.transport`, not from `client.readContract`. Spying on the client method does not intercept them. Transport-level interception with `viem.custom()` is the correct primitive.

### Alternative 4: Use `msw` for HTTP mocking

Adopt Mock Service Worker for HTTP and GraphQL.

**Why rejected:** `nock` is already in the repo for the two packages doing this today. Adding `msw` introduces a second tool with overlapping responsibilities and a heavier setup (server lifecycle, handler registration). `nock` handles the unit-test scope here.

### Alternative 5: Single big PR

Land the migration in one large PR.

**Why rejected:** Eight packages, hundreds of files, a convention change, and a new shared mock utility. Per-phase PRs let reviewers validate the canonical patterns on `morpho-ts` and `packages/test` before they propagate, and let regressions be bisected to a single package.

## Assumptions & Constraints

- The repo retains pnpm workspaces with the current 13 packages. Adding/removing packages mid-migration would force re-sequencing.
- `tsc --build` keeps the `rootDir: "src"`, `include: ["src"]` shape on every package's build configs. Any package that switches to tsup/rollup would need a different exclusion mechanism.
- Vitest stays at v4.x. The `projects` array shape and `coverage` config glob semantics are version-coupled.
- Node ≥22 stays the supported runtime. The migration uses `with { type: "json" }` import attributes for JSON fixtures; if Node policy changes, fall back to `JSON.parse(fs.readFileSync(...))` inside `__test-utils__/`.
- CI continues to provide `MAINNET_RPC_URL`, `BASE_RPC_URL`, etc. as secrets. Integration tests still need them; only unit tests stop needing them.
- Source code keeps using viem via `viem/actions` named imports. If style switches to client methods, the transport-level mock still works but a method-level mock would be a possible alternative.

## Dependencies

- `vitest` ^4.1.4 (already installed at root).
- `@vitest/coverage-v8` ^4.1.4 (already installed).
- `nock` (already a devDep of `liquidation-sdk-viem` and `liquidity-sdk-viem`; to be added to `blue-sdk-viem` and `bundler-sdk-viem`).
- `viem` ^2.41.2 — relies on `custom()` transport, `encodeFunctionResult`, `decodeFunctionData` (all already used elsewhere in the repo).
- TIB-2026-04-08 (TIB structure) — referenced by the template.
- PR #555 (TIB folder + template) — this TIB depends on it being merged or stacked on.

## Observability

- Coverage report (`pnpm test:coverage`, lcov + text-summary) becomes the primary signal. After Phase 1 the report should be runnable without RPC URLs; after each subsequent phase, the relevant package's per-file coverage should rise visibly.
- Build artifacts: `find packages/<pkg>/lib -name "*.test.*"` is the smoke check that excludes are working. CI can run this once at the end of the build job.
- `pnpm pack --dry-run` per package produces a file list — adding a CI assertion that no `*.test.*` or `__test-utils__` paths appear in the tarball is cheap defense-in-depth.

## Security

No new attack surface. The migration is a layout and tooling change, not a runtime change. Two minor considerations:

- **Test files in published artifacts**: if the `tsc` excludes are wrong, test code reaches `lib/` and ships to npm. Test code may import `vitest`/`nock` and reference test fixtures; this would not be malicious but is supply-chain noise. The build smoke check above prevents this.
- **`nock-setup.ts` calls `disableNetConnect()`**: tests that accidentally allow real network calls (e.g. forgetting to mock 1inch) would fail loudly rather than silently hit a real third-party API. This is an improvement; it eliminates the historical risk of leaked keys to live endpoints during tests.

## Future Considerations

- After all eight packages are migrated, `coverage.include` could be tightened further (e.g. specific subdirectories) and a coverage threshold (`coverage.thresholds.global`) could be enforced in CI.
- A linting rule (or biome custom rule, when available) could assert that every `src/Foo.ts` has a sibling `src/Foo.test.ts`. Out of scope for this TIB.
- The same mocking primitives in `@morpho-org/test/mock` could be reused by the out-of-scope packages (`migration-sdk-viem`, `simulation-sdk`) in a future TIB.
- `examples/` scripts in `liquidation-sdk-viem` are currently exercised by `test/examples/*.test.ts`. A future cleanup could move those examples to `src/__examples__/` and colocate their tests, removing the carve-out in `vitest.config.ts`.

## Open Questions

- Should the convention permit `src/Foo.test.ts` alongside `src/Foo.integration.test.ts` for the same source file, or should fork-only files keep just the `.integration.test.ts`? Lean towards "permit both, no requirement", but worth a sanity check on the first viem-using package to migrate (Phase 7).
- Coverage thresholds: should we set any in CI at the end of the migration, or leave coverage as an information-only signal? Decision deferred to a follow-up.

## References

- [PR #555 — `docs: add TIB template and folder`](https://github.com/morpho-org/sdks/pull/555)
- [`vitest.config.ts`](../../vitest.config.ts)
- [`packages/test/src/vitest.ts`](../../packages/test/src/vitest.ts) — existing `createViemTest` factory
- [`packages/blue-sdk-viem/test/setup.ts`](../../packages/blue-sdk-viem/test/setup.ts) — canonical fork fixture file (to be migrated to `src/__test-utils__/fixtures.ts`)
- [`packages/blue-sdk-viem/src/fetch/Market.ts`](../../packages/blue-sdk-viem/src/fetch/Market.ts) — canonical viem-action-using source whose new colocated unit test will exercise the transport mock pattern
