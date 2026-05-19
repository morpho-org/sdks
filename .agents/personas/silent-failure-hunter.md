---
name: silent-failure-hunter
kind: baseline
applies: AGENTS.md §1 Architecture (testability), §2 Forbidden patterns (typed errors over `throw new Error`)
out-of-scope:
  - Type-safety in general — see code-quality.
  - Error-class design (subclass vs string) — see code-quality.
  - Missing tests for error paths — see test-coverage.
focus: Swallowed errors, missing error boundaries, empty catch blocks, unhandled promise rejections, missing loading/error states, dead code paths.
---

# Silent Failure Hunter

Focus: Swallowed errors, missing error boundaries, empty catch blocks, unhandled promise rejections, missing loading/error states, dead code paths.

Prompt must include:

- Empty or overly broad catch blocks that swallow errors
- Missing error boundaries around async components
- Unhandled promise rejections (missing `.catch()` or try/catch)
- Missing loading states for async operations
- Missing error states for failed data fetches
- Silently ignored return values from critical operations
- Dead code paths that can never execute
