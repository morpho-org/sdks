# TIB-2026-04-27: Maximize unit-test coverage of SDK packages

| Field      | Value                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status** | Proposed                                                                                                                                               |
| **Date**   | 2026-04-27                                                                                                                                             |
| **Author** | @0xbulma                                                                                                                                               |
| **Scope**  | Repo-wide. In-scope packages: `morpho-ts`, `blue-sdk`, `blue-sdk-viem`, `bundler-sdk-viem`, `liquidation-sdk-viem`, `liquidity-sdk-viem`, `morpho-test`, `test`. Excluded: `simulation-sdk`, `simulation-sdk-wagmi`, `migration-sdk-viem`, `blue-sdk-wagmi`, `test-wagmi`. |

---

## Context

The SDKs ship calculation, fetching, encoding, and simulation primitives that downstream apps rely on for production money-movement. Coverage of these packages is uneven and largely fork-based: most existing tests instantiate an Anvil mainnet/Base fork through `createViemTest` and exercise the SDK against contract state, which means an ordinary developer cannot run the suite locally without paid RPC URLs, and pure functions (math, encoders, formatters, classes) are tested through a heavyweight integration harness rather than as isolated units.

Two practical consequences:

1. **Confidence gaps go undetected.** Files like `liquidation-sdk-viem/src/LiquidationEncoder.ts` (1,001 lines, the encoder that builds liquidation transactions) currently have **0%** line coverage in the lcov report. Several `augment/*.ts` files in `blue-sdk-viem`, `MetaMorphoAction.ts` (332 lines of action encoding), `liquidity-sdk-viem/src/loader.ts` (the only meaningful logic file in that package), and a long tail of small files have 0% as well. Whole logical groups — error classes, type modules, format helpers — are entirely untested.
2. **Coverage is unmeasurable locally.** Running `pnpm test:coverage` from a developer machine without `MAINNET_RPC_URL`/`BASE_RPC_URL` cannot complete: the public RPC (`eth.merkle.io`) rate-limits to HTTP 429 well before the fork-based projects finish. CI succeeds because it has paid RPC URLs.

We just adopted the TIB convention (PR #555). This TIB is the architectural decision recording how the SDK packages will reach high unit-test coverage. The migration to colocated test files is one of several conventions adopted to make this possible — it is **not** the headline.

## Goals / Non-Goals

**Goals**

- Push **unit-test** coverage of every in-scope package as close to 100% as practical, on every public function and every meaningful branch.
- Make `pnpm test:coverage` produce a complete, accurate report locally without requiring RPC URLs. This requires moving fork-dependent unit tests to mocked tests where the function under test does not actually need chain state.
- Establish reusable mocking primitives so contributors can write new unit tests without inventing fixtures: a viem transport-level mock, a `nock`-based HTTP/GraphQL pattern, deterministic test accounts.
- Keep existing fork-based **integration** tests — they exercise contract round-trips that mocks cannot — but separate them clearly from unit tests by file naming and CI gating.
- Adopt **colocation** (`src/Foo.test.ts` next to `src/Foo.ts`) as the file-layout convention so reviewers see test changes adjacent to source changes and gaps are obvious in directory listings.
- Exclude generated files (`abis.ts`, GraphQL `api/types.ts`, `api/sdk.ts`) from `coverage.include` so reported numbers reflect hand-written code.

**Non-Goals**

- Migrating layout or adding tests to the **out-of-scope** packages (`simulation-sdk`, `simulation-sdk-wagmi`, `migration-sdk-viem`, `blue-sdk-wagmi`, `test-wagmi`). Those keep their `test/` directories and current vitest project entries unchanged. A future TIB can extend the same conventions to them.
- Replacing vitest, biome, tsc, or pnpm. No new tools.
- Rewriting fork-based tests as mocked tests where the test purpose is end-to-end contract verification.
- Setting a numeric coverage threshold in CI as part of this TIB. The aim is "extensive coverage of every function," measured per-file qualitatively. A follow-up TIB can introduce thresholds once the floor is high enough.
- Hand-testing barrel `index.ts` files or generated `abis.ts` / `api/types.ts` — these are excluded from coverage.

## Current Solution

Each package owns a `test/` directory holding `setup.ts` (one or more custom `test` fixtures from `createViemTest(chain, { forkUrl, forkBlockNumber })`), `utils.ts`/`helpers.ts`, and `*.test.ts` files. Root `vitest.config.ts` declares twelve named projects with `include: ["packages/X/test/**/*.test.ts"]` and per-project timeouts (30/60/90 s). `coverage.include` is `packages/**/src/**`; `coverage.exclude` lists only the three test-utility packages — generated files are still counted.

`tsc --build tsconfig.build.{cjs,esm}.json` emits to `lib/{cjs,esm}` from `src/`. Tests live outside `src/`, so they never reach `lib/`.

Source files use `viem/actions` named imports — `import { readContract } from "viem/actions"; readContract(client, ...)` — not client methods. This is the key fact that drives the choice of mocking strategy.

### Coverage baseline (captured 2026-04-27)

Local run of `pnpm test:coverage --project <name> --coverage.reportOnFailure=true`, one project at a time, lcov merged across runs. Numbers are repo-wide (`coverage.include = packages/**/src/**`) so each project's number is the contribution of *that project's tests* to total repo coverage. Fork-based projects fail tests due to RPC rate-limit; coverage is captured anyway via `reportOnFailure`. CI numbers are higher because forks succeed there.

| Project              | Test files (pass / fail) | Tests (pass / fail) | Statements | Branches | Functions | Lines    |
| -------------------- | ------------------------ | ------------------- | ---------- | -------- | --------- | -------- |
| morpho-ts            | 3 / 0                    | 112 / 0             | 4.10%      | 3.77%    | 4.76%     | 4.02%    |
| blue-sdk             | 6 / 1                    | 31 / 2              | 8.69%      | 4.83%    | 10.33%    | 8.77%    |
| blue-sdk-viem        | 2 / 10                   | 23 / 24             | 13.20%     | 7.20%    | 13.96%    | 13.77%   |
| bundler-sdk-viem     | 2 / 3                    | 7 / 36 (3 skip)     | 21.50%     | 17.38%   | 18.96%    | 22.15%   |
| liquidation-sdk-viem | 0 / 4                    | 0 / 14              | 9.25%      | 2.13%    | 5.32%     | 9.73%    |
| liquidity-sdk-viem   | 0 / 1                    | 0 / 2               | 9.41%      | 1.90%    | 5.64%     | 9.90%    |
| test                 | 0 / 1                    | 0 / 1               | 0%         | 0%       | 0%        | 0%       |
| **Combined (all in-scope)** | **13 / 20**       | **173 / 79 (3 skip)** | **41.57%** | **28.83%** | **41.80%** | **42.74%** |

**Per-package line coverage (lcov-merged, in-scope packages bolded):**

| Package                   | Lines (LF) | Hit (LH) | Coverage |
| ------------------------- | ---------- | -------- | -------- |
| **liquidity-sdk-viem**    | 244        | 200      | 81.97%   |
| **morpho-ts**             | 299        | 235      | 78.60%   |
| **blue-sdk**              | 894        | 616      | 68.90%   |
| **blue-sdk-viem**         | 407        | 231      | 56.76%   |
| **liquidation-sdk-viem**  | 617        | 248      | 40.19%   |
| **bundler-sdk-viem**      | 845        | 298      | 35.27%   |
| simulation-sdk-wagmi      | 44         | 36       | 81.82%   |
| blue-sdk-wagmi            | 345        | 186      | 53.91%   |
| simulation-sdk            | 857        | 221      | 25.79%   |
| migration-sdk-viem        | 761        | 0        | 0.00%    |

**Files at 0% line coverage in in-scope packages** (excluding barrel `index.ts`):

| Package              | Zero-coverage files of note                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| morpho-ts            | `format/array.ts`, `format/string.ts`, `types.ts`                                                                                                                                                                                                                                                                            |
| blue-sdk             | `holding/AssetBalances.ts`, `token/ExchangeRateWrappedToken.ts`, `vault/VaultUser.ts`                                                                                                                                                                                                                                        |
| blue-sdk-viem        | `MetaMorphoAction.ts` (**332 LOC, action encoders**), `error.ts`, `types.ts`, `fetch/MarketParams.ts`, `fetch/VaultUser.ts`, `augment/VaultConfig.ts`, `augment/VaultMarketAllocation.ts`, `augment/VaultMarketPublicAllocatorConfig.ts`, `augment/VaultUser.ts`                                                            |
| bundler-sdk-viem     | `errors.ts`, `types/actions.ts`                                                                                                                                                                                                                                                                                              |
| liquidation-sdk-viem | `LiquidationEncoder.ts` (**1,001 LOC, the largest untested surface**), `positions/getters.ts`, `preLiquidation/helpers.ts`, `preLiquidation/positionGetters.ts`, `preLiquidation/types.ts`, `swap/index.ts`, `swap/types.ts`, `tokens/sky.ts`                                                                                |
| liquidity-sdk-viem   | `loader.ts` (**the only logic file in this package**)                                                                                                                                                                                                                                                                        |

**Files at < 30% line coverage** worth flagging:

- `bundler-sdk-viem/src/BundlerAction.ts`: 16.52% (37 / 224 lines) — heavy encoder.
- `liquidation-sdk-viem/src/api/index.ts`: 3.45% — GraphQL loader.
- `liquidation-sdk-viem/src/flashbots.ts`: 11.76%.
- `liquidation-sdk-viem/src/swap/paraswap.ts`: 20%.
- `liquidation-sdk-viem/src/tokens/midas.ts`: 2.70% (1 / 37 lines).
- `liquidation-sdk-viem/src/tokens/spectra.ts`: 6.25%.

## Proposed Solution

Reach high unit-test coverage of the eight in-scope packages by writing **mocked unit tests** for every untested function — using viem's `custom()` transport for RPC and `nock` for HTTP/GraphQL — and migrating the existing test files to a colocated layout that makes gaps visible.

The conventions below are means to that end, not the end itself.

### Convention 1 — Colocation

Test files live next to source files. `src/Foo.ts` ⇒ `src/Foo.test.ts`. Naming follows source casing (`MathLib.test.ts` for PascalCase; `format.test.ts` for camelCase). Never `.spec.ts`. Fork-bound tests use the `*.integration.test.ts` infix (still matched by `**/*.test.ts`; the infix is informational and lets future CI carve out integration runs if needed).

```
packages/X/
├── src/
│   ├── Foo.ts
│   ├── Foo.test.ts                  # mocked unit test
│   ├── Foo.integration.test.ts      # fork test (optional, only where needed)
│   ├── sub/
│   │   ├── Bar.ts
│   │   └── Bar.test.ts
│   └── __test-utils__/
│       ├── fixtures.ts              # was test/setup.ts
│       ├── nock-setup.ts            # for HTTP-using packages
│       └── <package-specific>.ts
└── (test/ deleted after migration)
```

### Convention 2 — Mock viem at the transport level

Source uses `import { readContract } from "viem/actions"; readContract(client, args)`. Those action functions read from `client.transport`, not from `client.readContract`. Stubbing client methods with `vi.spyOn` does **not** intercept them. Mock at the transport.

A new shared helper module `packages/test/src/mock.ts` is added and exposed via a new `./mock` sub-export in `packages/test/package.json` (`exports`, `typesVersions`, `publishConfig.exports` — three sites):

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

Used by every test of `fetch/*.ts`, `queries/*.ts`, augmenters, and encoders that internally call viem actions.

### Convention 3 — Mock HTTP / GraphQL with `nock`

`nock` is already a devDep in `liquidation-sdk-viem` and `liquidity-sdk-viem`. Add it to `blue-sdk-viem` and `bundler-sdk-viem`. Each HTTP-using package gets `src/__test-utils__/nock-setup.ts`:

```ts
import nock from "nock";
nock.disableNetConnect();
nock.enableNetConnect("127.0.0.1");
```

Wired in via `setupFiles` on that project's vitest entry. Per-test mocks are scoped via `beforeEach` / `afterEach(() => nock.cleanAll())`. GraphQL is mocked at the same HTTP layer (e.g. `nock(BLUE_API_BASE_URL).post("/graphql").reply(200, fixture)`) — never via `vi.mock("./api/sdk.js", ...)` because of concurrent-test races (`sequence: { concurrent: true }` is global) and codegen-shape coupling.

### Convention 4 — Keep fork tests, but separate them

Existing fork tests stay. They are renamed `Foo.integration.test.ts` and relocated next to source. They remain in the same vitest project as the unit tests for now (the include glob `**/*.test.ts` matches both); a follow-up can split them into a separate project gated on RPC URL availability.

### Configuration changes

- **`vitest.config.ts` — projects.** Each in-scope project's `include` flips from `packages/X/test/**/*.test.ts` to `packages/X/src/**/*.test.ts`. Special carve-out for `liquidation-sdk-viem` to keep `test/examples/` running:
  ```ts
  include: [
    "packages/liquidation-sdk-viem/src/**/*.test.ts",
    "packages/liquidation-sdk-viem/test/examples/**/*.test.ts",
  ],
  ```
  Out-of-scope projects keep their existing `test/` includes.

- **`vitest.config.ts` — coverage.** Tighten `exclude` so generated/test code does not pollute the report:
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
      "packages/**/src/**/index.ts",
      "packages/**/src/**/*.d.ts",
      "packages/**/src/**/abis.ts",
      "packages/**/src/api/sdk.ts",
      "packages/**/src/api/types.ts",
    ],
  },
  ```
  Excluding barrel `index.ts` files removes the long zero-coverage tail that has no real code; excluding `abis.ts` and the GraphQL codegen output removes ~30 KLOC of generated code from the denominator. Expect baseline coverage numbers to jump materially after this change alone.

- **Per-package build excludes.** Both `tsconfig.build.cjs.json` and `tsconfig.build.esm.json` get an `exclude`:
  ```json
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test-d.ts",
    "src/**/__test-utils__/**",
    "src/**/__mocks__/**",
    "src/**/__fixtures__/**"
  ]
  ```
  Apply to all 8 in-scope packages. Dev `tsconfig.json` keeps `"include": ["src"]` so test files type-check during `tsc --noEmit`.

- **`packages/test/package.json`.** Add `./mock` sub-export pointing at `packages/test/src/mock.ts` in `exports`, `typesVersions`, and `publishConfig.exports` (three mirrored sections — easy to miss one).

- **`nock` devDep.** Add to `blue-sdk-viem` and `bundler-sdk-viem`.

### Implementation Phases

Ordered easiest-first: each phase validates the conventions and primitives that the next one depends on. One PR per phase, stacked on this TIB's branch.

- **Phase 1 — `morpho-ts`** *(target: ≥ 95% line coverage, ≥ 90% branch).* Pure TS utilities, no mocking. Migrates `test/{format,time,utils}.test.ts` to colocated. Adds tests for the three currently-zero files: `format/array.ts`, `format/string.ts`, `types.ts`. Validates the colocation tooling (vitest include update, tsconfig excludes, coverage excludes).

- **Phase 2 — `packages/test` + new `src/mock.ts`** *(target: ≥ 80%, the rest is anvil bootstrap).* Introduces `createMockClient` / `mockRead` and the `./mock` sub-export. Adds tests for `mock.ts`, `fixtures.ts` (`randomAddress`, `testAccount`), `vitest.ts`, and the non-fork-bound logic of `anvil.ts` and `client.ts` (arg builders, action wiring shape).

- **Phase 3 — `blue-sdk`** *(target: ≥ 90% line, ≥ 85% branch).* Largest pure-logic package. Migrates `test/unit/*.test.ts` and renames `test/e2e/Market.test.ts` to `Market.integration.test.ts`. Adds tests for every untested file: `math/MathLib.ts`, `math/AdaptiveCurveIrmLib.ts`, `math/SharesMath.ts`, `errors.ts`, `addresses.ts`, `chain.ts`, `preLiquidation.ts`, all token classes (incl. zero-coverage `ExchangeRateWrappedToken.ts`), `holding/AssetBalances.ts` (zero-coverage), `Position`, `PreLiquidationPosition`, every vault class incl. `VaultUser.ts` (zero-coverage), all v2 vault adapters, `MarketParams`. Uses `randomMarket` / `randomVault` from `@morpho-org/morpho-test`.

- **Phase 4 — `morpho-test`** *(target: meaningful tests on every fixture).* Tests confirm each fixture passes the validators its consumers apply (e.g. `MarketParams` constructor accepts the shape; vault decimals offsets are valid).

- **Phase 5 — `liquidity-sdk-viem`** *(target: ≥ 95%).* Smallest viem package; establishes the canonical nock + GraphQL pattern. Migrates `test/loader.test.ts`. **Adds tests for `loader.ts`** (currently 0% — the only logic in the package). Adds smoke-level tests for `api/sdk.ts`.

- **Phase 6 — `bundler-sdk-viem`** *(target: ≥ 90%).* Pure encoders; no RPC dependency. Migrates `test/helpers.ts` to `src/__test-utils__/bundle-helpers.ts`. Round-trip tests for `BundlerAction.ts` (currently 16.52%), `actions.ts`, `operations.ts`, `ActionBundle.ts`, `bundle.ts`, `errors.ts` (zero-coverage), `types/actions.ts` (zero-coverage), `types/operations.ts`. Use viem's `decodeFunctionData` to assert the recovered structure matches the encoder input on each public method.

- **Phase 7 — `blue-sdk-viem`** *(target: ≥ 85%).* Largest viem-using surface. Migrates 12 existing fork tests as `*.integration.test.ts`. Adds **mocked** unit tests for every `fetch/*.ts` (incl. zero-coverage `MarketParams.ts` and `VaultUser.ts`) and `queries/*.ts` using `createMockClient` + `mockRead`. **Adds tests for `MetaMorphoAction.ts` (zero-coverage, 332 LOC of encoders)** by ABI round-tripping every public encoder. Adds tests for `utils.ts`, `error.ts`, `types.ts`, and every `signatures/*.ts` (deterministic test private keys; assert signature shape and recoverable signer). Adds tests for the 4 zero-coverage `augment/Vault*.ts` files (assert the expected static/instance methods are attached).

- **Phase 8 — `liquidation-sdk-viem`** *(target: ≥ 80%).* Largest external-service surface; goes last so the patterns are settled. Keeps `test/examples/*.test.ts` in place via the union include. Migrates other tests, adds nock-based tests for `swap/1inch.ts`, `swap/paraswap.ts`, `swap/index.ts` (zero-coverage), `flashbots.ts`, `api/index.ts`. **Adds unit tests for `LiquidationEncoder.ts` (zero-coverage, 1,001 LOC)** — the single largest gap in the repo — split into multiple `describe` blocks per public method, with `mockRead` for the swap-quote RPC dance and `nock` for the upstream price/quote APIs. Adds unit tests for `positions/getters.ts`, `preLiquidation/helpers.ts`, `preLiquidation/positionGetters.ts` (all zero-coverage), `addresses.ts`, `thresholds.ts`, all `tokens/*.ts` (incl. zero-coverage `sky.ts`, low-coverage `midas.ts` 2.70%, `spectra.ts` 6.25%, `pendle.ts`).

Each phase's PR ends with: tests pass; `find packages/X/lib -name "*.test.*"` after build returns empty; `pnpm pack --dry-run` shows no test files; the project's coverage rises to its phase target; the relevant zero-coverage files listed above are no longer at zero.

## Considered Alternatives

### Alternative 1: Add tests in existing `test/` directories without changing layout

Leave the test layout alone; only add new tests in the existing `test/` folders.

**Why rejected:** Misses the visibility benefit of colocation — gaps in test coverage stay invisible in directory listings, and reviewers must context-switch between two trees. The cost of moving existing tests is low (mostly path rewrites) and pays back permanently.

### Alternative 2: Keep tests fork-based; just add more

Continue using `createViemTest` for everything new.

**Why rejected:** Doesn't solve the fundamental measurability problem. `pnpm test:coverage` would still need paid RPC URLs to complete; pure-function tests stay coupled to a forked chain; CI cost stays elevated. The point of this TIB is partly to make the suite locally runnable, partly to test pure logic without dragging in chain state.

### Alternative 3: Mock `client.readContract` with `vi.spyOn`

Stub viem actions on the client object instead of intercepting at the transport.

**Why rejected:** Doesn't work. Source uses `import { readContract } from "viem/actions"; readContract(client, args)`. Those action functions resolve through `client.transport`, not via methods on the client object. Spying on the client method is silently a no-op. Transport-level interception with `viem.custom()` is the only correct primitive.

### Alternative 4: Use `msw` for HTTP mocking

Adopt Mock Service Worker for HTTP and GraphQL.

**Why rejected:** `nock` is already in the repo. Adding `msw` introduces a second tool with overlapping responsibilities and a heavier setup (server lifecycle, handler registration). `nock` handles the unit-test scope here.

### Alternative 5: One large PR

Land all of it in a single PR.

**Why rejected:** Eight packages, hundreds of files, a convention change, and a new shared mock utility. Per-phase PRs let reviewers validate the canonical patterns on `morpho-ts` and `packages/test` before they propagate, and let regressions be bisected to a single package.

### Alternative 6: Set a numeric coverage threshold in CI now

Wire a `coverage.thresholds.global` value into `vitest.config.ts` to fail CI below a percentage.

**Why rejected:** Premature. The current floor (after generated-file exclusion is applied) is unknown; setting a threshold before the tests are written either rubber-stamps a low number or fails CI immediately. A follow-up TIB after Phase 8 can introduce thresholds with concrete data.

## Assumptions & Constraints

- The repo retains pnpm workspaces with the current 13 packages. Adding/removing packages mid-migration would force re-sequencing.
- `tsc --build` keeps the `rootDir: "src"`, `include: ["src"]` shape. Any package that switches to tsup/rollup needs a different exclusion mechanism.
- Vitest stays at v4.x; the `projects` array shape and `coverage` config glob semantics are version-coupled.
- Node ≥22 stays the supported runtime. JSON fixtures use `with { type: "json" }`; if Node policy changes, fall back to `JSON.parse(fs.readFileSync(...))` inside `__test-utils__/`.
- CI continues to provide `MAINNET_RPC_URL`, `BASE_RPC_URL`, etc. as secrets. Integration tests still need them; mocked unit tests do not.
- Source code keeps using viem via `viem/actions` named imports. If style switches to client methods, the transport-level mock still works; a method-level mock would also become viable.

## Dependencies

- `vitest` ^4.1.4 and `@vitest/coverage-v8` ^4.1.4 (already at root).
- `nock` (already in `liquidation-sdk-viem` and `liquidity-sdk-viem`; to be added to `blue-sdk-viem` and `bundler-sdk-viem`).
- `viem` ^2.41.2 — relies on `custom()` transport, `encodeFunctionResult`, `decodeFunctionData` (already used elsewhere).
- TIB-2026-04-08 (TIB structure) — referenced by the template.
- PR #555 (TIB folder + template) — this TIB depends on it being merged or stacked on.

## Observability

- **Coverage report** (`pnpm test:coverage`, lcov + text-summary) becomes the primary signal. After Phase 1 the report should be runnable without RPC URLs; after each subsequent phase, the relevant package's per-file coverage should rise visibly. The captured baseline (per-package table above) is the comparison reference.
- **CI smoke checks**:
  - `find packages/<pkg>/lib -name "*.test.*"` after build — must be empty.
  - `pnpm pack --dry-run` per published package — file list must contain no `*.test.*` or `__test-utils__` paths.
- **Per-file zero-coverage tracking**: keep an eye on the file list in the baseline above; each phase reduces it.

## Security

No new attack surface. The migration is layout and tooling, not runtime. Two minor considerations:

- **Test files in published artifacts.** If the `tsc` excludes are wrong, test code reaches `lib/` and ships to npm. Test code may import `vitest`/`nock` and reference fixtures; not malicious but supply-chain noise. The build smoke check above prevents this.
- **`nock-setup.ts` calls `disableNetConnect()`.** Tests that accidentally allow real network calls (e.g. forgetting to mock 1inch) fail loudly rather than silently hit a real third-party API. This is an improvement over the status quo.

## Future Considerations

- Once all eight packages are migrated and coverage stabilizes, set `coverage.thresholds.global` in `vitest.config.ts` to lock in the floor (separate TIB).
- A lint rule (or biome custom rule, when available) could assert that every `src/Foo.ts` has a sibling `src/Foo.test.ts`. Out of scope for this TIB.
- The same mocking primitives in `@morpho-org/test/mock` could be extended to the out-of-scope packages (`migration-sdk-viem`, `simulation-sdk`, the wagmi packages) in follow-up TIBs.
- `examples/` scripts in `liquidation-sdk-viem` are currently exercised by `test/examples/*.test.ts`. A future cleanup could move them to `src/__examples__/` and colocate their tests, removing the carve-out in `vitest.config.ts`.
- The `*.integration.test.ts` infix lets a future config split fork-based tests into a dedicated vitest project gated on RPC availability — useful for offering a `pnpm test:unit` that runs without RPC.

## Open Questions

- Should the convention permit `src/Foo.test.ts` and `src/Foo.integration.test.ts` *both* for the same source file, or should fork-only files keep just the `.integration.test.ts`? Lean towards "permit both" — the typical case in `blue-sdk-viem` is a fetch function with a mocked unit test for shape/decoding plus an integration test for end-to-end behavior. Worth confirming on the first viem-using package to migrate (Phase 7).
- Should the integration tests be split into their own vitest project now, or in a follow-up? Splitting now adds config complexity; deferring keeps this TIB tight. Recommendation: defer.
- Are there any in-scope packages that legitimately *cannot* be unit-tested without a fork (e.g. pure RPC plumbing whose entire purpose is the round-trip)? Phase 7 will surface candidates; if found, those files keep only an `.integration.test.ts` and are excluded from the coverage `include`.

## References

- [PR #555 — `docs: add TIB template and folder`](https://github.com/morpho-org/sdks/pull/555)
- [`vitest.config.ts`](../../vitest.config.ts)
- [`packages/test/src/vitest.ts`](../../packages/test/src/vitest.ts) — existing `createViemTest` factory.
- [`packages/blue-sdk-viem/test/setup.ts`](../../packages/blue-sdk-viem/test/setup.ts) — canonical fork fixture file (to be migrated to `src/__test-utils__/fixtures.ts`).
- [`packages/blue-sdk-viem/src/fetch/Market.ts`](../../packages/blue-sdk-viem/src/fetch/Market.ts) — canonical viem-action-using source whose new colocated unit test will exercise the transport mock pattern.
- [`packages/liquidation-sdk-viem/src/LiquidationEncoder.ts`](../../packages/liquidation-sdk-viem/src/LiquidationEncoder.ts) — largest single zero-coverage file (1,001 LOC).
