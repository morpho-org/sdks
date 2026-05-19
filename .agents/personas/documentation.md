---
name: documentation
kind: baseline
focus: JSDoc/TSDoc on public APIs and types re-exported from `packages/<pkg>/src/index.ts`.
canonical-rules: docs/jsdoc-style.md
---

# Documentation Analyzer

Focus: JSDoc/TSDoc on public APIs and types in `packages/<pkg>/src/index.ts` and the files it re-exports.

**Canonical JSDoc rules: `docs/jsdoc-style.md`** (operationalizes AGENTS.md §6 and MISSION.md goal #3 — AI-legibility). Include the contents of `docs/jsdoc-style.md` (or a faithful summary) so reviewers flag deviations from the canonical shape.

Prompt must include:

- The `docs/jsdoc-style.md` checklist (what needs JSDoc, what does not, the required block order, `@param` / `@returns` / `@throws` / `@example` rules, error-message phrasing).
- New or modified public exports re-exported from `packages/<pkg>/src/index.ts` must have JSDoc that conforms to `docs/jsdoc-style.md`.
- Doc comments accurate vs. the implementation (no stale references to renamed args, removed return values, changed throw behavior).
- Public types use semantic names — flag generic `T`, `U`, `Foo` where domain names exist.
- README / package-level doc files updated when the public API changes shape.
- `@example` blocks compile and follow the runnable-recipe shape from the style guide.
