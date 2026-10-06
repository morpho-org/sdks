---
name: sdk-evidence
description: Tests and documentation in morpho-org/sdks-internal. Use when a change adds or modifies exports, onchain code paths, entity flows, tests, Vitest config, JSDoc, examples, README, AGENTS.md, ADRs or other Markdown, or renames files that docs point at. Checks that tests would catch a realistic regression at the right boundary (pure, mocked transport, or pinned Anvil fork), that JSDoc and docs match the code, and that links resolve. Not for whether the code itself is correct (the other sdk-* skills).
---

# Tests and documentation

This skill applies the `test-coverage` and `documentation` personas in
`.agents/pr-review-engine/agents/` and root `AGENTS.md` §5 and §6. They are
authoritative; when wording differs, they win and this file is out of date.

Tests and docs are the evidence a change works and the instructions the next
integrator or agent follows. Missing evidence is not a defect in the code;
report it as missing evidence, with what it leaves unproven.

Apply each section only when its condition holds.

## 1. Changed behavior has a test that would fail

**Applies when** the diff changes exported behavior or an onchain code path.

- New exports have a colocated unit test, and new branches, error paths and
  edge cases (`0n`, `MAX_UINT256`, negative `bigint`, empty arrays) have
  cases. Modified exports have their tests updated; tests that still
  describe the old behavior are a false pass.
- Internal symbols don't need their own tests when the public surface that
  covers them is tested.
- An assertion must tell the intended behavior from a realistic regression.
  The §5 security invariants (deposit routing, inflation-attack guard, LLTV
  buffer, `chainId` validation, authorization, accounting) each have a test
  that fails if the invariant is removed.
- Errors are asserted by class (`rejects.toBeInstanceOf`), not message text.
  Inline snapshots of transaction shapes are re-recorded only for an intended,
  reviewed change.
- Snapshot or schema tests follow changes to generated GraphQL types or ABIs.
- A new or changed entity flow that consumes a `RequirementSignature` has a
  cross-handle test: prepare and sign on handle A, then check that
  `buildTx(signatures)` on a fresh handle B equals A's. It must fail if
  `buildTx` starts reading state written during signing
  (`docs/adrs/ADR-2026-09-23-stateless-entity-flows.md`).

## 2. The right test boundary

**Applies when** the diff adds or changes tests or Vitest projects.

- **Pure code** needs neither a client nor Anvil.
- **Mocked transport** (`createMockClient` from `@morpho-org/test/mock`) is
  right for unit tests of code that calls `viem/actions` without depending on
  real chain state: encoders, decoding, validation, wiring, shaped responses.
  `vi.mock` or `vi.spyOn` of viem actions or `client.readContract` is wrong:
  the actions resolve through `client.transport`, so the spy silently misses.
- **Pinned Anvil forks** (`@morpho-org/test`) are required where correctness
  depends on real chain state: oracles, accrual, position health under live
  IRMs, multicall and deployless reads, revert behavior.
- Unit tests are `*.test.ts` beside their module; integration and fork tests
  are `*.integration.test.ts` under `packages/<pkg>/test/` only (singular
  `test/`). Vitest unit and fork projects route the two sets separately.
- Point at existing helpers in `@morpho-org/test` rather than asking for new
  infrastructure.

## 3. JSDoc on exports

**Applies when** the diff adds or changes a symbol exported through
`src/index.ts`.

Read `docs/jsdoc-style.md` and use its checklist. Public exports carry a
description, `@param`, `@returns`, `@throws` for each typed error an
integrator may catch, and one runnable `@example`. The doc matches the code:
no renamed arguments, removed return values or changed throws left behind.
Public type parameters use domain names. Internal symbols don't need JSDoc.

## 4. Markdown matches the code

**Applies when** the diff changes Markdown, or changes code that Markdown
describes.

- Read the affected `README.md`, `AGENTS.md`, `MISSION.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `docs/**` and reviewer files. `CLAUDE.md` is a symlink to
  `AGENTS.md`; don't check it twice.
- Flag stale prose, inventories that no longer match (packages, personas,
  chains, commands), and code blocks that no longer run.
- A rule changed in `AGENTS.md` changes in every persona its
  `> Applied by personas:` callout names, and in `.review/`.
- Links, anchors and path references in changed files resolve. A rename or
  removal updates every reference to the old path; grep for the old name.
- Don't ask for new docs unless the diff changed what they would describe.

## 5. Accepted ADRs are historical

**Applies when** the diff touches `docs/adrs/`.

An ADR already on the target branch keeps its implementation-time names and
examples, including those migrated from the retired `docs/tibs/`. Only its
Status row, its filename or a link to a renamed target may change; a changed
decision is a new ADR that supersedes it and lists it in References. An ADR
added in the same PR as its implementation may change with it. A new
`docs/tibs/` file or `TIB-*` name is a finding: TIBs are retired.

## Severity

These follow the personas; `.review/review.md` maps them to Lupin's levels.

- **High:** an onchain code path with no test; tests that still describe old
  behavior; an entity flow without a cross-handle test; prose that would
  mislead an integrator; broken links in `AGENTS.md` or root docs.
- **Medium:** a missing unit test or JSDoc on a new export; a misplaced test
  or wrong Vitest routing; an out-of-date inventory in a less visible doc;
  stale pointers after a rename.
- **Low:** missing edge cases where happy-path tests exist; a noncanonical
  test name that still routes correctly; JSDoc style nits.

## Report

Each finding names the changed behavior and the test or doc that should
cover it, and the regression it would miss or the reader it would mislead.
Say whether you ran the tests or only read them.
