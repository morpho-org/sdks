---
name: sdk-test-coverage
description: Use for changed public behavior, new/error branches, tests or Vitest routing, generated schemas, or RPC/contract paths requiring transport or pinned-fork evidence.
---

# SDK behavior and fork evidence

Read root `AGENTS.md` §2 rule 6 and §5, the owning package instructions, actual tests and Vitest routing. For each changed contract identify a plausible wrong implementation and whether the supplied assertions would reject it.

## Behavioral coverage

- Apply the public-surface unit coverage commitment and entity-fetcher integration commitment. Check new branches, typed errors, zero/maximum quantities, relevant negative bigint/empty-input cases, changed signatures and updated generated/schema assertions. An internal helper needs no separate test if its public contract is exercised.
- Security invariants need discriminating evidence: deposit routing, inflation guard, LLTV buffer, chain validation, authorization and accounting. Check assertions and fixture paths, not just file presence or happy-path snapshots.
- Encoder property tests and inline transaction snapshots follow the root's adoption guidance. Snapshot changes must correspond to intended transaction changes. Error assertions use class identity; test isolation and deterministic factories preserve independence.

## Correct boundary and placement

- Source unit tests are colocated as `*.test.ts`. Unit tests of test-only support modules stay beside those modules. Integration/fork tests live under the package's singular `test/` as `*.integration.test.ts`. Vitest projects must select the intended sets without leaking RPC-heavy tests into unit runs or silently omitting either set.
- Pure helpers need no viem client or Anvil. Transport-boundary unit tests may use `createMockClient` from `@morpho-org/test/mock` for encoders, deserialization, validation, augmentation and shaped-response fetchers that do not depend on real state.
- Contract round-trips and real-state-dependent correctness (oracles, accrual, position health under live IRMs, multicall/deployless aggregation, contract reverts) require pinned Anvil evidence via `@morpho-org/test`. A transport mock alone cannot establish chain agreement. Inspect the entity-fetcher integration commitment alongside the permitted shaped-response unit test.
- Direct spies/mocks on client or viem action methods can miss `viem/actions` named-import calls; inspect whether the test intercepts the actual transport. Reuse established morpho-test/test helpers rather than demand a new harness.
- Keep test support out of published runtime paths and package builds. Package-specific backend parity and fork obligations remain applicable.

State the regression left unprotected and the relevant written obligation for any finding. Report static coverage separately from executed results. An unavailable RPC or test-execution capability limits proof; it does not itself establish a code defect. Complete when the changed public mechanisms have meaningful evidence or explicit gaps.
