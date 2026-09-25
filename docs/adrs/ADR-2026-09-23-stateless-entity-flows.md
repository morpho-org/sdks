# ADR-2026-09-23: Stateless entity flows

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| **Status** | accepted                                                  |
| **Date**   | 2026-09-23                                                |
| **Author** | @Foulks-Plb                                               |
| **Scope**  | Packages and target versions: `morpho-sdk` 6.x (every `ActionOutput` handle), `wdk-protocol-lending-morpho-evm` consumers of those handles |

_Status is the only field that changes after acceptance._

## Context

Every write in `morpho-sdk` is a lazy `ActionOutput` handle: `getRequirements()` reads chain state
and returns the approvals, permits, and authorizations still missing; `buildTx(signatures)`
synchronously encodes the final transaction from the handle's inputs and the signatures collected by
the caller. Integrators run these two steps in different places — a backend prepares the
requirements, a wallet signs them, and a relayer or a later process submits the transaction from a
handle it rebuilt with the same inputs. Serialized requirements and signatures are resumed hours
later, sometimes after a redeploy.

Before this decision, the Vault V1 and Vault V2 handles did not honor that: `getRequirements()`
stored the vault snapshot it fetched, the share cap it derived, and the permit it expected in the
closure, and `buildTx()` accepted only signatures matching "the latest completed read". A handle
built from the same inputs on another instance therefore rejected a valid signature or produced a
different transaction, and `buildTx()` on a fresh handle used a different cap than the prepared one.
The root `AGENTS.md` and the entity guidance already stated the rule as a convention; no record froze
it as a decision, so implementations drifted away from it and reviewers had no acceptance checklist
to hold PRs against.

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

The observable rules this imposes:

- If a caller builds handle A, awaits `A.getRequirements()`, signs, then builds handle B from the
  same inputs on any instance, then `B.buildTx(signatures)` equals `A.buildTx(signatures)`.
- If `buildTx()` needs a value the caller cannot know before requirements resolve (a Permit2 funding
  cap, a Midnight offer-root payload), that value is read from the matching signature's `args`. An
  identity field the handle can re-derive from its immutable inputs (spender, owner, root, offer
  count) is compared to them and a mismatch is rejected with a typed error rather than silently
  replaced. A field the chain enforces itself (the signed deadline) is checked for `args` ↔
  `action.args` consistency with a typed error and encoded as signed. A bound the signer may
  legitimately have signed wider than the fresh derivation (the Blue share-mode repay funding cap) is
  validated as a lower bound: the signed cap is encoded as-is and `MaxRepayAssetsBelowRepayAssetsError`
  fires only when it no longer covers the freshly derived minimum. An opaque payload the handle
  cannot re-derive synchronously (the Midnight encoded offer-root payload) is bound to the handle
  through the validation of its sibling `args` and a presence check; `buildTx()` does not promise
  byte-level integrity of such a payload. Integrity of an opaque payload across storage and transport
  is the caller's obligation (the signature it accompanies is the caller's proof of origin), exactly
  as it is for the signature bytes themselves; a flow that introduces a new opaque payload must state
  in its PR why the payload cannot be re-derived synchronously rather than inherit this bar.
- If a flow needs a chain snapshot to derive its transaction (vault data, position data), the caller
  supplies that snapshot as a handle input; `getRequirements()` may validate it against the chain but
  never replaces it for `buildTx()`.

The decision deliberately does not forbid: transient concurrency control inside `getRequirements()`
(sharing one in-flight read between overlapping callers) as long as `buildTx()` never consumes it;
pure, input-derived computation performed once at handle construction (normalizing reallocations,
validating a supplied snapshot, deriving a cap from immutable inputs). It does not make `buildTx()`
asynchronous or let it read chain state to "refresh" a value. This adds no public symbol and changes
no signature; it is a purity constraint the existing surface already admits, so it carries no semver
consequence of its own.

## Invariants

- `buildTx()` is synchronous and reads no chain state, clock, or randomness → grep the builder for
  `await`, `Date`, `Math.random`, and `viem/actions` reads; any hit fails.
- No `Map`, `Set`, array, object, or `let` binding captured by an `ActionOutput` closure is both
  written by `getRequirements()`/`sign()` and read by `buildTx()`. The only permitted mutable binding
  is an in-flight `getRequirements()` promise shared between concurrent callers, cleared on
  settlement, and never awaited or read by `buildTx()` → `module-api-architecture` review flags a
  consumed closure binding as **critical**.
- Every entity flow that consumes a signature has a test proving a signature prepared on one handle
  finalizes identically on a fresh handle built from the same inputs → the cross-handle test fails if
  `buildTx()` starts reading closure state; `test-coverage` flags a signature-consuming flow that
  lacks one as **high**.
- Every value `buildTx()` derives from a signature is present on a `RequirementSignature` passed to
  it and is serializable → a serialized requirement + signature resumed on a fresh handle builds the
  same transaction. Every re-derivable identity field is validated against the handle's immutable
  inputs and rejected with a typed error on mismatch; every signed bound is validated against the
  fresh derivation in the direction the contract enforces (lower bound for funding caps); every
  opaque payload is presence-checked with its sibling `args` validated.
- The existing entity guidance (`packages/morpho-sdk/src/entities/AGENTS.md`) and the root `AGENTS.md`
  "Stateless, immutable, composable" rule remain the normative wording → this record freezes the
  decision and its acceptance checklist and relaxes neither; any new flow's PR that introduces a
  signing-derived value cites this ADR and shows where the value lives on the signature.

## Rejected alternatives

- **Cache the resolved snapshot in the closure and let `buildTx()` fall back to it.** Rejected: the
  handle's output then depends on whether and when `getRequirements()` ran, so
  prepare-on-A → finalize-on-B and serialize-then-resume produce different calldata with no error.
- **Make `buildTx()` async so it can refetch what it needs.** Rejected: it breaks the Action-layer
  purity table in root `AGENTS.md` §1, makes builders untestable without a transport, and hides a
  network dependency in the step integrators run at submission time.
- **Return the derived values from `getRequirements()` and require callers to pass them back.**
  Rejected: it widens `buildTx()`'s input surface per flow and duplicates what the signature already
  carries; the `RequirementSignature` is the single transport.

## References

- Root `AGENTS.md` §1 "Stateless, immutable, composable".
- `packages/morpho-sdk/src/entities/AGENTS.md` "Responsibilities".
- [ADR-2026-06-03-midnight-action-output-interface](./ADR-2026-06-03-midnight-action-output-interface.md)
  — first flow to carry a signing-derived payload on `signature.args`.
- https://github.com/morpho-org/sdks/pull/1148 — Vault V1/V2 handles made stateless.
