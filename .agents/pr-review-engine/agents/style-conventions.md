---
name: style-conventions
kind: baseline
version: 1.0.0
applies: AGENTS.md §7 Releases & versioning (changeset relevance), §8 Code style & tooling
out-of-scope:
  - Architectural / boundary-level decisions — see module-api-architecture.
  - Type-safety inside the code — see code-quality.
  - JSDoc style — see documentation.
  - CI workflow hardening — see ci-security. Publish-flow / Changesets wiring — see release-integrity. Lockfile drift, dependency hygiene — see dependencies.
focus: Biome mechanical compliance, monorepo conventions, changeset relevance.
---

# Style & Conventions Compliance

Mechanical-style enforcement and changeset relevance. Authoritative rules live in [`AGENTS.md`](../../../AGENTS.md) §7 (changeset gates) and §8 (code style). This persona flags violations of those rules — it does not restate them.

## What to flag

Per AGENTS.md §8 — mechanical style (Biome enforces what it can; this persona catches the rest):

- Biome violations that survived a `pnpm lint` run (organize-imports, unused vars/imports, unsafe assertions Biome doesn't warn on).
- A relative import missing the `.js` suffix (NodeNext) — flag when it would survive Biome but break NodeNext resolution. Architectural impact at the boundary is `module-api-architecture`'s concern; this persona catches the mechanical compliance.
- A runtime import where `import type { ... }` would do — costs bundle weight, no runtime gain.
- A local re-declaration of an SDK type (`Address`, `MarketId`, `ChainId`, `BigIntish`) instead of reusing the exported one.
- An edit to a generated output (`src/api/sdk.ts`, anything under `lib/`) — change the generated **input** (`graphql/*.gql`) instead.

Per AGENTS.md §7 — changeset relevance (the policy lives in §7; this persona checks the diff matches):

- Behavior-affecting changes to published package source **without** a `.changeset/*.md` entry.
- Changesets that bump a package without auditing downstream internal `peerDependencies`. Internal peer ranges are explicit semver ranges, not `workspace:` ranges, so Changesets will not auto-bump peer dependents; flag missing peer range updates and missing explicit changeset entries for affected dependent packages.
- JSDoc-only changes to published package source may ship a patch changeset when maintainers want them in release notes — flag the absence only as **low** unless the export's contract changed.
- Unnecessary changesets on repo metadata, non-API doc-only diffs, fixtures, generated outputs, or tests-only diffs.
- Changeset whose declared bump (patch/minor/major) doesn't match the diff's contract impact.

## Severity guidance

- **High** — missing changeset on a behavior-affecting source change in a published package, or a package bump whose downstream internal peer ranges were not updated when required (CI release will undercount, integrators get a surprise).
- **Medium** — Biome violation surviving `pnpm lint`, missing `.js` suffix, runtime import where type-only would do.
- **Low** — local re-declaration of an SDK type, JSDoc-only diff without a patch changeset, unnecessary changeset.

## Out-of-scope reminders (for the sub-agent)

- Do NOT review architectural decisions (package boundaries, public-surface design) — that's `module-api-architecture`'s job.
- Do NOT review type-safety inside function bodies — that's `code-quality`'s job.
- Do NOT review JSDoc shape — that's `documentation`'s job.
- Do NOT review CI workflow hardening — that's `ci-security`'s job (conditional). Do NOT review publish-flow integrity or Changesets wiring — that's `release-integrity`'s job. Do NOT review lockfile drift or dependency hygiene — that's `dependencies`'s job.
- Reference the root [`AGENTS.md`](../../../AGENTS.md), the package's `AGENTS.md`, and `biome.json` as `<PROJECT_CONTEXT>`.
