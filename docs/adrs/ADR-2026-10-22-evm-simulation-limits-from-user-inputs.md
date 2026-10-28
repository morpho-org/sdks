# ADR-2026-10-22: EVM simulation — limits come from user inputs, not action args

| Field      | Value                            |
| ---------- | -------------------------------- |
| **Status** | accepted                         |
| **Date**   | 2026-10-22                       |
| **Author** | @Foulks-Plb                      |
| **Scope**  | `evm-simulation` 8.1.0 (minor)     |

_Status is the only field that changes after acceptance._

## Context

`simulate()` checks a bundle's economic outcome against caller-supplied limits
(ADR-2026-10-01), and those limits became mandatory in 8.0.0 (ADR-2026-10-15).
Its purpose is to verify a transaction independently of `morpho-sdk`, which
builds it. Limits derived from `tx.action.args` share the builder's normalized
values and therefore its bugs: a wrong amount, side or conversion can produce
matching limits, approving a transaction that executes the wrong thing. With
`toSimulationLimits(action, options)`, only `options.owner` and `options.expected`
were independent of the builder. Requiring consumers to
supply quotes and tolerances also makes verification easy to misconfigure;
safety should be on by default.

## Decision

`simulate()` derives limits independently of `morpho-sdk` from the user's
chosen operation inputs and chain state at the same pinned block it simulates on.

Consumers describe each operation with `InputOperationLimit`: its `type`,
subject (`marketId` for Blue, `vault` for vault operations, or `sourceVault`
and `targetVault` for migration), `account` (default: the transaction sender),
optional `receiver`, and typed amounts in `inputs`: for example `assets` on
a deposit, `shares` on a redeem, assets or shares on a Blue withdrawal,
collateral and borrow assets on a borrow, and repay by assets, shares or full
repayment. The transaction's action and calldata are not inputs to the limits.

`simulate()` derives the expected outcome of every side using vault preview
functions, Blue market totals with interest accrued, and the account's current
debt for a full repay. Derived expectations are checked exactly, since they
are computed at the simulated block: directly selected amounts must match,
converted outputs must be at least the derived amount and converted costs
at most it. Derived subject shares for borrow and vault withdrawal/migration
source legs must match exactly; assets-mode Blue withdrawals allow one share
wei per earlier supply into the subject market, counted from simulated Blue
`Supply` events before that withdrawal. Favorable converted movement
otherwise passes. An explicitly quoted side
overrides its derived expectation; a tolerance applies only to sides the
consumer quotes explicitly. Integrators declare `referralFee` (a WAD-scaled
percentage) and, on Blue borrow/withdraw routes, `reallocationPenalty`
(absolute loan-token base units), both defaulting to zero. The penalty is
deducted before the referral fee on payout routes. On repay routes, the referral
fee is added on top of the repaid assets (`assets × fee / (WAD − fee)`, rounded
down) and bounds `assetsPaid`. Undeclared charges fail closed.

Vault V1→V2 migration derives the source shares burned and assets withdrawn
from the source preview, then the target shares minted from its deposit
preview after deducting the declared referral fee, rounded down.

Operations whose outcome cannot be derived from a preview — in-kind redeems,
Blue refinance and Vault V2 force exits — still require
a quote and fail closed without it. Revisit this requirement as derivations
are added. The 8.0.0 fail-closed rules remain, including the required minimum
and cap sides per operation and the `"none"` opt-out reserved for transactions
no operation type covers.

The rollout is additive and ships as a minor release of `evm-simulation`.
Quote-based `OperationLimit` and `toSimulationLimits(action, options)` keep working
without deprecation. Prefer `InputOperationLimit` for types covered by
`OperationInputs`; refinance, in-kind redeems and force exits keep using quotes.
Existing `SimulateParams`, `SimulationLimits` and `CheckedOperationLimit` remain quote-only,
as do `CheckedSimulationLimits`, `SimulationVerification` and
`VerifiedSimulationResult`. The additive `SimulateInputParams` accepts
`SimulationInputLimits`; its checked outputs use `CheckedInputOperationLimit`,
`CheckedSimulationInputLimits`, `SimulationInputVerification` and
`VerifiedSimulationInputResult`. The quote-only `simulate()` overload retains
its existing return type, including `SimulateParams` wrappers and quote readers: this is a
minor addition, not a widening of their exported types.

## Invariants

- No bound in the input-based form comes from the transaction or action,
  except the assets-mode Blue withdrawal rounding allowance: each canonical
  subject-market `Supply` event before the withdrawal may loosen the check
  by at most one share wei, only in the favorable direction →
  unit tests hold operation inputs fixed, change the transaction's calldata,
  and expect an identical derived quote.
- A transaction whose encoded amount or subject differs from the user's
  inputs fails the check → fork tests build a real `morpho-sdk` transaction
  for amount A or market M, simulate with inputs for amount B or market M',
  and expect `ConsumerLimitViolationError`.
- Derived expectations match on-chain execution at the pinned block → fork
  tests for every derived operation type; revisit if a preview function
  disagrees with execution in the same block.
- Derived sides do not absorb undeclared fees or amount mismatches as
  slippage → unit tests reject an undeclared 1 bp fee and a one-wei amount
  mismatch, even when `slippageTolerance` is supplied.

## Rejected alternatives

- **Keep deriving from args and add `expected` overrides.** An override the
  caller may omit leaves builder-derived bounds as the default, preserving
  the shared failure mode.
- **Recompute calldata from the inputs and compare bytes.** This duplicates
  `morpho-sdk`'s encoding inside the verifier and risks sharing its bugs,
  rather than checking the independently expected economic outcome.
- **Typed inputs plus a consumer-supplied quote and tolerance, cross-checked
  against the action.** Consumers still had to supply a quote and tolerance, and the
  subject still came from the builder.
- **Decode calldata in the simulator to check on-chain slippage parameters
  (`maxSharePrice`, `minSharePriceE27`).** Rejected for now: these on-chain
  bounds are not verified by the simulation. This is a known gap to revisit
  separately from economic outcome verification.

## References

- [ADR-2026-10-01: EVM simulation — caller-quoted slippage limits](./ADR-2026-10-01-evm-simulation-quoted-slippage-limits.md); for the input-based form, this record supersedes its rule that `simulate()` checks only caller-supplied limits and never fetches a quote or applies a default bound, and its invariant that an unquoted amount issues no state read.
- [ADR-2026-10-15: EVM simulation — limits fail closed](./ADR-2026-10-15-evm-simulation-fail-closed-limits.md); this record supersedes its statement that limits are derived by a caller-side builder over action args for the new input-based form.
- [ADR-2026-10-21: EVM simulation fail-closed limits ship in v8](./ADR-2026-10-21-evm-simulation-fail-closed-limits-ships-in-v8.md)
