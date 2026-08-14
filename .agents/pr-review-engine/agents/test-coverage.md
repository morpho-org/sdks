---
name: test-coverage
kind: baseline
applies: AGENTS.md §5 Testing, §2 Forbidden patterns (rule 6 — mocked viem clients on RPC paths)
out-of-scope:
  - Correctness of the test assertions themselves — see code-quality.
  - Missing tests for CI workflows — see ci-release-security.
  - Mock-vs-fork choice for Web3 paths — see web3-security.
focus: |
  Missing or weak tests for changes in `packages/<pkg>/src/`. Enforces the universal layout from AGENTS.md §5: unit tests sit next to their modules as `*.test.ts`, while fork/integration tests live only under the package's `test/` directory as `*.integration.test.ts`.
---

# Test Coverage Analyzer

Two questions, every time: **is there a test for this code?** and **is it in the right place?**

This persona is the enforcer for AGENTS.md §5. The colocation rule lives there — read it first. The rules below are the *application points*; the spec is authoritative.

## What "in the right place" means

Per AGENTS.md §5, every package uses the same layout:

- **Unit tests** are named `*.test.ts` and colocated with the module they exercise (`src/Foo.ts` ↔ `src/Foo.test.ts`). A unit test for a test-only support module under `test/` stays beside that support module instead of moving the helper into published source.
- **Integration and fork tests** are named `*.integration.test.ts` and live only under `packages/<pkg>/test/`. They never live under `src/`, and packages use singular `test/`, not `tests/`.
- **Vitest routing** keeps unit and fork projects separate: unit projects include colocated unit files; fork projects include only `test/**/*.integration.test.ts`.

## What to flag

### Missing coverage (the always-applies set)

- New public exports without a corresponding colocated unit test (`src/Foo.test.ts` next to `src/Foo.ts`).
- New code paths inside existing exports without test cases — branches, error paths, edge cases like `0n`, `MAX_UINT256`, negative `bigint`, empty arrays, NaN-equivalents.
- Removed or modified public exports without their tests updated (e.g. signature change, behavior change).
- Onchain code paths (any code calling `viem` / `wagmi` actions) — confirm at least one test exercises the path. Per current AGENTS.md §5, contract round-trips and paths whose correctness depends on real onchain state use Anvil forks via `@morpho-org/test` at pinned blocks. Unit tests for code that calls `viem/actions` but does not depend on real onchain state may use `createMockClient` from `@morpho-org/test/mock`, which mocks the `client.transport` surface those actions use. Do not recommend `vi.mock` / `vi.spyOn` of viem actions for RPC paths. Fork-bound tests belong under the package's `test/` directory with `*.integration.test.ts` names.
- Snapshot or schema tests not updated when generated outputs (GraphQL types, ABIs) change.

### Wrong-place findings (the colocation enforcer)

- **Unit test for a `src/` module added under `packages/<pkg>/test/`** — move it beside the source module. Flag as **medium**. Do not flag a unit test that is genuinely colocated with test-only support code under `test/`.
- **Integration or fork test anywhere outside `packages/<pkg>/test/`**, including under `src/` — move it to `test/` and ensure the fork project includes it. Flag as **medium**.
- **Integration or fork test without a `*.integration.test.ts` name**, or any package using a plural `tests/` directory or `*.spec.ts` naming — flag as **low** when routing is still correct, **medium** when the file leaks into a unit project or is skipped.
- **Vitest project globs that mix unit and integration files or omit either canonical set** — flag as **medium** because package-level runs may silently skip tests or execute RPC-heavy tests in the unit shard.

### Severity guidance

- **High** — onchain code path with no test at all (a contract call shipped untested).
- **High** — removed or modified public export whose tests still describe the old behavior (false negative).
- **Medium** — missing unit test for a new public export; misplaced unit/integration test; incorrect Vitest routing.
- **Low** — missing edge-case coverage on an export that already has happy-path tests; noncanonical test directory or suffix when routing remains correct.

## Out-of-scope reminders (for the sub-agent)

- Do NOT review the test assertions themselves — that's `code-quality`'s job.
- Do NOT review CI workflow / publish-flow test coverage — that's `ci-release-security`'s job.
- Do NOT propose new test infrastructure or fixtures — point at the existing helpers in `@morpho-org/test`, including `@morpho-org/test/mock` for transport-boundary unit tests, instead.
- Do NOT flag missing tests for internal (non-exported) symbols when the public surface covering them is tested.
- Do not recommend moving integration tests beside source for proximity; the package `test/` boundary is intentional and universal.
