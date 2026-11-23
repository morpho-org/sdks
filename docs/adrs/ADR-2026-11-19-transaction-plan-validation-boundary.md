# ADR-2026-11-19: Offline validation of stored TransactionPlans

| Field | Value |
| --- | --- |
| **Date** | 2026-11-19 |
| **Author** | @Foulks-Plb |
| **Scope** | `morpho-sdk`; experimental TransactionPlan validation |

_Frozen after merge; only superseded-by entries in References change._

## Context

Persisted plans crossed process and storage boundaries after signatures were collected.
Verification only when attaching a signature left restored signatures trusted by builders,
even when they no longer matched their signing payload. Integrators needed a consistent
offline validation boundary without confusing signature validity with operation intent.

## Decision

Parsing, inspection and transaction building reverify referenced stored signatures offline,
after checking each request against its action. Signature attachment verifies retained signatures
and replacements, allowing an invalid stored signature to be replaced without trusting it.

Permits bind owner, token, spender, value, nonce, deadline and chain. Morpho authorizations bind
owner, authorized address, nonce, deadline and chain; they do not bind operation amounts,
markets or referral fees/recipients. Integrators remain responsible for protecting unsigned
fields. A valid signature does not establish that a stored operation matches their intent.

Parsing, inspection and builders share header checks: byte-aligned hex `calldataOrigin` of at
most 1 MiB, action chain/account matching the plan, unique step and request IDs, and deadlines
no earlier than `expiresAt`. A signature request may be referenced by only one step. Validation
reads no clock or live state; it does not establish current expiry, allowance or nonce freshness.
Missing signatures on unrelated steps do not prevent a selected step from being built.

Invalid stored signatures are reported by parsing as `InvalidTransactionPlanError` at the
request's signature path, retaining the underlying cause. Direct helpers expose their named
validation and signature errors. These additions to existing exports' error contracts ship
in a minor release under the experimental TransactionPlan policy; the stored format is unchanged.

## Invariants

- Stored signatures must match their action-bound request owner and payload → wrong-signer and
  tampered-permit regression tests at parsing, inspection and building boundaries.
- A replacement can repair only its named request → signature-replacement regression tests.
- Direct and restored plans obey the same header rules → malformed-header regression tests.
- Signature failures identify the stored field and preserve their cause → parser error-path tests.
- Valid plans retain their calldata → committed transaction-byte and signed-plan round-trip tests.
- Builders remain synchronous and clock/RPC-free → purity checks in code review.

## References

- ADR-2026-11-04-transaction-plan-format: supersedes its stored-signature verification and
  restored-header validation rules, not its integrator-intent boundary.
- ADR-2026-11-17-transaction-plan-format-v2: retained persisted shape and supported version.
