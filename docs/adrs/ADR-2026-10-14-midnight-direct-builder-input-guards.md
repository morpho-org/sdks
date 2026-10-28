# ADR-2026-10-14: Reject zero `onBehalf` in Midnight direct builders

| Field      | Value                 |
| ---------- | --------------------- |
| **Status** | accepted              |
| **Date**   | 2026-10-14            |
| **Author** | @devin-ai-integration |
| **Scope**  | `morpho-sdk` 8.x      |

_Status is the only field that changes after acceptance._

## Context

`morpho-sdk` releases through `8.2.0` encode a zero `onBehalf` silently in
`midnightSupplyCollateral`, and in `midnightRedeem` when a non-zero `receiver`
is given. `midnightRedeem` with a zero `onBehalf` and no `receiver` already
fails, but with `MidnightZeroReceiverError` for the defaulted receiver rather
than an error naming the account. Adding a new `@throws` class to an existing
export is breaking under `docs/jsdoc-style.md` §5, and AGENTS.md §7 normally
requires a deprecation minor.

The `uint128` bounds and zero/contract receiver checks for these builders
already ship on `main` separately; this decision covers only rejecting a zero
`onBehalf`.

## Decision

In `morpho-sdk` 8.x, `midnightSupplyCollateral` and `midnightRedeem` throw
`MidnightZeroOnBehalfError` when `onBehalf` is the zero address.
`MorphoMidnight.supplyCollateral` exposes the same error from `buildTx()` when
`accountAddress` is zero, while `MorphoMidnight.redeem` throws it when
`redeem()` is called. In `redeem`, the zero-account error is raised before
resolving and validating the receiver. For `redeem` with no `receiver`, this
replaces the `MidnightZeroReceiverError` previously thrown for the defaulted
receiver.

This guard ships in a minor without the successor-introduction, `@deprecated`
and one-minor coexistence steps or a major changeset or migration guide. A
deprecation window would keep an invalid zero-account transaction reachable,
while valid inputs retain their existing calldata. This exception covers only
the named builders, entity methods and `MidnightZeroOnBehalfError`; other new
errors follow the default deprecation flow. The changeset, `@throws` JSDoc and
tests remain required.

## Invariants

- A zero `onBehalf` throws `MidnightZeroOnBehalfError` in both direct builders;
  entity `supplyCollateral` exposes it from `buildTx()`, while entity `redeem`
  throws it when `redeem()` is called → builder and entity tests.
- Redeem reports a zero `onBehalf` before resolving or validating its default
  receiver → builder and entity zero-account tests.
- The guard does not change valid calldata or the separately shipped `uint128`
  and receiver validations → existing builder and entity tests.
- The exception covers only the named APIs and error → review against this
  record; other new `@throws` classes use the default deprecation flow.

## Rejected alternatives

- **The default deprecation flow.** Rejected because the coexistence step would
  keep a zero-account transaction reachable.
- **A major changeset and migration guide.** Rejected in favor of a minor
  because the guard rejects an invalid account while valid inputs keep their
  calldata.

## References

- [ADR-2026-10-02: MidnightBundlesV2 SDK actions](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)
