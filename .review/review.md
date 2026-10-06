# SDK review brief

These SDKs build transactions that move integrators' funds, so business-logic
correctness, integration safety and CI/release integrity come first. Look for
consequential, non-obvious defects and back each with evidence. Written SDK
rules are binding even where no tool enforces them; optional style
preferences are not findings.

## Where the rules live

- Root `AGENTS.md`, `MISSION.md` and the affected package's nested
  `AGENTS.md`, read in the reviewed checkout. The root wins on conflict;
  package files refine it. `CLAUDE.md` is a symlink to `AGENTS.md`.
- Pinned ABIs, addresses and math helpers, public barrels (`src/index.ts`)
  and actual callers define the contract a change affects. Follow re-exports
  to the owning code; paths named in the skills are starting points.
- Biome, knip and the test suites run in CI. Don't restate what they enforce.

## Five areas

Load an area's skill when the change implicates it, including protocol or
security claims made in documentation-only changes. Covering an area doesn't
require a finding or a tour of unrelated code.

1. **sdk-protocol-safety:** ABI and address agreement, routing, approvals,
   signatures, chain and account checks, accounting invariants and action
   purity.
2. **sdk-compatibility:** what existing integrators see, the `morpho-sdk`
   facade, layers and package boundaries, stateless entity flows, and the
   deprecation lifecycle with its recorded exceptions.
3. **sdk-correctness:** types and units, input mutation, typed errors that
   reach the caller, `_try`, fallback and retry, generated code, secrets and
   injection.
4. **sdk-evidence:** tests that would catch a regression at the right
   boundary (pure, mocked transport, pinned fork), JSDoc, Markdown accuracy,
   links, and accepted ADRs.
5. **sdk-release-integrity:** semver and changesets, dependency and install
   trust, workflow permissions and secrets, publishing, and keeping review
   criteria in sync with their source.

## Severity

The skills grade findings critical, high, medium or low. Both critical and
high block a merge, so report:

- critical and high as **critical**;
- medium as **warning**;
- low as **info**.

## Keep the signal

- Read each rule with its exceptions before reporting. Examples: async
  requirement resolvers coexist with synchronous encoders; helpers may return
  an input unchanged; class instances are never deep-frozen; mocked
  transports are right for code that doesn't depend on chain state;
  compatible dev-only lockfile drift, explicit internal peer ranges, optional
  JSDoc changesets and the ADR-recorded deprecation exceptions are allowed.
- Report what the change causes or newly exposes. `AGENTS.md` §9 applies to
  code the diff touches or refactors; untouched inherited debt is not new.
- Check guards, intent and counterevidence before keeping a finding. A
  reverting transaction, an exploitable loss and a standards violation have
  different consequences; say which it is.
- Say what you executed and what you only read, and report evidence you
  couldn't obtain as unavailable rather than as a defect.
