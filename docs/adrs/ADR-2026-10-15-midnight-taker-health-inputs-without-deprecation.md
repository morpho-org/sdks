# ADR-2026-10-15: Require Midnight taker health inputs without a deprecation minor

| Field      | Value                       |
| ---------- | --------------------------- |
| **Status** | accepted                    |
| **Date**   | 2026-10-15                  |
| **Author** | @jinmel                     |
| **Scope**  | `morpho-sdk` 8.0.0          |

_Status is the only field that changes after acceptance._

## Context

Midnight checks a position's health only at the exact liquidation threshold (LLTV): a position is
healthy while the sum of each collateral's value times its LLTV covers the debt. The SDK's
Midnight taker flows that add debt or remove collateral build transactions that leave a position
right at that threshold, where any price move makes it liquidatable. The SDK's Blue flows already
keep a safety buffer below LLTV.

A buffered check needs the account's position and an oracle price per held collateral, and the
SDK's Midnight reads do not fetch oracle prices. AGENTS.md §7 requires the 4-step deprecation flow
for breaking changes; that flow would keep the unbuffered call form exported for one minor, and
optional inputs would let an integrator skip the buffer without noticing.

## Decision

In `morpho-sdk` 8.0.0, the Midnight taker flows `takeBorrow`, `supplyCollateralTakeBorrow`,
`takeRepayWithdrawCollateral` and `repayWithdrawCollateral` require the caller's position
snapshot and one oracle price per collateral index (scaled by `ORACLE_PRICE_SCALE`), without the
successor-introduction, `@deprecated` and one-minor coexistence steps of the §7 flow.

- Each flow rejects, before building a transaction, an operation whose post-operation debt
  exceeds the buffered maximum: each collateral's value times its own LLTV minus the buffer
  (floored at zero), rounded down.
- The flows may throw `BorrowExceedsSafeLtvError`, `WithdrawMakesPositionUnhealthyError`,
  `WithdrawExceedsCollateralError`, `MissingMarketPriceError`, `UnknownCollateralIndexError`,
  `AccrualPositionUserMismatchError` and `MarketIdMismatchError`.
- The buffer is the SDK's fixed `DEFAULT_LLTV_BUFFER` (0.5%), the same one Blue flows use;
  callers cannot change it.
- Maker flows are excluded: their debt only appears when another party fills the offer.

The exception covers only these inputs and errors on these four methods. It does not waive the
major changeset, the migration guide, the maintained-dependent audit, or continued availability of
the previous major. No other break inherits it.

## Invariants

- No listed flow builds a transaction whose post-operation debt exceeds the buffered maximum →
  the entity tests that reject a borrow or withdrawal at exact LLTV and accept it at the buffered
  boundary.
- The buffered maximum never exceeds the contract's unbuffered maximum → the property test over
  two collateral indexes.
- Revisit if the SDK's Midnight reads start returning oracle prices, which would make the price
  input redundant.

## Rejected alternatives

- **Optional inputs in a 7.x minor, required in the next major.** Rejected: during the minor
  every integrator that does not pass the inputs keeps building positions at the liquidation
  threshold without noticing.
- **Fetch oracle prices inside the SDK's Midnight position read.** Rejected: it adds one RPC
  call per held collateral to every position read and changes the Midnight read package for a
  check only these four flows need.

## References

- [ADR-2026-10-02: Route Midnight actions through MidnightBundlesV2](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)
- [ADR-2026-10-09: Ship fail-closed token, chain and contract-code errors without a deprecation minor](./ADR-2026-10-09-fail-closed-errors-without-deprecation.md)
  (precedent for new `@throws` classes without a coexistence minor)
- [ADR-2026-05-13: SDK package deprecation lifecycle](./ADR-2026-05-13-sdk-package-deprecation-lifecycle.md)
- Accepted in the PR that added this file.
