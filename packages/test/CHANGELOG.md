# @morpho-org/test

## 2.9.0

### Minor Changes

- [#944](https://github.com/morpho-org/sdks/pull/944) [`3fe836b`](https://github.com/morpho-org/sdks/commit/3fe836b3374a2d8896d0b7bdbba36fd30aa120b0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Make unexpected Anvil exits and failed shutdowns surface without poisoning Vitest retries, clean up child processes when startup fails, cover the configured fork retry budget with an overridable startup deadline, let state dumps finish gracefully by default with a configurable force-kill delay, and redact exact fork URLs and header values from Anvil diagnostics in CI unless explicitly disabled.

  Require Vitest 2.1.2 or newer so per-attempt cleanup failures participate in Vitest retries.

  This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.

## 2.8.4

### Patch Changes

- [#914](https://github.com/morpho-org/sdks/pull/914) [`d45fffa`](https://github.com/morpho-org/sdks/commit/d45fffad3b2d6f5182b1a0d31a7d8a55cf4eaad2) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh SDK dependencies and update TypeScript configuration and test helper types for TypeScript 7. No peer range widening was required; GraphQL remains on the latest compatible v16 because its direct consumers do not support v17. Remove the obsolete ox compatibility patch now fixed upstream.

## 2.8.3

### Patch Changes

- [#815](https://github.com/morpho-org/sdks/pull/815) [`e7578c3`](https://github.com/morpho-org/sdks/commit/e7578c3c205c3559bf1b7498030d818a0cc04220) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add first-iteration Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for the markets-app taker, maker, redeem, repay/withdraw, and cancel flows.

  The Midnight entity returns lazy action outputs with `getRequirements()` and synchronous `buildTx(...)` methods, matching the existing `morpho-sdk` action pattern while accepting fixed-rate API quote takeable offers directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

  Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, while `redeem` consumes a single caller-provided `positionData` snapshot that includes its hydrated market. Maker-offer action builders consume caller-provided `offersData` from `getOffersData(...)`, which creates the tree from the same entries accepted by `Tree.create(...)` and runs mempool validation. `getMarketData(...)`, `getPositionData(...)`, and `getOffersData(...)` remain async helpers so integrators can prepare state once, compose UI/validation around it, and then build transactions without hidden reads. Callers can pin several reads to one externally fetched block by forwarding its `blockNumber` through the fetch parameters.

  Midnight Bundles token pulls use approval-based execution in this first iteration: `getRequirements()` returns ERC20 approval calls, and encoded bundle calls pass `PermitKind.None`. ERC2612 token permits, Permit2 SignatureTransfer token pulls, unit-target take helpers, exposed taker `reduceOnly`, referral fee controls, max-continuous-fee controls, and generic collateral withdrawal lists are left to follow-up work.

  Allow fork tests to select Anvil's Osaka hardfork so deployed Midnight bytecode using the `CLZ` opcode can be exercised end to end.

  Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. Public maker flows are exposed through async entity methods such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`; they accept raw offer or group inputs, prepare and validate `offersData` internally, then return lazy requirement and transaction handles. Maker submit metadata exposes all submitted group ids, and the ratifier helpers enforce that the submitted tree uses one ratifier.

  Named take transaction builders validate that their takeable offers match the expected maker side, and named maker entity flows validate that prepared maker trees match the expected maker side. Borrow takes require a positive `maxUnits`, repayment-withdrawal flows reject unknown collateral indexes before exposing requirements, and partial group cancellation rejects amounts outside the onchain offer-cap range. `getOffersData(...)` stays side-agnostic so callers can prepare any valid tree.

  Validation runs before requirements are exposed: takeable offers must match the requested flow, redemption cannot exceed position credit, approval amounts and operators are checked before allowance short-circuits, and market inputs must belong to the selected Midnight deployment. Maker preparation also preserves caller-owned offer group arrays.

  Bind security-sensitive flow artifacts to their preparation context: Ecrecover submissions use the canonical payload retained for the signed tree instead of trusting payload bytes supplied to `buildTx`, typed-data signing rejects wallets on another chain, and redemption accepts only owner-bound position snapshots for the requested account.

## 2.8.2

### Patch Changes

- [#849](https://github.com/morpho-org/sdks/pull/849) [`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Harden Midnight SDK API, fetch, offer, group, tree, and package-export behavior for Cantina audit findings.

## 2.8.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

## 2.8.0

### Minor Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - Add `./mock` sub-export providing `createMockClient`, `mockRead`, and `expectReadCall` for transport-level viem mocking in unit tests. The mock installs a `vi.fn`-backed `custom()` transport on a real viem `Client`, so SDK code that uses `viem/actions` named imports (e.g. `readContract(client, …)`) resolves through it just as it would against a live RPC. `mockRead` matches every overload of a function name, so reads against contracts with overloaded `view`/`pure` methods don't silently miss.

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `mockRead` (from `@morpho-org/test/mock`) now ABI-encodes the supplied `result` **per overload** of the target function name rather than once against the ambiguous `functionName`. For ABIs where overloads share a return type the behaviour is unchanged (the same bytes are stored under every selector). For ABIs where overloads have **different** return types — e.g. `counter(uint256) returns (uint256)` and `counter(address) returns (bool)` — the encoded bytes now match each overload's declared output shape, so an `eth_call` to the bool overload no longer receives uint256-shaped bytes. If the supplied `result` does not match the return shape of **any** overload, `mockRead` now throws a clear `Error` (`"[mockRead] options.result does not match any return-type shape of overloads of <name>"`) instead of silently registering bytes that decode incorrectly.

  (Drive-by packaging cleanup: the previously-advertised CJS `require` condition for `./mock` is removed from `publishConfig.exports` and `mock.ts` is excluded from the CJS build. The entry was crash-on-load — `mock.ts` imports vitest, which rejects `require()` — so no working consumer is affected; only the unusable metadata is gone.)

## 2.7.3

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.
