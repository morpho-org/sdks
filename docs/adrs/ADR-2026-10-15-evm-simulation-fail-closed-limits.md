# ADR-2026-10-15: EVM simulation — limits fail closed

| Field      | Value                   |
| ---------- | ----------------------- |
| **Status** | accepted                |
| **Date**   | 2026-10-15              |
| **Author** | @jinmel                 |
| **Scope**  | `evm-simulation` 7.0.0  |

_Status is the only field that changes after acceptance._

## Context

ADR-2026-10-01 made `limits` optional: a call without limits ran no economic
checks, an operation without a quoted side left that side unbounded, and
`slippageTolerance` was required so callers could not silently accept a
default. In practice the main consumer called `simulate()` for
revert-checking and often omitted limits, so the common path verified
nothing about what the bundle paid, received, minted or burned — a
constructed or mis-wired bundle (wrong `onBehalf`, wrong market, wrong
recipient) passed as long as it executed. Verification that usually checks
nothing is worse than none: it presents a guarantee it does not keep.

## Decision

`SimulateParams.limits` is required: `limits: SimulationLimits | "none"`.
`"none"` is the explicit opt-out — no state reads and an empty
`verification.operations` — reserved for transactions no operation type
covers (Merkl reward claims, Midnight actions, approval/authorization-only
bundles); every transaction an operation type covers must pass limits. An omitted or `undefined` `limits`, and a
`SimulationLimits` whose `operations` array is missing or empty, throws
`SimulationValidationError`: an implicit opt-out is never accepted.

`SlippageQuote` amounts must be greater than zero, and a supplied
`slippageTolerance` must be below `1e18` (100%). `slippageTolerance` becomes
optional in the input and defaults to blue-sdk's
`DEFAULT_SLIPPAGE_TOLERANCE`; the normalized limit reported under
`checkedLimits` always carries the applied tolerance.
`SimulationVerification.limits` is retyped to
`CheckedSimulationLimits | "none"` so an opted-out run reports `"none"`
back instead of an empty limit set.

Every `OperationLimit` must quote the position side the operation moves,
and every operation must carry at least one minimum-bound quote so a no-op
or elsewhere-credited bundle fails: `sharesMinted` for supply-side
operations, `sharesBurned` for withdraw/repay/redeem-side operations, both
for `vaultV1MigrateToV2`, `collateralSupplied` for `blueSupplyCollateral`,
and `assetsReceived` alongside the position side for `blueWithdraw`,
`blueBorrow`, `blueWithdrawCollateral` and every vault withdraw, redeem and
force-exit operation, and `positions` or `assetsReceived` plus the `sharesBurned`
cap on in-kind redeems (proceeds can land on Blue supply positions or the
wallet); the combined collateral operations need either of their
minimum sides plus the required cap on the other leg — the debt
`sharesMinted` cap for `blueSupplyCollateralBorrow`, the
`collateralWithdrawn` cap for `blueRepayWithdrawCollateral` — and a
single-leg use quotes `1n` on the inactive leg. On the combined collateral
operations an active leg on either side requires that leg's other side: a
`sharesMinted` above `1n` requires `assetsReceived` on
`blueSupplyCollateralBorrow`, a `collateralWithdrawn` above `1n` requires it
on `blueRepayWithdrawCollateral`, and an `assetsPaid` above `1n` requires
`collateralSupplied` on `blueSupplyCollateralBorrow` and `sharesBurned` on
`blueRepayWithdrawCollateral` — an active pay-in leg can't leave its
position side unmeasured. Pay-in operations also require the
`assetsPaid` cap — `blueSupply`, `blueSupplyCollateral`, `blueRepay`,
`vaultV1Deposit`, `vaultV2Deposit`, and unconditionally on both combined ops
(an inactive pay-in leg quotes `1n` like the other inactive caps). `blueRefinance` quotes source `sharesBurned`
plus the target-market debt-share cap `sharesMinted`; the collateral a
refinance moves between markets is not verified. A missing required side makes
`simulate()` throw `SimulationValidationError` before any RPC request.

`SlippageQuote` gains `collateralSupplied` and `collateralWithdrawn`,
measured as the Blue `position(marketId, account).collateral` delta.
`collateralSupplied` is a minimum (`observed >= ceil(quote × (1 −
tolerance))`); `collateralWithdrawn` is a cap (`observed <= floor(quote ×
(1 + tolerance))`), an input side like burned supply shares. They are
measurable only on the collateral operations that move them —
`collateralSupplied` on `blueSupplyCollateral` and
`blueSupplyCollateralBorrow`, `collateralWithdrawn` on
`blueWithdrawCollateral` and `blueRepayWithdrawCollateral`; on any other
operation they are rejected. `assetsPaid` and `assetsReceived` on collateral
operations keep measuring the wallet.

Because the position side is measured on `limit.account ?? sender` and
`receiver` defaults the same way, a bundle that credits another account
produces a zero observed delta — which fails only on minimum-bound fields;
caps pass on zero, so in-kind redeems must quote `positions`
(the delivered Blue supply shares per market, minimum-bound) or
`assetsReceived` (the idle wallet portion, also minimum-bound) for a no-op
to fail. Consumers set `account`/`receiver` from the connected user,
never from the transaction's own `onBehalf`.

This supersedes the "optional limits / no default tolerance" parts of
ADR-2026-10-01-evm-simulation-quoted-slippage-limits; its measurement model,
inclusive favorable bounds and per-operation subject table otherwise stand.
The change ships in `evm-simulation` 7.0.0 without a deprecation minor under
the root `AGENTS.md` §7 EVM simulation v7 fail-closed limits exception
(fund safety: a coexistence minor would keep the unverified default path
reachable).

## Invariants

- A call without `limits`, or with an empty `operations`, never runs
  silently → `simulate()` throws `SimulationValidationError` before any
  RPC request (unit-tested);
  `limits: "none"` plans zero reads and reports `verification.operations = []`.
- Every operation type's required position side — including `assetsPaid` on
  pay-in operations, unconditionally on the combined ops, and the combined
  ops' active-leg sides — is enforced before any RPC request → table-driven
  unit tests over the full operation list.
- Omitted `slippageTolerance` applies `DEFAULT_SLIPPAGE_TOLERANCE` → unit
  test asserts the normalized limit and `checkedLimits.slippageTolerance`.
- A zero delta on a minimum-bound side never passes → unit tests for zero
  share/collateral change; cap-bound sides pass on zero by design (a no-op
  in-kind redeem passes — it must quote `positions` or `assetsReceived`,
  both minimum-bound);
  fork test: `blueSupply` crediting another `onBehalf` throws
  `ConsumerLimitViolationError`.
- Revisit if Morpho Blue adds position fields beyond
  `{ supplyShares, borrowShares, collateral }` or the operation table gains
  a type whose required side is ambiguous.

## Rejected alternatives

- **Keep `limits` optional and warn when omitted.** Rejected because the
  unverified default stays the common path; a warning nobody must read does
  not close the gap.
- **Default per-operation quote sides from calldata decoding.** Rejected —
  the simulator never decodes calldata (ADR-2026-10-01); deriving limits
  belongs to a caller-side builder (`toSimulationLimits`) over action args,
  not to the verifier.
- **100% tolerance accepted.** Rejected because a tolerance of `1e18` bounds
  nothing while appearing to bound something; `0` quote amounts are rejected
  for the same reason.

## References

- Supersedes in part: `ADR-2026-10-01-evm-simulation-quoted-slippage-limits`
  — specifically its optional `limits`, required `slippageTolerance`,
  single-side sufficiency, tolerance range including `1e18`, absence of any
  default bound, and its quote-field table.
