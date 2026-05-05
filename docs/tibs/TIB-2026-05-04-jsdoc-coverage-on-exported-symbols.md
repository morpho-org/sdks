# TIB-2026-05-04: JSDoc coverage on every exported symbol

| Field      | Value       |
| ---------- | ----------- |
| **Status** | Proposed    |
| **Date**   | 2026-05-04  |
| **Author** | @0xbulma    |
| **Scope**  | Repo-wide   |

---

## Context

The root [`AGENTS.md`](../../AGENTS.md) §6 mandates JSDoc on every exported symbol — class, function, type, constant — and requires `@param`, `@returns`, `@throws`, and one `@example` on every exported function or method. [`MISSION.md`](../../MISSION.md) goal #3 elevates the same rule to a product commitment: humans and AI agents are equal users of the SDK, and JSDoc is what makes the surface AI-legible.

In practice the rule is enforced only at code review. There is no Biome rule for JSDoc (Biome does not ship one), no `eslint-plugin-jsdoc`, no TypeDoc config, and no per-package `docs` script. Coverage drifted package-by-package and is now visibly uneven.

A package-by-package audit (run 2026-05-04 against the `src/` tree of every package under `packages/`, excluding tests and generated outputs) measured the gap:

| Tier | Package                  | Coverage      | State                                                                                                  | Missing (rough) |
| ---- | ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------ | --------------- |
| 1    | `morpho-sdk`             | ~53%          | Descriptions present on most action builders; `@throws` and `@example` largely absent; `MorphoClient` has zero JSDoc | ~60–80          |
| 1    | `evm-simulation`         | high but gappy | `simulate()` lacks `@throws` and `@example`; `screenAddresses()` is undocumented                      | ~5–10           |
| 2    | `blue-sdk`               | ~144% blocks  | Best in repo (`Market.ts` is the exemplar); finish remaining methods on `Position`, `User`, `Holding`  | ~20–30          |
| 2    | `simulation-sdk`         | ~15%          | `handleOperation`, `handleOperations`, and the operation discriminated union are undocumented          | ~80–100         |
| 2    | `blue-sdk-viem`          | ~21%          | Fetcher functions (`fetchMarket`, `fetchPosition`, …) lack `@param` / `@returns` / `@throws`           | ~100–120        |
| 3    | `bundler-sdk-viem`       | ~50%          | Encoder helpers partial                                                                                | ~50             |
| 3    | `liquidation-sdk-viem`   | <20%          | Hand-written code carries almost no JSDoc                                                              | ~50             |
| 3    | `liquidity-sdk-viem`     | <20%          | Hand-written code carries almost no JSDoc                                                              | ~30             |
| 3    | `migration-sdk-viem`     | uneven        | Some bundles fully documented, others bare                                                             | ~30             |
| 4    | `blue-sdk-wagmi`         | ~2%           | Hooks document neither contract nor usage                                                              | ~50             |
| 4    | `simulation-sdk-wagmi`   | sparse        | Hooks largely undocumented                                                                             | ~30             |
| 4    | `morpho-ts`              | ~43%          | Time and format utilities partial                                                                      | ~40             |

Roughly **550–650 exported symbols** across Tier 1–4 packages need new or expanded JSDoc to meet §6. Test-helper packages (`morpho-test`, `test`, `test-wagmi`) and packages already marked deprecated in the root `README.md` are excluded from the count by design.

The `docs/tibs/` directory is empty after the migration in commit `4be989be` removed the legacy `TIB/` folder. This is the first concrete TIB and therefore also sets the tonal bar for the directory.

## Goals / Non-Goals

**Goals**

- Reach 100% JSDoc coverage on every exported symbol of every Tier 1–4 package, with `@param`, `@returns`, `@throws`, and `@example` on every exported function and method, per §6.
- Codify a single canonical JSDoc shape so cleanup PRs converge instead of diverge.
- Make coverage measurable via the `pnpm jsdoc:coverage` burndown so each phase's progress is visible to reviewers without grepping the diff; automated enforcement is deferred to Phase 5 reassessment.
- Publish a TypeDoc reference site per release, generated from the same JSDoc, per §7.

**Non-Goals**

- Documenting `@internal` symbols or any symbol not re-exported from a package's `src/index.ts`.
- Adding JSDoc to test-helper packages (`morpho-test`, `test`, `test-wagmi`) or to generated outputs (`packages/*/src/api/sdk.ts`, `packages/*/src/api/types.ts`).
- Backfilling JSDoc on packages already marked deprecated in the root `README.md` and slated for removal.
- Reformatting prose on existing JSDoc that already meets the §6 bar — only fill gaps and fix violations.
- Standing up a docs website as part of this TIB; only the TypeDoc generator and CI publish step are in scope. A curated recipes site is a follow-up.
- Adding a second linter to the toolchain. Biome owns lint per [`AGENTS.md`](../../AGENTS.md) §8, and adding ESLint (or any second linter) for a single rule family is out of scope. Automated JSDoc enforcement waits for Biome to ship JSDoc rules — see Considered Alternatives.

## Current Solution

§6 is documented in the root `AGENTS.md` and reinforced in `MISSION.md`, but enforcement is entirely human:

- No `eslint-plugin-jsdoc`; no `eslint` at all in this repo.
- No Biome rules for JSDoc presence or shape (Biome does not provide them at the time of writing).
- No TypeDoc config and no `docs` / `typedoc` scripts in any `package.json`.
- No CI step that measures or gates JSDoc coverage.
- Per-package `AGENTS.md` files do not redefine the bar, so it is implicit on every contributor.

The result: action builders carry a description but routinely omit `@throws` and `@example`; entity fetchers in `blue-sdk-viem` are documented in only one of every five exports; React hooks in `*-wagmi` packages are essentially undocumented; protocol-critical handlers in `simulation-sdk` ship without JSDoc on the discriminated unions integrators must pattern-match on.

## Proposed Solution

Three pillars, executed in order. The TIB does not commit to a calendar; phase ordering is the load-bearing claim.

### 1. Canonical JSDoc shape

Publish a single style guide at `docs/jsdoc-style.md` that fixes the §6 requirements into a copy-pasteable template. The guide is repo-wide, not package-scoped, because every exported symbol in every package is in scope. Per-package `AGENTS.md` files link to the style guide rather than restating it.

The guide specifies, in order:

- **First sentence is imperative and complete.** "Prepares a borrow transaction for a Morpho Blue market." — not "This function will…" and not a sentence fragment.
- **What it reads on-chain, if anything.** Required for entity fetchers; forbidden on action builders (which never read state per §1).
- **`@param` itemized for nested options bags.** When the parameter is `{ market: { chainId, marketParams }, args: { … }, metadata? }`, every leaf field gets its own `@param` line. No flat `@param params - The borrow parameters.` shortcut.
- **`@returns` describing the shape.** For action builders this names `Readonly<Transaction<TAction>>` and notes that the return is `deepFreeze`d. For fetchers it names the entity class and any `null` cases.
- **`@throws` listing every exported error class** the function may surface. By **class identity**, not message string — classes are public API per §3, messages are not. One `@throws` line per class, with a one-clause reason: `@throws {NonPositiveBorrowAmountError} when amount <= 0n`.
- **One `@example` block.** Runnable code with imports, client setup, the call, and the expected return shape. No placeholder addresses (`0x…`); use named protocol constants or fixture addresses from `morpho-test`. No real RPC URLs or private keys.

The guide ships side-by-side good/bad examples drawn from the action builders cited in the References section (`vaultV1Deposit`, `marketV1Borrow`). Phase 0 backfills those two builders to match the canonical shape so every subsequent PR has a real reference, not just prose.

### 2. Tiered, package-scoped backfill

Backfill in tiers, in the order the audit ranked them. Within each tier, one PR per layer (e.g. `morpho-sdk/actions/marketV1`, `morpho-sdk/actions/vaultV1`, `simulation-sdk/handlers`) so reviews stay scoped, ownership is obvious, and a single reviewer can hold the canonical shape across the diff. PRs whose behavior-affecting changes touch a published package ship a `patch` changeset per §7; JSDoc-only changes inside `packages/*/src/` and repo-meta-only PRs (TIB, style guide, root tooling) may omit the changeset.

PRs do not mix JSDoc backfill with feature work or refactors — one concern per PR per §8. PRs do not introduce code changes other than JSDoc; if a docstring reveals a real bug or naming flaw, the fix lands in a separate PR that the docstring PR depends on.

### 3. Observable progress, automated gate deferred

Make coverage visible without adding a second linter. Ship the burndown script (`pnpm jsdoc:coverage`) and run it informationally in CI — the table shows up in workflow logs and PR descriptions for backfill PRs, so the trajectory is visible at every commit. Reviewers continue to hold the line on the canonical shape during Phases 1–4.

An automated gate lands only when one of these arrives:

- **Biome ships JSDoc rules.** Biome owns lint per [`AGENTS.md`](../../AGENTS.md) §8. Adding rules there keeps the toolchain single-linter and avoids the dep / config / pin friction explored in Considered Alternatives.
- **A lighter-weight in-repo gate** that does not bring in a second linter (e.g. extending the burndown script with a TypeScript compiler API walk to fail CI when Tier 1 regresses).

Until then, the burndown is the load-bearing signal and review is the load-bearing gate. Reviewers must reject any new Tier 1 export that ships without §6 JSDoc.

### Implementation Phases

- **Phase 0 — Standard & exemplars.** Publish `docs/jsdoc-style.md`. Backfill `vaultV1Deposit` (`packages/morpho-sdk/src/actions/vaultV1/deposit.ts`) and `marketV1Borrow` (`packages/morpho-sdk/src/actions/marketV1/borrow.ts`) to the canonical bar. Land TypeDoc config (no CI step yet). Land the burndown script (see Observability).
- **Phase 1 — Tier 1 (`morpho-sdk` + `evm-simulation`).** Every action builder; the `MorphoClient` class and its three factory methods; every exported error class in `packages/morpho-sdk/src/types/error.ts`; the `simulate()` and `screenAddresses()` entry points in `evm-simulation`.
- **Phase 2 — Tier 2 (`blue-sdk`, `simulation-sdk`, `blue-sdk-viem`).** Finish entity classes (`Position`, `User`, `Holding`); document operation handlers and the operation discriminated union; document fetcher functions (`fetchMarket`, `fetchPosition`, `fetchVault`, …) and their type exports.
- **Phase 3 — Tier 3 (`bundler-sdk-viem`, `liquidation-sdk-viem`, `liquidity-sdk-viem`, `migration-sdk-viem`).** Core encoders and entry points first; helpers second.
- **Phase 4 — Tier 4 (`blue-sdk-wagmi`, `simulation-sdk-wagmi`, `morpho-ts`).** Hook contracts (`@param` for inputs, `@returns` describing the hook's return tuple, `@example` showing a minimal React caller); time and format utilities.
- **Phase 5 — Reassessment.** Re-evaluate the automated gate when Biome ships JSDoc rules (or a lighter-weight in-repo equivalent emerges). Until then, the burndown is the visible signal and reviewers hold the line per Phases 0–4 outcomes. No second linter is added in the meantime.
- **Phase 6 — Publication.** TypeDoc site generated per release and linked from the per-major CHANGELOG entry per §7.

## Considered Alternatives

### Alternative 1: One mega-PR adding JSDoc everywhere

A single PR fills every gap in every package. Reviewers approve once; the gate flips on the same day.

**Why rejected:** ~600 symbols across ~12 packages is unreviewable as one diff. There is no realistic owner per file, and the PR would block (or be blocked by) every concurrent feature PR for its lifetime. Tiered, package-scoped PRs preserve review quality and keep `main` releasable per §7.

### Alternative 2: Document on touch only

Require JSDoc on any export an author modifies, and let the rest accrete naturally over time.

**Why rejected:** Stable, high-traffic surface (the `Market` entity, top-level fetchers, the `MorphoClient`) gets touched rarely precisely because it is stable. Integrators feel the documentation gap on the most-used APIs and continue to feel it for years. This also fails MISSION.md goal #3 measurably: AI agents see the same gap on the same exports indefinitely.

### Alternative 3: Auto-generate JSDoc from TypeScript types

Run a codegen step that emits a `@param` line per parameter, a `@returns` line per signature, and a stub description from the symbol name.

**Why rejected:** TypeScript types do not carry protocol semantics, the `@throws` list, or runnable `@example` snippets. The generated output would technically pass a `require-jsdoc` lint, but produce no value for the human or AI reader who needs the JSDoc to *understand the call*. JSDoc that is technically present and substantively empty is worse than a missing tag — it lies about coverage.

### Alternative 4: Defer until tooling lands first

Build the lint and CI infrastructure, flip it on at warn level, and let warnings drive the cleanup.

**Why rejected:** Tooling without exemplars produces hundreds of noisy lint errors and no canonical shape to converge on; PRs would diverge, and the rework cost would exceed the gain. Tooling is more useful *after* Phase 1 establishes the canonical shape on real exports.

### Alternative 5: Skip `@example` to reduce burden

Require description, `@param`, `@returns`, `@throws` — but treat `@example` as optional.

**Why rejected:** The `@example` block is the single highest-leverage element for AI legibility. MISSION.md goal #3 calls out "runnable single-file recipes as few-shot examples" specifically. The burden is real but is the cost of meeting the rule we wrote.

### Alternative 6: Adopt `eslint-plugin-jsdoc` as the automated gate

Add ESLint, `typescript-eslint`, and `eslint-plugin-jsdoc` as devDependencies, configure a flat config scoped to backfilled paths, and chain `eslint` into `pnpm lint`.

**Why rejected:** Adds a second linter (ESLint + parser + plugin) on top of Biome with the explicit goal of replacing one of Biome's responsibilities. The repo's ajv pin (`pnpm.overrides.ajv: 8.18.0`) further requires scoped sub-overrides (`@eslint/eslintrc>ajv`, `eslint>ajv`) to coexist — that wiring is brittle and will surface again on every ESLint upgrade. Footprint is significant for a single rule family. Biome owns lint per §8; the strategic home for an automated gate is Biome itself when it ships JSDoc rules. Until then, observable burndown + reviewer enforcement is enough — see Proposed Solution pillar 3.

### Alternative 7: TypeDoc with `--treatWarningsAsErrors` as the gate

Run TypeDoc against Tier 1 entry points with `validation.notDocumented: true` and promote warnings to errors.

**Why rejected:** TypeDoc's `@param` validator does not accept the dotted leaf-field notation (`@param params.args.amount`) that this repo's [`docs/jsdoc-style.md`](../jsdoc-style.md) mandates for nested options bags. Every leaf produces a "@param … was not used" warning, so `treatWarningsAsErrors: true` against the canonical exemplars (`marketV1Borrow`, `vaultV1Deposit`) fails on day one. Resolving this means either dropping the dotted convention or writing a TypeDoc plugin — both larger changes than this TIB scopes. `pnpm docs:build` continues to surface the warnings informationally.

## Assumptions & Constraints

- Reviewers hold the line on the canonical shape across every phase. Without an automated gate, the convention only sticks if PR review enforces it.
- AI agents (Claude Code) assist with bulk authoring; PR authors retain responsibility for protocol semantics, the accuracy of the `@throws` list, and that every `@example` snippet actually compiles and runs.
- Each phase ships independently with no runtime behavior changes; a `patch` changeset is added when the phase's other changes touch a published package, otherwise omitted (see Proposed Solution pillar 2).
- Test-helper packages (`morpho-test`, `test`, `test-wagmi`) are out of scope under §5 (their public symbols are fixtures, not integrator surface).
- Deprecated packages (`@morpho-org/blue-sdk-ethers` and any others marked deprecated in the root `README.md`) are out of scope.

## Dependencies

- `typedoc` (Phases 0 and 6). Dev-dependency at the root. Used informationally — strict gate (`treatWarningsAsErrors`) is out of scope per Considered Alternative 7.
- No new runtime dependencies and no peer-dep changes; the only peer dep on the public surface remains `viem` per §4.
- No new linter dependency. `eslint-plugin-jsdoc` was evaluated and rejected (Considered Alternative 6).

## Observability

- **`scripts/jsdoc-coverage.js`** — a Node script run via `pnpm jsdoc:coverage` that walks every Tier 1–4 package, counts exported symbols against the §6 bar (description present, all required tags present), and prints a Markdown table. Used as the burndown chart for Phases 1–4 and posted to PR descriptions for backfill PRs.
- **CI step** that runs the same script informationally and prints the table to the workflow logs. The script does not exit non-zero on missing JSDoc — that gate waits for Phase 5 reassessment.
- **TypeDoc warnings** surfaced in CI logs from Phase 0; promotion to errors is deferred per Considered Alternative 7.

## Security

Doc-only changes; no security surface for the production code.

Two operational rules apply to the JSDoc itself:

- `@example` blocks must not embed real RPC URLs, real API keys, or any private key — even an obviously-throwaway one. Use placeholder transports (`http()` with no URL) and named constants.
- `@throws` is part of the SDK's public API per §3. Adding, renaming, or removing a `@throws` class on an exported function is a breaking change and must follow the §7 deprecation flow.

## Future Considerations

- **JSDoc-driven sample tests.** A separate TIB could propose extracting `@example` snippets and compiling them as part of `pnpm test`, ensuring every documented call shape stays valid as the API evolves.
- **Curated recipes site.** Single-file integrator recipes (one per common flow: open a position, withdraw with native unwrap, migrate from Aave) layered on top of the per-export `@example` blocks. Out of scope here; warrants its own TIB.
- **Error catalog page.** Mine `@throws` JSDoc across all exports to auto-generate a typed-error reference page, since errors are public API per §3.

## Open Questions

- When does Biome ship JSDoc rules? Tracking this is the trigger for Phase 5 reassessment.
- `docs/jsdoc-style.md` versus an addition to a per-package `AGENTS.md` — the recommendation is the repo-wide doc because the rule is repo-wide, but reviewers may prefer to keep guidance closer to the code it governs.
- Whether `@example` blocks for entity fetchers must pin a real Anvil block (matching §5 fork-test conventions) or may use a generic `createPublicClient({ transport: http() })` snippet. Recommendation is the latter to keep examples small and copy-pasteable; pinned examples can live in `morpho-sdk` recipes instead.
- Whether `*-wagmi` hook JSDoc should document the React rendering contract (dependency arrays, suspense behavior, refetch on mount) inline on each hook or via a single hooks-conventions page that every hook links to. Defer to Phase 4 owners.

## References

- Root [`AGENTS.md`](../../AGENTS.md) §6 (JSDoc requirements) and §7 (release / doc cadence).
- [`MISSION.md`](../../MISSION.md) goal #3 (Document & make AI-legible).
- [`docs/tibs/TEMPLATE.md`](./TEMPLATE.md) — template this TIB conforms to.
- `packages/morpho-sdk/src/actions/vaultV1/deposit.ts` — `vaultV1Deposit` exemplar (gap: missing `@throws` and `@example`).
- `packages/morpho-sdk/src/actions/marketV1/borrow.ts` — `marketV1Borrow` exemplar (gap: generic `@param`, missing `@throws` and `@example`).
- `packages/blue-sdk/src/market/Market.ts` — entity-class JSDoc exemplar.
- `packages/morpho-sdk/CLAUDE.md` glossary — protocol terms (`LLTV buffer`, `wNative`, `GeneralAdapter1`, `bundler3`, `PublicAllocator`, `MetaMorpho`, `Permit2`, `WAD`) that JSDoc should use without redefining.
