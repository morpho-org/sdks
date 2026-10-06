---
name: sdk-correctness
description: Implementation and failure behavior in TypeScript code in morpho-org/sdks-internal. Use when a change touches function bodies: types and assertions, bigint units, input mutation, error classes and causes, catch blocks, promises, optional lookups with _try, fallback or retry, generated GraphQL outputs, or code that handles secrets or untrusted strings. Checks that results are right and that failures reach the caller instead of dying silently. Not for protocol math or transaction authority (sdk-protocol-safety) or public API shape (sdk-compatibility).
---

# Implementation and failure behavior

This skill applies the `code-quality`, `silent-failure-hunter` and
`style-conventions` personas in `.agents/pr-review-engine/agents/` and root
`AGENTS.md` §2, §3, §8 and §9. They are authoritative; when wording differs,
they win and this file is out of date.

Trace each changed input to the public result, including failures that a
caller could mistake for success. Biome and knip already run in `pnpm lint`;
don't restate what they enforce.

Apply each section only when its condition holds.

## 1. Types and units

**Applies when** the diff changes `.ts` code.

- No `any`, `@ts-ignore`, or `@ts-expect-error` without an issue link and a
  deletion plan, and no `as unknown as` outside tests (§2 rule 1). Test files
  may use `as unknown as` for narrow fixtures or test-only adapters.
- Unsafe `as` assertions, missing generics or an escape hatch on a hard-to-type
  API point to the wrong shape; say what shape would type cleanly.
- Onchain quantities and WAD-scaled rates are `bigint`, never `number`. Check
  scaling, conversions and truncation against the canonical helpers.
  `morpho-ts` adds rules on nullability, numeric input kinds and time; read
  its contract when the diff relies on them.
- Protocol constants are named `as const` lists, not magic numbers or
  strings. `switch` over a union is exhaustive; a `default:` that the types
  make unreachable is dead code.
- SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`, `MarketParams`)
  are reused, not redeclared.
- Use the direct dependency's semantic helpers: viem's `isAddressEqual` for
  address equality. Lowercasing stays valid when normalizing is the goal, as
  for map keys or deterministic output.

## 2. Inputs and generated code

**Applies when** the diff changes a function that receives objects, or files
under a generated path.

- Input arguments are never mutated (§2 rule 4). Returning an input unchanged
  is allowed unless a fresh object is promised.
- Generated outputs (`src/api/sdk.ts`, anything under `lib/`) change only
  through their inputs (`graphql/*.gql`) and codegen. A regenerated file that
  matches its inputs is expected; a hand edit is a finding. For
  `liquidity-sdk-viem`, read the GraphQL inputs and codegen config.
- Written rules on guard clauses, helper extraction, naming and duplication
  apply to touched and refactored code (§9). Don't report a cosmetic
  alternative.

## 3. Errors reach the caller

**Applies when** the diff throws, catches, wraps, awaits or ignores a result.

- Every failure is a named, exported error class, not `throw new Error`
  (§2 rule 2). Wrapping keeps `cause`. Messages read like instructions in the
  §3 format, with interpolated values quoted. A changed error class is a
  change integrators pattern-match on.
- Follow each `catch`, promise, callback and important return value to its
  caller:
  - an empty or broad `catch`, or one that only logs on a path that can't
    recover;
  - a promise with no rejection handling, or a `Promise.all` whose rejection
    is dropped;
  - a `simulate()` result or `tx.wait()` that is never checked or awaited;
  - a callback called only on success;
  - a `catch` that rethrows a generic error and loses the typed `cause`.
  A returned rejection that propagates to the caller is fine without a local
  `catch`.
- Optional lookups use `_try(accessor, ExpectedError)` and name the expected
  errors, so unrelated failures propagate. An accessor that can legitimately
  return `undefined` must tag that absence (for example as `null`) so success
  stays distinguishable from a caught failure.

## 4. Fallback and retry

**Applies when** the diff adds or changes a fallback, retry or bypass.

Check which failures may trigger it, what state it restores, and what the
caller is told. In `evm-simulation`, only `ExternalServiceError` permits a
backend fallback or bypass; `SimulationRevertedError` propagates as a bundle
failure, and domain errors stay under `SimulationPackageError`.

## 5. Secrets and untrusted input

**Applies when** the diff handles credentials, RPC URLs, or strings that
reach a command, query, `eval`, `Function(...)`, dynamic `import()` or HTML.

- Trace attacker-controlled input to the place it is interpreted, and check
  the escaping or validation it inherits before reporting.
- Hardcoded secrets, API keys, private keys, mnemonics or credentialed RPC
  URLs are critical; tell real credentials apart from fixtures and give their
  location without copying the value. Cross-check
  `.agents/pr-review-engine/references/secrets.md`.
- CI and install trust belong to `sdk-release-integrity`.

## Severity

These follow the personas; `.review/review.md` maps them to Lupin's levels.

- **Critical:** a hardcoded secret; `eval` or `Function(...)` on user input.
- **High:** `any`, `as unknown as` or a suppression without a deletion plan;
  `throw new Error`; input mutation; a signature change that breaks callers
  in the repo; a swallowed error or unawaited `tx.wait()` on a path that
  moves money or signs; an unhandled rejection on the happy path of an
  export.
- **Medium:** duplication, deep nesting or magic numbers; an empty `catch` or
  ignored return value on a non-critical path; a hand-rolled version of an
  available semantic helper.
- **Low:** a redeclared SDK type; a dead branch a tighter union would catch.

## Report

Each finding names the input and the path to the caller-visible result or
failure, and the rule it breaks. A finding shows lost or misclassified
behavior, or a binding written rule; preferring another implementation is
not one.
