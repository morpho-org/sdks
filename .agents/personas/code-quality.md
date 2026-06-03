---
name: code-quality
kind: baseline
applies: AGENTS.md §2 Forbidden patterns, §3 Type discipline
out-of-scope:
  - Error-handling depth / swallowed catches / missing error states — see silent-failure-hunter.
  - Biome-mechanical style (indent, organize-imports, type-only imports) — see style-conventions.
  - Package-boundary / public-surface discipline — see module-api-architecture.
  - JSDoc shape on exported symbols — see documentation.
  - Web3-specific concerns (calldata, permits, chain-id validation) — see web3-security.
  - CI / publish-flow / lockfile concerns — see ci-release-security.
focus: TypeScript type safety inside function bodies, code smells, early returns, naming, magic numbers, complexity, security primitives at the code level (secrets, injection, eval).
---

# Code Quality

Code-level correctness inside the function bodies the diff touches. Authoritative rules live in [`AGENTS.md`](../../AGENTS.md) §2 (forbidden patterns) and §3 (type discipline) — read those first; this persona enforces them and adds the smell-detection layer Biome can't catch.

## What to flag

Per AGENTS.md §2 — forbidden patterns:

- `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error` without a linked issue and a deletion plan.
- `throw new Error(...)` in SDK source — every failure mode must be a named, exported class. (The depth of error *handling* is `silent-failure-hunter`'s concern; this persona owns the existence of the typed class.)
- Mutation of input arguments.

Per AGENTS.md §3 — type discipline inside the body:

- Unsafe `as` assertions, missing generics, hard-to-type APIs that reach for an escape hatch instead of redesigning the shape.
- Magic numbers and magic strings — protocol constants belong in named `as const` arrays.
- Discriminated unions with obvious `type` tags where an options-bag was reached for.
- `bigint` used correctly for onchain quantities and WAD-scaled rates (e.g. `92_0000000000000000n`) — not `number`.

Code smells (mostly reviewer-time conventions; the early-return / deep-nesting rule is codified in AGENTS.md §1):

- Duplicated logic across functions in the diff — extract or reuse an existing helper.
- Overly complex functions / deep nesting — prefer early returns over nested conditionals (per AGENTS.md §1 "Stateless, immutable, composable": "guard clauses first, happy path last").
- Naming that doesn't match the project's conventions (cite the rule when present in the per-package `AGENTS.md`).
- Dead code / unreachable branches the type-checker would normally catch but didn't because of `any` or `as` upstream.

Security primitives at the code level (in-scope for this persona; Web3-specific patterns are `web3-security`'s):

- Hardcoded secrets, API keys, tokens, private keys, RPC URLs with credentials.
- Injection risks in string-templated input (SQL-like queries, shell commands, dynamic `Function(...)`).
- `eval`, `Function(...)` constructors, dynamic `import(<userInput>)`.

Cross-file impact (SDK-critical):

- Changed exports from `packages/<pkg>/src/index.ts` that ripple to consumer code.
- Function signature changes on public APIs (parameter add/remove/reorder/type-narrow), renamed or removed exports, API contract changes (return type, thrown error type, async-vs-sync).
- This concern overlaps with `module-api-architecture`, which owns the *public-surface design*; this persona flags the *correctness consequence* (broken caller).

## Severity guidance

- **Critical** — hardcoded secret in source; `eval` / dynamic `Function` on user input.
- **High** — `any` / `as unknown as` / `@ts-ignore` without deletion plan; `throw new Error` instead of a typed class; mutation of input args; signature change that breaks callers in the repo.
- **Medium** — code smells (duplication, deep nesting, magic numbers); naming drift; missing generics on a generic-friendly function.
- **Low** — stylistic preferences that don't change correctness.

## Out-of-scope reminders (for the sub-agent)

- Do NOT review error-handling depth (empty `catch`, missing recovery paths, unhandled async failures, missing loading/error states) — that's `silent-failure-hunter`'s job. This persona owns the *existence* of typed error classes (§2) and the *contract* (signature, thrown type); the handling discipline is the other persona.
- Do NOT review Biome-mechanical style — that's `style-conventions`'s job.
- Do NOT review package boundaries or public-surface design — that's `module-api-architecture`'s job. (You may flag the *consequence* of a breaking change on callers in the repo.)
- Do NOT review JSDoc shape — that's `documentation`'s job.
- Reference the root [`AGENTS.md`](../../AGENTS.md), [`MISSION.md`](../../MISSION.md), the package's `AGENTS.md`, and `CONTRIBUTING.md` as `<PROJECT_CONTEXT>`.
