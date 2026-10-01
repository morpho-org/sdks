# ADR-2026-10-01: EVM simulation — caller-quoted slippage limits

| Field      | Value                       |
| ---------- | --------------------------- |
| **Status** | accepted                    |
| **Date**   | 2026-10-01                  |
| **Author** | @jinmel                     |
| **Scope**  | `evm-simulation` 5.0.0      |

_Status is the only field that changes after acceptance._

## Context

ADR-2026-09-18 made `simulate()` decode every supported route from calldata, verify all of its
effects against broad before/after state, apply SDK default bounds, and report failures through a
catalog of mismatch errors. Building that pipeline meant a decoder and an effect model per route,
plus wide state reads on every call. The consumers needed something narrower: confirmation that the
bundle executes, and that it pays and receives what the quote shown to the user said, within the
tolerance the user accepted. They already hold that quote and tolerance. The simulator does not.

## Decision

`simulate()` checks only limits the caller supplies. It never decodes calldata, infers an operation,
fetches a quote or applies a default bound, and it does not restrict which targets or routes a
bundle calls. With `limits` omitted, a successful result means the bundle executed under the
simulated permissions, nothing more.

`SimulationLimits` is `{ operations?: readonly OperationLimit[] }`. Each `OperationLimit` names an
operation `type` and its subject (`marketId`, `sourceMarketId`/`targetMarketId`, `vault`, or
`sourceVault`/`targetVault`), a `quote` with at least one of `assetsReceived`, `assetsPaid`,
`sharesMinted` and `sharesBurned` in raw units, and a required `slippageTolerance` as a WAD-scaled
`bigint` between `0n` and `1e18` inclusive. Optional selectors choose what is measured: `account`
(share or position owner) and `receiver` (asset recipient) default to the transaction sender;
`assetPaid` and `assetReceived` default to the action's underlying, and viem's `ethAddress` selects
native ETH. Unknown keys, including the removed `asset`, `adapter`, `transactionIndex`, `expected*`
pins and outcome bounds, are `SimulationValidationError`. `blueAuthorization` takes no limit.

The bounds are inclusive and favorable movement passes:

- `assetsReceived` and supply `sharesMinted` must be at least `ceil(quote × (1 − tolerance))`.
- `assetsPaid` and supply `sharesBurned` must be at most `floor(quote × (1 + tolerance))`.
- Debt `sharesMinted` is capped at `floor(quote × (1 + tolerance))`; debt `sharesBurned` must be at
  least `ceil(quote × (1 − tolerance))`.
- Share quotes on `blueSupplyCollateral` and `blueWithdrawCollateral` are rejected at parse time.

Each operation type fixes what each quote field measures. "Supply" and "debt" above refer to the
share side in the last two columns; only Blue debt shares take the debt rule, and vault shares take
the supply rule:

| `type` | `assetsPaid` | `assetsReceived` | `sharesMinted` | `sharesBurned` |
| --- | --- | --- | --- | --- |
| `blueSupply`, `blueWithdraw` | loan token | loan token | supply shares | supply shares |
| `blueSupplyCollateral`, `blueWithdrawCollateral` | collateral token | collateral token | rejected | rejected |
| `blueBorrow`, `blueRepay` | loan token | loan token | debt shares | debt shares |
| `blueSupplyCollateralBorrow` | collateral token | loan token | debt shares | debt shares |
| `blueRepayWithdrawCollateral` | loan token | collateral token | debt shares | debt shares |
| `blueRefinance` | source loan token | source loan token | target debt shares | source debt shares |
| vault deposit, withdraw, redeem, force and in-kind variants | vault asset | vault asset | vault shares (supply) | vault shares (supply) |
| `vaultV1MigrateToV2` | source vault asset | source vault asset | target vault shares (supply) | source vault shares (supply) |

Blue shares are read from `position` (`supplyShares` or `borrowShares`), vault shares through the
vault's `balanceOf`, and tokens through `balanceOf` unless `assetPaid`/`assetReceived` selects
another token or native ETH. An in-kind redeem pays out a Blue position, which is not measured:
bound it by quoting the vault `sharesBurned`, plus `assetsReceived` for any underlying paid out
directly.

Each quoted amount is measured over the whole bundle for the selected subject: ERC-20 and vault
share balances through `balanceOf`, Blue shares through `position`, both read before and after
execution at the pinned block, and native ETH through `traceTransfers`. Unquoted amounts are not
read. Limits that select the same subject and field read the same net change over the bundle, so a
caller quoting two steps that touch one balance, such as a borrow whose proceeds a later deposit
pays in, must quote the net amount. Selecting the right subject is the caller's responsibility: a
route the selector does not observe, such as native ETH funding a wNative market measured on the
wNative balance, reads as zero movement and passes a maximum bound.

`SimulationVerification` carries `mode`, `chainId`, `blockNumber`, `blockTimestamp`, the effective
`limits`, one `SimulatedOperation` per limit with its `checkedLimits`, `account` and `receiver`, and
the preview `authorizations` with their preparation calls. It carries no before/after snapshots,
diffs or decoded operations.

Preview mode prepares each pending authorization as simulated calls and runs no permission, nonce
or read-back checks. It establishes success under the simulated permissions, not that a future
signature will execute.

Errors keep the existing classes and add `UnsupportedOperationError`,
`InvalidSimulationResponseError`, `MissingVerificationEvidenceError`,
`AuthorizationRequestMismatchError`, `ConsumerLimitViolationError` and `UnexpectedSimulationError`,
each extending `SimulationPackageError`. `UnsupportedOperationError` reports an SDK requirement that
`toSimulationAuthorizations` cannot convert, and `AuthorizationRequestMismatchError` reports a
signature requirement passed to it without its typed-data payload. A quote outside its bound is `ConsumerLimitViolationError`,
never `SimulationRevertedError`. A failed state read, native traces that do not cover the value sent,
or unusable metadata is `MissingVerificationEvidenceError`. The 09-18 classes
`ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `AssetChangeMismatchError`,
`PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`,
`SlippageLimitExceededError` and `FeeMismatchError` are not introduced. In the typed error context,
an execution or verification failure takes its `operation` and subject fields from the caller's
`OperationLimit`, not from decoded calldata. A verification failure not bound to one limit carries
only the checked `field`.

This decision replaces these parts of ADR-2026-09-18: calldata decoding and its verification
contract, the rejection of routes outside the supported list, the call-time request-freshness
check, the `SimulationLimits` defaults (including `maxSignatureLifetimeSeconds`) and wallet bounds,
the operation limits, the verification output, preview read-back checks, and the error catalog.
An expired deadline now surfaces as an execution revert. The rest of it stays in force, including
`eth_simulateV1` as the only backend, the `preview`/`final` modes, `SimulationAuthorization` and
`toSimulationAuthorizations`, one pinned block per call, `reasonCode`, and the typed error context.
The Morpho-specific failure-message requirement also stays; its coverage scope is still the
contracts reachable through the supported v6 routes, even though `simulate()` no longer rejects
other routes.

This decision ships in the same unreleased major that ADR-2026-09-18 calls 6.0.0, so no released
API is broken a second time; the package is on 4.x, so that major publishes as `evm-simulation`
5.0.0. This record does not change 09-18's Migration section.

## Invariants

- No limit is checked unless the caller quoted it, and no calldata is decoded → request-parser and
  slippage-check tests: an unquoted amount issues no state read, and `simulate()` without `limits`
  issues none.
- Each bound direction and rounding rule above holds at the bound and just past it → slippage
  check tests per field, including debt shares.
- A bound breach is `ConsumerLimitViolationError`, and missing evidence is
  `MissingVerificationEvidenceError` → error-mapping tests.
- Native measurements never treat an incoming refund as an outgoing payment → native-evidence test.
- Revisit if a consumer needs a check it cannot express as a quote on a selected subject.

## Rejected alternatives

- **Keep calldata decoding and full effect verification.** Rejected because it needs a decoder and
  effect model per route and wide state reads per call, to check amounts the consumer already quoted.
- **SDK default tolerance.** Rejected because no tolerance suits every market and vault; an implicit
  default hides a choice the caller has to make anyway.
- **Fail when a maximum-bound quote observes zero movement.** Rejected because zero movement is a
  valid result for some bundles. The caller selects the measured subject instead.

## References

- Supersedes, in part: [ADR-2026-09-18](./ADR-2026-09-18-evm-simulation-calldata-verification.md)
