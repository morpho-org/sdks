# ADR-2026-10-13: EVM simulation — quoted execution-time values

| Field      | Value                     |
| ---------- | ------------------------- |
| **Status** | accepted                  |
| **Date**   | 2026-10-13                |
| **Author** | @jinmel                   |
| **Scope**  | `evm-simulation` 7.x      |

_Status is the only field that changes after acceptance._

## Context

ADR-2026-10-01 limited `simulate()` to caller-quoted net deltas on wallet balances and Blue or
vault share positions. Several effects consumers want bound were still unexpressible because their
values are only known at execution time: the Blue supply positions an in-kind vault redeem delivers,
the conversion rate a vault exit realizes (share price), the Vault V2 force-exit penalty and its
per-market deallocations, and the caller's final Blue position once the bundle settles. Callers could
only approximate these with `sharesBurned` plus `assetsReceived`, leaving the delivered position
itself unchecked.

## Decision

Callers may quote execution-time values alongside the existing delta fields. Each is checked inside
the same pinned simulated block, from before/after reads, deltas already measured, or the simulated
calls' event logs, under the
caller's tolerance; nothing is inferred or defaulted, and unquoted values are still not read.

- In-kind redeems measure the per-market Blue supply shares delivered to the receiver: a `positions`
  quote of `{ marketId, supplyShares }` entries, each bounded as an output
  (`delta >= ceil(expected × (1 − tolerance))`). It is valid only on `vaultV1InKindRedeem` and
  `vaultV2InKindRedeem`, and entries must be a non-empty list of distinct markets.
- The realized conversion rate is bounded with a caller-quoted `{ expected, tolerance }` share
  price — `expected` RAY-scaled (raw assets per raw share × 1e27, the on-chain share-price scale),
  `tolerance` a WAD fraction — computed from the observed assets and shares with no extra reads.
- Force exits may additionally quote the penalty charged and the per-market deallocated assets.
- Post-execution Blue position bounds are absolute, not deltas: a maximum borrow-share count, minimum supply shares
  and minimum collateral, compared against the position state after the bundle.

Not covered: LTV or health bounds (they need oracle and market reads and are a follow-up),
collateral-amount checks (Blue moves exact collateral amounts), and liquidation or flash-loan checks
(no SDK action path).

This supersedes ADR-2026-10-01's statement that in-kind redeemed positions are not measured, and its
"no separate penalty checks" position, only for the quoted fields above; unquoted penalty and
refund amounts remain unchecked.

## Invariants

- No execution-time value is read or checked unless the caller quoted it → request-parser and
  slippage-check tests: a `positions` quote on a non-in-kind operation, an empty list, a duplicate
  market or a negative share count is a `SimulationValidationError`, and an operation without the
  quote issues no position read.
- Each quoted per-market delivery is bounded as an output at the caller's tolerance → bound tests
  pass at the bound and fail just below it; missing position evidence is
  `SlippageCheckUnavailableError` and a breach is `ConsumerLimitViolationError` naming the
  market.
- A quoted share-price bound is realized from the operation's priced pair with rounding against the
  caller: mulDivUp and a rounded-down cap when higher is adverse, mulDivDown and a rounded-up floor
  when lower is adverse → bound tests at and just past each direction's bound; the parser requires
  both pair fields quoted and rejects the bound on collateral-only, in-kind, refinance and migration
  operations.
- Quoted force-exit economics are realized from the simulated calls' event logs, not new state reads.
  The penalty sums `penaltyAssets` over the vault's `ForceDeallocate` events whose `onBehalf` is the
  account. Each of those events is paired, within the same user call, with the nearest earlier
  unpaired Morpho `Withdraw` from its adapter for the same amount, and deallocations sum the paired
  withdrawals per market, so liquidity-adapter withdrawals are not counted. A zero penalty and empty
  deallocations hold only when the vault's ERC4626 `Withdraw` for the account is present; the check
  throws `SlippageCheckUnavailableError` if it is absent, a `ForceDeallocate` charges a penalty to
  another account, or a force deallocation has no paired Blue `Withdraw` while `deallocations` is
  quoted. More than quoted is adverse; a deallocation in an unquoted market is a violation → bound
  tests at and just past each quote, fail-closed tests for a missing vault `Withdraw`, a foreign
  penalty and an unpaired adapter, parser rejects the fields on other operation types, an empty
  list, a duplicate market or a negative amount.
- Quoted Blue position bounds are absolute after-state values compared inclusively, never deltas and
  never scaled by the tolerance: borrow shares capped, supply shares and collateral floored → bound
  tests at and just past each field; the subject is the limit's account in the operation's Blue
  market (the refinance target, where the debt lands), the parser rejects the bound on vault
  operations, and missing position evidence is `SlippageCheckUnavailableError`.
- Revisit if a consumer needs an execution-time bound that cannot be expressed as a quote on a
  selected subject.

## Rejected alternatives

- **Decode the redemption's market list from calldata.** Rejected because `simulate()` checks
  caller-quoted values only; the caller already knows which deliveries it expects.
- **A single aggregate supply-shares quote.** Rejected because it cannot detect delivery into the
  wrong market; per-market quotes pin each leg.

## References

- Supersedes, in part: [ADR-2026-10-01](./ADR-2026-10-01-evm-simulation-quoted-slippage-limits.md)
