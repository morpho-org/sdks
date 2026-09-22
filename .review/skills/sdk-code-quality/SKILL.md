---
name: sdk-code-quality
description: Use for changed TypeScript implementation, types, errors, public callers, input mutation, or code-level secrets and injection.
---

# SDK code correctness

Read root `AGENTS.md` §1–3 and the affected package/nested instructions in the reviewed checkout. Trace changed inputs through the implementation and its callers. Apply the common evidence and output rules in the repository review guidance.

## Check the implicated behavior

- Enforce strict TypeScript and the root's escape-hatch rule: inspect `any`, unsafe assertions, suppressed diagnostics and `as unknown as`. Preserve the documented exception for narrow fixtures/test-only adapters; permitted suppressions need the required issue and deletion plan. Explain the actual broken contract or violated rule.
- SDK failures use named, exported error classes. Check public thrown-type compatibility and `cause` preservation; follow handling through `sdk-silent-failure-hunter` when a failure may disappear.
- Inputs stay immutable; returned identity follows the function's contract. Returning an unchanged input is allowed unless a fresh object is promised. Public fields are readonly; immutable transaction descriptors are frozen, while class instances are not deep-frozen.
- Onchain quantities and WAD-scaled rates use bigint. Check units, numeric conversion, overflow/truncation, protocol constants and discriminated branches. Read canonical MathLib/constants rather than infer rounding or scale.
- Check changed exports and signatures against callers: parameter order, narrowing, return values, sync/async behavior and typed failures. Load `sdk-module-api-architecture` for public-surface design and compatibility.
- Evaluate duplication, nesting, naming, dead branches and helper extraction against written repository obligations and the reachable consequence. Guard clauses, explicit responsibility and the root's local-helper call-site rule apply; stylistic alternatives alone are not findings.
- Trace attacker-controlled input into shell arguments, queries, dynamic evaluation, imports or HTML interpretation. Confirm inherited escaping/validation. Report secret locations without reproducing values; distinguish real credentials from fixtures and variable references.

## Package-specific contracts

Read `packages/morpho-ts/AGENTS.md` for nullability, numeric input-kind preservation, shared primitives and time assumptions. Read the owning package's instructions before treating a pure helper or framework dependency as forbidden. For generated GraphQL or build outputs, inspect the authoritative inputs and generation path rather than proposing hand edits.

Finish when changed mechanisms have checks and evidence recorded, or explicit coverage limits, and retained claims survive caller/counterexample inspection. Tests read are static evidence; execution requires the assigned capability.
