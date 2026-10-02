---
name: sdk-evidence
description: Assess tests and documentation for changed public behavior, failure branches, protocol invariants, generated schemas, fork boundaries, examples, Markdown references or repository rules.
---

# Tests and documentation

Read root `AGENTS.md` §2 rule6, §5–6 and §9, affected package/test instructions, docs/jsdoc-style.md and actual Vitest routing. For each changed contract, identify a plausible wrong implementation and whether tests would reject it and documentation would help an integrator use it correctly.

## Proof of behavior

- Apply public-surface unit coverage and entity-fetcher integration commitments. Check new branches/errors, zero/maximum and relevant negative bigint/empty inputs, signature changes and generated/schema assertions. Public-contract tests can cover an internal helper without a separate helper test.
- Require discriminating assertions for relevant routing, inflation, LLTV, chain, authorization and accounting invariants. Test existence or a happy-path snapshot alone does not establish those outcomes.
- Encoder property tests and inline transaction snapshots follow root adoption guidance; changed snapshots must reflect intended output. Assert errors by class identity. Deterministic factories, isolated state and established morpho-test/test helpers support reliable evidence.
- Source unit tests are colocated *.test.ts; test-support unit tests stay beside their modules. Integration/fork tests use the package's singular test/ and *.integration.test.ts. Vitest projects must select them without silently omitting coverage or moving RPC work into unit runs. Keep support out of published runtime paths.
- Pure functions need no client/fork. createMockClient from @morpho-org/test/mock may test encoders, deserialization, validation, augmentation and shaped-response fetchers without real-state dependence. It intercepts transport; direct spies on client/action methods may miss viem/actions calls.
- Contract round-trips, oracles, accrual, live-IRM position health, multicall/deployless aggregation and contract reverts require pinned Anvil evidence via @morpho-org/test. Inspect fetcher integration and package backend-parity obligations alongside allowed unit mocks.

## Usable and accurate contracts

- Apply canonical JSDoc to new/modified exported classes/functions/types/constants. Verify descriptions, parameters, return shapes, typed throws and realistic examples against implementation and docs/jsdoc-style.md. The canonical guide exempts @internal symbols, non-barrel exports, test fixtures/helpers and generated API outputs.
- Examples need the guide's resolvable imports, setup and realistic calls/outputs. Domain type names, consistent overlapping protocol signatures, obvious discriminants and actionable errors support human and agent integrators.
- Reconcile affected README, AGENTS, MISSION, CONTRIBUTING, SECURITY and other active docs with changed behavior. CLAUDE symlinks are the same source. Update affected package/chain/command/criterion inventories and inspect renamed/removed symbol references and touched links/anchors.
- Historical TIBs preserve implementation-time names/examples. A new decision supersedes them; an operational clarification uses a dated addendum. Only a TIB introduced with the current implementation evolves alongside it before landing.
- For changed rules, follow owning AGENTS guidance to active review criteria and back. Configuration integrity uses `developer-workflow`; obsolete persona inventory is not a permanent requirement on the replacement.

Finish with meaningful proof and correct applicable documentation or precise gaps. Distinguish inspected assertions/examples from executed tests/compilation. Missing execution capability is not itself a code defect; report a missing test or documentation obligation with the contract it leaves unprotected or misleading. Cosmetic prose and unrelated optional expansion are not findings.
