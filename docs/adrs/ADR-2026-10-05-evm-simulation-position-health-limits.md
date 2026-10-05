# ADR-2026-10-05: EVM simulation — caller-selected position health checks

| Field      | Value                       |
| ---------- | --------------------------- |
| **Status** | accepted                    |
| **Date**   | 2026-10-05                  |
| **Author** | @jinmel                     |
| **Scope**  | `evm-simulation` 5.0.0      |

_Status is the only field that changes after acceptance._

## Context

ADR-2026-10-01 limited `simulate()` to caller-quoted slippage checks and fixed `SimulationLimits`
as `{ operations?: readonly OperationLimit[] }`. A bundle could pass every slippage check and still
leave a Blue position liquidatable, or closer to its LLTV than the caller accepts. Callers had no way to
ask the simulator to check this, so they could not detect a bundle that left a position open to
immediate liquidation.

## Decision

`SimulationLimits` gains `positions?: readonly PositionHealthLimit[]`, where
`PositionHealthLimit` is `{ marketId: MarketId; account?: Address; maxLtv?: bigint }`. `account`
defaults to the transaction sender. `maxLtv` is WAD-scaled, from `0n` to `1e18` inclusive. Unknown
keys and `maxLtv` above `1e18` are `SimulationValidationError`. Omitting `positions` skips the
check and adds no reads or RPC calls.

For each entry, `simulate()` reads the market's params at the pinned block. After the user
transactions and inside the same `eth_simulateV1` call, it calls `accrueInterest`, then reads the
market totals, the oracle price and the position. Each entry must then pass two checks:

- The position is healthy at the market LLTV, using Morpho's rule: borrow assets rounded up are
  at most `collateral × price / 1e36 × lltv / 1e18`, both rounded down.
- When `maxLtv` is set, the LTV after the bundle, rounded up, is at most `maxLtv`.

A position without debt passes. A failed check throws `ConsumerLimitViolationError`. Its context
has `stage: "verification"`, `account`, `field: "health-position:<marketId>:<account>"` (lowercase),
`expected` (the LLTV or `maxLtv`) and `observed` (the LTV). A market that is not created, or a
failed params read, throws `MissingVerificationEvidenceError`, or `ExternalServiceError` when the
transport fails. Empty return data from a post-bundle read is `MissingVerificationEvidenceError`;
return data that cannot be decoded is `InvalidSimulationResponseError`.

`SimulationVerification` gains `positions: readonly CheckedPositionHealth[]`, one entry per limit in
order: `{ marketId, account, lltv, ltv, maxLtv? }`, where `ltv` is `0n` without debt.
Non-empty `limits.positions` requires a Morpho Blue address, like `limits.operations`.

The check is not tied to an operation and needs no slippage quote. The simulator never adds a
health check on its own, never picks a buffer below the LLTV, and never infers the market from
calldata. Pre-liquidation contracts and Midnight positions are not covered.

The change adds to the unreleased `evm-simulation` 5.0.0 API and breaks nothing that has been
released.

## Invariants

- No `limits.positions` means no extra RPC calls or simulated calls → unit tests for
  `resolveHealthMarkets` and `planHealthReads` with no positions.
- Health uses interest accrued to the simulated block, not the pinned block's stored totals →
  the planned `accrueInterest` call comes before the market read.
- The LLTV check matches Morpho's `_isHealthy` rounding → unit test at exactly the LLTV passes, one
  unit above fails.

## Rejected alternatives

- **`maxLtvAfterWad` / `minHealthFactorAfterWad` on each `OperationLimit`, as in ADR-2026-09-18.**
  Rejected because `OperationLimit` requires a slippage quote, and position health concerns one
  position after the whole bundle, not one operation.
- **Always checking every position the bundle touches.** Rejected because it requires decoding
  calldata and applies a default policy, which ADR-2026-10-01 rules out.

## References

- ADR-2026-10-01-evm-simulation-quoted-slippage-limits (this adds to its `SimulationLimits` shape)
- ADR-2026-09-18-evm-simulation-calldata-verification
