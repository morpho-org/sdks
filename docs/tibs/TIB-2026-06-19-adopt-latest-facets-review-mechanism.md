# TIB-2026-06-19: Adopt the latest facets review mechanism in the in-repo agentic system

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Status**        | Proposed                                           |
| **Date**          | 2026-06-19                                         |
| **Author**        | @0xbulma                                           |
| **Scope**         | Repo-wide                                          |

---

## Context

The repo ships a committed "agentic system" under `.agents/` that drives automated PR review and is
treated as a binding contract by `AGENTS.md` §10. It was an **earlier-generation fork** of the
[facets](https://github.com/0xbulma/facets) plugin: an English-only dispatcher at
`.agents/lib/pr-review-base.md`, 9 Morpho-specialised personas in `.agents/personas/`, and caller
commands in `.agents/commands/` (symlinked into `.claude/commands/`).

Upstream facets has since moved the whole mechanism into a self-contained `pr-review-engine` skill
with **bundled, unit-tested deterministic TypeScript scripts** and a much sharper finding contract.
The repo's `.agents/` had none of this: its line-math, scope-filtering, and dedup were all English the
model re-derived each run, with no WHAT/FIX finding schema, no line-snapping, no intent context, and
no cross-run state. The two diverged enough that bug-fixes and improvements landing upstream (the
findings ledger, the idempotency cache, the merge-base recompute that stops a base-branch merge from
ballooning the review from 67 to 462 files) never reached this repo.

The forcing function: we want the repo's review to use the latest mechanism, but the repo deliberately
keeps Morpho-specialised personas (protocol semantics, the §2 forbidden-patterns list, the §10
CI/release rules) that the upstream generic agents do not encode. So "just install the plugin" would
regress review quality. The decision is **how** to bring the latest mechanism in while keeping the
specialisation.

## Goals / Non-Goals

**Goals**

- Mirror upstream's `pr-review-engine/` layout in-repo (`SKILL.md` + `agents/` + `references/` +
  `scripts/`) so future re-syncs from upstream are cheap, while keeping the 9 Morpho personas as the
  agent set.
- Replace the English line-math with the bundled deterministic scripts, gated by the repo's own
  `pnpm` tooling (Biome + a `agents-engine` Vitest project + `tsc`) so a regression fails a gate.
- Adopt the post-4.16.0 contract: WHAT/FIX finding schema, ±15-line snapping (`snapped_line`),
  `INTENT_CONTEXT` injection, merge-base recompute + base-merge warning, the doc-only fast path,
  `EXCLUDE_AGENTS`, the stateful findings ledger, and the idempotency cache.
- Keep the repo-only `pr-review-ci` verdict mode (upstream is local-first and has no CI variant).

**Non-Goals**

- Adopting the repo-agnostic plugin model (retiring `.agents/` and relying on the installed
  `/facets:*` skills) — that loses the dedicated Morpho personas and the §10 contract structure.
- Porting the frontend agents (`react-next`, `styling`, `accessibility`, `ai-sdk`, `api-security`,
  `runtime-validation`) — irrelevant to a headless SDK; their flags are omitted.
- Changing any published-package source. This is repo-metadata / dev-tooling only — no changeset.
- Porting the TIB/TIP doc-workflow skills (`tib-create`, `tip-create`, `tib-ship`,
  `convert-tib-to-linear`) — those live in the installed `/facets:*` plugin, not the repo's `.agents/`.

## Current Solution

`AGENTS.md` §10 documents: caller commands → `.agents/lib/pr-review-base.md` (English Steps 3–6) →
9 personas in `.agents/personas/`. Findings have no schema; the base re-derives the changed-line set
and scope filter from prose each run; every review is stateless; a base-branch merge into the PR
inflates the diff.

## Proposed Solution

Restructure `.agents/` to mirror upstream's engine (decision: **hybrid mirror + full port**):

```
.agents/
  pr-review-engine/
    SKILL.md            engine spec (Steps 3–6), repo-path-adapted, supersedes lib/pr-review-base.md
    agents/             the 9 Morpho personas + a new skill-authoring agent
    references/         changed-lines, scope-filter, calibration, secrets, injection, github-actions, skill-authoring
    scripts/            build-changed-lines, validate-findings, findings-ledger, review-scope (+ *.test.ts), list-fix-rubric-agents.sh, tsconfig.json
  commands/             callers repointed to the engine; local gains cache + ledger + intent
```

Repo-specific adaptations from the upstream copy:

- **Paths.** `${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/…` → repo-relative `.agents/pr-review-engine/…`.
- **Flag set.** Keep `HAS_CI_RELEASE` (one conditional persona) and the context-only
  `HAS_PROTOCOL_SURFACE`; **add `HAS_PLUGIN_SKILLS`** (the repo now ships a skill-authoring surface);
  omit the six frontend flags.
- **Agent set.** Keep the 9 Morpho personas; add a repo-adapted `skill-authoring` agent whose
  cross-file invariant is the engine roster ↔ §10 table ↔ `> Applied by personas:` backlinks (the
  repo has no `plugin.json`/`marketplace.json`/bats locks to check). Fix rubrics added to
  `ci-release-security`, `documentation`, `web3-security`.
- **Doc-only fast path** skip list remapped to the repo's agent names.
- **`pr-review-ci`** stays stateless (fresh verdict each run; no ledger).

### Implementation Phases (all landed in this PR)

- **Phase 1 — Scripts.** Ported the four `.ts` + their `.test.ts` + `list-fix-rubric-agents.sh`;
  reformatted to Biome 2-space; added a `agents-engine` Vitest project; added a strict
  `tsconfig.json`. Gates: Biome clean, 124 tests pass, `tsc --noEmit` clean.
- **Phase 2 — Engine.** `pr-review-engine/SKILL.md` with the full Steps 3–6 contract + Morpho
  protocol-context retention.
- **Phase 3 — Agents + references.** Moved + relinked the 9 personas; added `skill-authoring`;
  ported the reference subset (adapting `skill-authoring.md`).
- **Phase 4 — Callers.** Repointed all callers; `pr-review-local` gained Step 2c cache + Step 6b
  ledger + commit-message intent + SSH→HTTPS fetch fallback; `pr-review-gh` gained PR-title/body
  intent + PR-keyed ledger + audit trail; `pr-review-ci` adopted the new contract; `pr-fix`
  repointed + wired Fix-rubric discovery.
- **Phase 5 — Docs.** Rewrote `AGENTS.md` §10 (orchestration table, persona inventory, backlinks).

## Considered Alternatives

### Alternative 1: Adopt the `/facets` plugin, retire `.agents/`

Delete the repo's `.agents/` + `.claude/commands` review stack and rely on the installed `/facets:*`
skills, folding Morpho review knowledge into `AGENTS.md` (which the plugin reads as project context).
Smallest footprint, auto-updates with the plugin.

**Why rejected:** loses the dedicated Morpho personas (`morpho-protocol`, the §2 forbidden-patterns
calibration, the §10 CI/release rules as a first-class lens) and the §10 contract structure that the
repo's review quality depends on. The generic upstream agents would only see Morpho rules as injected
prose, not as a specialised lens.

### Alternative 2: Core mechanism only, no ledger/cache

Port the scripts + WHAT/FIX schema + line-snapping + intent + merge-base recompute, but skip the
stateful findings ledger and idempotency cache.

**Why rejected:** the ledger (net-new/recurring/resolved/suppressed) and the cache are the headline
post-4.16.0 improvements and the ones that most reduce re-review noise and token cost on an evolving
PR. They are confined to the shell (the caller), keep the engine stateless, and live outside the repo,
so they add no statefulness to the reviewed tree — low cost for high value.

## Assumptions & Constraints

- **Node ≥ 22.18 for live script runs.** The engine invokes the scripts as `node …/foo.ts`, relying
  on Node's native TypeScript type-stripping. The repo's dev/CI runtime is newer; this requirement is
  documented in `SKILL.md` rather than bumped into the root `engines.node` (which would couple the
  whole monorepo's Node floor to dev tooling). The Vitest tests transpile TS and run on any supported
  Node — only the live invocation needs ≥22.18.
- The findings ledger lives **outside** the repo (`~/.claude/facets/reviews/`, overridable via
  `FACETS_LEDGER_DIR`), so it never trips a clean-tree guard.

## Security

- The scripts shell to `git` via `execFileSync` with argument arrays — no shell-string interpolation
  of untrusted input. (Upstream's `review-scope.ts` / `build-changed-lines.ts` were written this way.)
- No secrets, tokens, or network egress in the scripts; they read git and the local filesystem only.
- `skill-authoring` + the existing `ci-release-security` persona continue to anchor the §10 CI/release
  security rules unchanged.

## Future Considerations

- Wire `tsc -p .agents/pr-review-engine/scripts` into the root `lint` gate (currently available, run
  manually / in this PR's verification but not yet in the standing `pnpm lint`).
- Port `pr-review-local`'s `--goal` / `--fast` loop and `pr-review-gh`'s local→GitHub ledger reuse
  (Step 2c) for full upstream parity — deferred; the cache + ledger + intent landed now.
- A periodic re-sync from upstream `pr-review-engine/` is now cheap thanks to the mirrored layout.

## References

- [facets upstream](https://github.com/0xbulma/facets) — `plugins/facets/skills/pr-review-engine/`.
- [`AGENTS.md` §10](../../AGENTS.md#10-review-automation--cirelease-security) — the review-system inventory this TIB restructures.
