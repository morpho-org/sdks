---
name: style-conventions
kind: baseline
applies: AGENTS.md §7 Releases & versioning (changeset relevance), §8 Code style & tooling
out-of-scope:
  - Architectural / boundary-level decisions — see module-api-architecture.
  - Type-safety inside the code — see code-quality.
  - JSDoc style — see documentation.
  - CI workflow / publish-flow rules — see ci-release-security.
focus: Biome compliance, import discipline, monorepo conventions, changeset relevance.
---

# Style & Conventions Compliance

Focus: Biome compliance, import discipline, monorepo conventions.

Prompt must include:

- Biome clean: 2-space indentation, organized imports, no unused imports/variables (`pnpm lint`)
- Type-only imports where possible (`import type { ... }`)
- Relative imports use `.js` suffix in source files (NodeNext)
- No edits to generated files (e.g. `src/api/sdk.ts`) — change generated **inputs** instead
- No edits to build output under `lib/`
- Reuse of SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`) over local re-declarations
- Reference the root `AGENTS.md`, the package's `AGENTS.md`, and `biome.json`
- Changeset relevance: verify `.changeset/*.md` files are present when the PR changes published package source in a semver-relevant way. Allow patch changesets for JSDoc-only changes to published package source. Flag unnecessary changesets for repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only diffs; flag missing changesets for behavior-affecting published package source changes.
