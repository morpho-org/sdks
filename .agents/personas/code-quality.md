---
name: code-quality
kind: baseline
focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming, code smells, magic numbers, overly complex functions, cross-file impact for SDK consumers, security primitives.
---

# Code Quality

Focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming, code smells, magic numbers, overly complex functions.

Prompt must include:

- Type safety issues (`any`, unsafe `as` assertions, missing generics)
- Error handling and edge cases
- Code smells (duplicated logic, overly complex functions, magic numbers)
- Early returns preferred over nested conditionals
- Naming conventions per the root `AGENTS.md` (and any per-package `AGENTS.md` for the file under review)
- Reference `AGENTS.md` (root, canonical), `MISSION.md`, the package's `AGENTS.md`, and `CONTRIBUTING.md`

**Cross-file impact (critical for an SDK):**
- Changed exports from `packages/<pkg>/src/index.ts` — could break consumer code
- Function signature changes on public APIs (parameter add/remove/reorder/type-narrow)
- Renamed or removed exports
- API contract changes (return type, thrown error type, async-vs-sync)
- New deep imports into other packages (should go through `src/index.ts`)

**Security:**
- Hardcoded secrets, tokens, private keys, RPC URLs with credentials
- Injection risks in any string-templated input (SQL-like queries, shell commands)
- Authentication bypass / authorization checks missing on entry points
- `eval`, `Function(...)` constructors, dynamic `import(<userInput>)` — flag any
