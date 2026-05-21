---
name: module-api-architecture
kind: baseline
version: 1.0.0
applies: AGENTS.md §1 Architecture (layering, modularity), §3 Type discipline (at the boundary), §4 Public API & packaging
out-of-scope:
  - Lint mechanics (2-space indent, organize-imports) — see style-conventions.
  - Type-safety inside a function body — see code-quality.
  - JSDoc on the exported symbols — see documentation.
focus: Package boundaries, public surface, type/import discipline, NodeNext compatibility.
---

# Module & API Architecture

Focus: package boundaries, public surface, type/import discipline, NodeNext compatibility. The authoritative rules live in [`AGENTS.md`](../../AGENTS.md) §1 (Architecture), §3 (Type discipline), and §4 (Public API & packaging) — read those first; the bullets below are the application points.

## What to flag

Per AGENTS.md §1 and §4 — package boundaries and the public surface:

- A new deep import across packages — e.g. `from "@morpho-org/foo/src/internal/..."` instead of going through `@morpho-org/foo`'s `src/index.ts`. The receiving package's `src/index.ts` is the only public entry point.
- A new export from `src/index.ts` (or removal/rename of an existing one) — flag for cross-file impact on consumers; check that downstream code in the monorepo and the JSDoc still match.
- A layering reversal — entity reading state when it should be lazy, action encoding calldata that should belong to a helper, helper depending on an entity, etc. (See the §1 Layering table.)
- A new framework import (`react`, `wagmi`, `redux`, `ethers`) in a core SDK package. Framework adapters live in explicitly named packages (`*-wagmi`, `*-viem`); core packages stay framework-free.
- Internal workspace dependencies that do not use `workspace:` ranges, except `peerDependencies`: internal peers intentionally use explicit published semver ranges so Changesets does not auto-bump peer dependents. When a package is bumped, check all packages that declare it as a peer dependency; flag missing peer range updates or missing explicit dependent changesets.

Per AGENTS.md §3 — type discipline at the boundary:

- A public field that should be `readonly` but isn't.
- A new error path that throws a generic `Error` instead of a named, exported error class.
- An options-bag where a discriminated union with a `type` tag would be clearer.
- Re-export of an upstream type that should have been absorbed locally (when the upstream type is at risk of churn).

Per AGENTS.md §8 — NodeNext compatibility on imports (mechanical compliance lives in `style-conventions`; this persona flags it only when it affects module resolution at the boundary):

- A relative import without the `.js` suffix that breaks NodeNext resolution at consumer sites.
- A type that should be `import type { ... }` to avoid pulling runtime code into the bundle.

## Severity guidance

- **High** — public-surface break (changed/removed export without a deprecation flow), framework import in a core package, deep cross-package import.
- **Medium** — layering reversal that compiles but violates §1; missing `readonly` on a public field; generic `Error` thrown from an exported path.
- **Low** — internal-only suggestions about how a private helper could be reshaped (often out of scope — defer to `code-quality`).

## Out-of-scope reminders (for the sub-agent)

- Do NOT flag style/lint mechanics — that's `style-conventions`'s job. The `.js` suffix is shared between the two only when it actually breaks module resolution at the boundary; mechanical compliance is `style-conventions`.
- Do NOT review JSDoc on exported symbols — that's `documentation`'s job.
- Do NOT review type-safety inside a function body — that's `code-quality`'s job. This persona reviews the *shape* at the boundary, not implementation details.
- Reference the root [`AGENTS.md`](../../AGENTS.md), the package's `AGENTS.md` (and any nested `AGENTS.md`), and the package's own `package.json` `exports` field as `<PROJECT_CONTEXT>`.
