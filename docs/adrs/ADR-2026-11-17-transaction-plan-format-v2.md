# ADR-2026-11-17: Denomination-explicit TransactionPlan format 2

| Field | Value |
| --- | --- |
| **Date** | 2026-11-17 |
| **Author** | @jinmel |
| **Scope** | `morpho-sdk`; experimental TransactionPlan stored format 2 |

_Frozen after merge; only superseded-by entries in References change._

## Context

SDK 9.7.0 shipped TransactionPlan format 1 with generic `amount` and `nativeAmount`
stored quantities. Denomination-explicit fields distinguished assets from shares but
changed that persisted shape incompatibly. Experimental API status permitted a minor
release, not reinterpretation of a previously supported format version.

## Decision

Preparers emit `version: 2`, and the `TransactionPlan` type carries that literal.
This SDK supports only format 2. Plan readers, signature attachment and builders reject
format 1 and other unsupported versions with `UnsupportedTransactionPlanVersionError`
before interpreting action fields. There is no legacy parser or automatic migration.

Deposit and withdrawal preparation uses `assets`; exact-share redemption uses `shares`.
Stored deposit inputs contain exactly one of `assets` and `nativeAssets`; withdrawals
store `assets`, redemptions store `shares`, and approvals store exactly one of `assets`
and `shares` according to the token they authorize. Other stored action quantities likewise
name their asset/share denomination. Signature-request protocol fields are excluded from
these renames. Native deposit preparation still takes `assets`.

Every ERC-2612 request, for an asset or vault shares, retains protocol-native `args.amount`
and typed-data `value`. For deposit permits, both equal the gross deposit `assets`.
Native deposits need no asset permit. Request nonces, deadlines, signatures, ABI arguments
and stable entity APIs are not renamed.
For equivalent operation inputs, transaction calldata is unchanged.

This supersedes only the stored-shape and supported-version descriptions in
ADR-2026-11-04-transaction-plan-format. Its statelessness, signing, validation and
security boundaries remain in force. Integrators must rename preparation inputs from
`amount` to `assets` (or `shares` for redemption). They must also migrate trusted saved
plans' fields and version before restoring them, or prepare new plans. This experimental
break ships with a minor changeset describing that migration.

## Invariants

- Format-2 stored recipes restore to committed fixed transaction bytes.
- A legacy 9.7.0-shaped format-1 plan fails with the version error before field validation.
- Empty and populated unsupported plans fail across all plan interpreters.
- EIP-712 domain versions are independent of the plan format and remain unchanged.

## References

- ADR-2026-11-04-transaction-plan-format: prior persisted format and retained security boundaries.
