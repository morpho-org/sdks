# TIB-2026-09-23: Stateless entity flows

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| **Date**   | 2026-09-23                                         |
| **Author** | @foulques                                          |
| **Scope**  | `morpho-sdk` 6.x (every `ActionOutput` handle), `wdk-protocol-lending-morpho-evm` consumers of those handles |

## Context

Every write in `morpho-sdk` is a lazy `ActionOutput` handle: `getRequirements()` reads chain state
and returns the approvals, permits, and authorizations still missing; `buildTx(signatures)`
synchronously encodes the final transaction from the handle's inputs and the signatures collected
by the caller. Integrators run these two steps in different places — a backend prepares the
requirements, a wallet signs them, and a relayer or a later process submits the transaction from a
handle it rebuilt with the same inputs. Serialized requirements and signatures are resumed hours
later, sometimes after a redeploy.

On `next`, the Vault V1 and Vault V2 handles did not honor this: `getRequirements()` stored
the vault snapshot it fetched, the share cap it derived, and the permit it expected in the closure,
and `buildTx()` accepted only signatures matching "the latest completed read". A handle built from
the same inputs on another instance therefore rejected a valid signature or produced a different
transaction, and `buildTx()` on a fresh handle used a different cap than the prepared one. The root
`AGENTS.md` and the entity guidance already state the rule; no TIB records it as a decision, so
implementations drifted away from it and reviewers had no acceptance checklist to hold PRs against.

## Goals / Non-Goals

**Goals**

- Make "no state shared between `getRequirements()`/`sign()` and `buildTx()`" a recorded design
  decision for every entity flow, not a per-flow convention.
- Give reviewers and review agents an objective checklist to detect a stateful handle.

**Non-Goals**

- Forbidding transient concurrency control inside `getRequirements()` (sharing one in-flight read
  between overlapping callers) as long as `buildTx()` never consumes it.
- Forbidding pure, input-derived computation performed once at handle construction (normalizing
  reallocations, validating a supplied snapshot, deriving a cap from immutable inputs).
- Making `buildTx()` asynchronous or letting it read chain state to "refresh" a value.

## Decision

An `ActionOutput` handle is a pure function of the inputs the caller passed at construction.
`buildTx(signatures)` derives everything it encodes from those inputs and from the
`RequirementSignature` objects it is handed; it never reads a value that `getRequirements()` or
`sign()` wrote. Any value that only signing or requirement resolution can produce travels on the
signature — on `signature.args` — so the signature is the only transport between the two steps.

Consequently two handles built from identical inputs, on different entity instances or different
processes, produce identical transactions for the same signatures, and a handle whose
`getRequirements()` was never called builds the same transaction as one whose requirements were
resolved.

## Behavior

- If a caller builds handle A, awaits `A.getRequirements()`, signs, then builds handle B from the
  same inputs on any instance, then `B.buildTx(signatures)` equals `A.buildTx(signatures)`.
- If `buildTx()` needs a value the caller cannot know before requirements resolve (a Permit2
  funding cap, a Midnight offer-root payload), then that value is read from the matching
  signature's `args` and validated against the handle's immutable inputs; a signature carrying an
  inconsistent value is rejected with a typed error rather than silently replaced.
- If a flow needs a chain snapshot to derive its transaction (vault data, position data), then the
  caller supplies that snapshot as a handle input; `getRequirements()` may validate it against the
  chain but never replaces it for `buildTx()`.
- If concurrent `getRequirements()` calls share one in-flight promise, that promise is cleared when
  it settles and is never awaited or read by `buildTx()`.

## Invariants

- `buildTx()` is synchronous and reads no chain state, clock, or randomness.
- No `Map`, `Set`, array, object, or `let` binding captured by an `ActionOutput` closure is both
  written by `getRequirements()`/`sign()` and read by `buildTx()`.
- Every signing-derived value consumed by `buildTx()` is present on a `RequirementSignature`
  passed to it and is serializable (a serialized requirement + signature resumed on a fresh handle
  builds the same transaction).
- The existing entity guidance (`packages/morpho-sdk/src/entities/AGENTS.md`) and the root
  `AGENTS.md` "Stateless, immutable, composable" rule remain the normative wording; this TIB records
  the decision and its acceptance checklist and does not relax either.

## Rejected alternatives

- **Cache the resolved snapshot in the closure and let `buildTx()` fall back to it.** Rejected:
  the handle's output then depends on whether and when `getRequirements()` ran, so
  prepare-on-A → finalize-on-B and serialize-then-resume produce different calldata with no error.
- **Make `buildTx()` async so it can refetch what it needs.** Rejected: it breaks the Action-layer
  purity table in root `AGENTS.md` §1, makes builders untestable without a transport, and hides a
  network dependency in the step integrators run at submission time.
- **Return the derived values from `getRequirements()` and require callers to pass them back.**
  Rejected: it widens `buildTx()`'s input surface per flow and duplicates what the signature
  already carries; the `RequirementSignature` is the single transport.

## Acceptance Criteria

- [ ] Every entity flow that consumes a signature has a test proving a signature prepared on one
      handle finalizes identically on a fresh handle built from the same inputs; the test fails if
      `buildTx()` starts reading closure state.
- [ ] Every value `buildTx()` derives from a signature is read from `signature.args`, validated
      against the handle's immutable inputs, and rejected with a typed error on mismatch.
- [ ] Review confirms no closure variable of an `ActionOutput` is written in
      `getRequirements()`/`sign()` and read in `buildTx()`; in-flight promise coalescing is the only
      permitted mutable binding and is never consumed by `buildTx()`.
- [ ] Any new flow's PR cites this TIB when it introduces a signing-derived value and shows where
      that value lives on the signature.

## References

- Root `AGENTS.md` §1 "Stateless, immutable, composable".
- `packages/morpho-sdk/src/entities/AGENTS.md` "Responsibilities".
- [TIB-2026-06-03-midnight-action-output-interface](./TIB-2026-06-03-midnight-action-output-interface.md)
  — first flow to carry a signing-derived payload on `signature.args`.
- https://github.com/morpho-org/sdks/pull/1148 — Vault V1/V2 handles made stateless.
