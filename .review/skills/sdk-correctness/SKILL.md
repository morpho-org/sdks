---
name: sdk-correctness
description: Assess changed implementation and failure behavior for types, units, input mutation, errors, promises, optional lookups, fallback, generated sources, secrets or injection.
---

# Implementation and failure behavior

Read root `AGENTS.md` §1–3 and §8–9 plus affected package contracts. Trace changed inputs to the public result, including failures that could be mistaken for success. Protocol math and authority use `security-investigation`; API shape and ownership use `architecture-simplicity-reuse`.

## Results and conventions

- Apply strict types and discriminated/exhaustive branches. Check unsafe assertions, any and diagnostic suppression against root exceptions: narrow test fixtures/adapters may use double assertions, and permitted suppressions require an issue/deletion plan.
- Onchain quantities/rates use bigint; check scaling, numeric conversion and truncation against canonical helpers. `morpho-ts` adds nullability, numeric input-kind preservation and time assumptions; read its contract when implicated.
- Inputs remain immutable and public fields readonly. Returning unchanged input identity is allowed unless freshness is promised. Descriptor freezing and class-instance exceptions follow the architecture area.
- Apply written helper-extraction, guard-clause, naming and duplication rules to changed/refactored surfaces. Trust applicable mechanical checks for what they establish; avoid reporting cosmetic alternatives.
- Reuse direct-dependency semantic helpers: isAddressEqual for address equality, explicitly typed _try for optional failure. Lowercasing is valid for normalized keys/output. Reuse exported SDK types and respect NodeNext/type-only imports.
- Generated GraphQL/build outputs follow their authoritative inputs and generation path; an expected regenerated artifact differs from a manual edit. For `liquidity-sdk-viem`, inspect graphql inputs and codegen configuration.

## Failure propagation and trust

- SDK failures use named exported classes; wrapping preserves cause. Check thrown-type compatibility and messages against the caller contract, including actionable instructions and the documented interpolation conventions.
- Follow catches, promises, critical return values and callbacks through callers. A returned rejection can propagate correctly without a local catch. Logging-only nonrecoverable failures, detached promises or a swallowed cause need a concrete caller consequence.
- _try(accessor, ExpectedError) names expected errors; unrelated errors propagate. Successful undefined must remain distinguishable from a caught failure using the documented tagged/null representation.
- Check fallback/retry eligibility, restoration and outcomes. In `evm-simulation`, only ExternalServiceError permits backend fallback/bypass; SimulationRevertedError propagates as a bundle failure, and domain errors remain under SimulationPackageError.
- Follow receipt/simulation results and loading/error states only where the changed code owns them. A deliberately returned descriptor/hash is different from representing an unmined or failed transaction as success. Inspect default/dead branches against actual unions and decoding.
- Trace attacker-controlled input into commands, queries, evaluation, imports or HTML interpretation; inspect inherited escaping/validation. Identify real credentials versus fixtures/references and report locations without copying values. CI trust and dependency install behavior use `developer-workflow`.

Finish when implicated results/failure mechanisms have concrete checks and evidence, or explicit gaps. A retained finding identifies lost/misclassified behavior or a binding rule, not a preference for another implementation.
