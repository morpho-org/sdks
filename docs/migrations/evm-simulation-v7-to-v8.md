# EVM simulation v7 → v8

## Limits fail closed

Version 8.0.0 makes `simulate()` fail closed on limits: every call must
declare its economic bounds explicitly, and every operation must bound the
position side it moves.

The no-deprecation exception for these limits changes is recorded in
[ADR-2026-10-15](../adrs/ADR-2026-10-15-evm-simulation-fail-closed-limits.md)
and
[ADR-2026-10-21](../adrs/ADR-2026-10-21-evm-simulation-fail-closed-limits-ships-in-v8.md).

`midnightSupplyCollateral`, `midnightRedeem`, `midnightTakeBorrow`,
`midnightTakeWithdraw`, `midnightSupplyCollateralTakeBorrow`, `midnightTakeLend`,
`midnightSupplyBlueMakeLend`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral` and funded `midnightCancelAndMake`
limits, described below, ship in 8.1.0. On 8.0.x, Midnight `supplyCollateral`,
`redeem`, `takeBorrow`, `takeWithdraw`, `supplyCollateralTakeBorrow`, `takeLend`,
`repayWithdrawCollateral`, `takeRepayWithdrawCollateral` and funded
`cancelAndMake` bundles had no operation type and passed `limits: "none"`.

## `limits` is required

`SimulateParams.limits` is now `SimulationLimits | "none"` — no longer
optional.

- Pass the literal `"none"` to keep v7's omitted-limits behavior: no state
  reads, empty `verification.operations`. `verification.limits` reports
  `"none"` back instead of an empty limit set, so callers can tell an
  opted-out run from a checked one. v7 code that omitted `limits`
  compiles after adding `limits: "none"`. `"none"` is reserved for
  transactions no operation type covers (Merkl reward claims, unsupported
  Midnight actions and `midnightCancelAndMake` bundles that combine a Blue
  supply with collateral supplies, contain unfunded publications, or contain
  cancellations only, and approval/authorization-only bundles) — every
  transaction an operation type covers must pass limits.
- `verification.limits` is typed `CheckedSimulationLimits | "none"`: on a
  checked run, `operations[].slippageTolerance` is always a `bigint` holding
  the applied tolerance (defaults resolved), never `undefined`.
- An omitted or `undefined` `limits` throws `SimulationValidationError`.
- When `limits` is an object, `operations` is required and must be a
  non-empty array; an empty array is rejected as an implicit opt-out.

## `slippageTolerance` defaults and is capped below 100%

`slippageTolerance` is optional on each operation. When omitted it defaults
to blue-sdk's `DEFAULT_SLIPPAGE_TOLERANCE` (0.03%), and the normalized limit
reported under `verification.operations[].checkedLimits.slippageTolerance`
always carries the applied tolerance. A supplied tolerance must be below
`1e18` (100%); `0n` remains valid and means exact matching. v7 code that
relied on a `1e18` (effectively unbounded) tolerance must tighten the bound.

## Every operation requires its position side

Each `OperationLimit` must quote the position side the operation moves, in
addition to any `assetsPaid`/`assetsReceived` bound. `midnightSupplyBlueMakeLend`
requires exact sender `assetsPaid` and the expected BlueBuyCallback
position-side `sharesMinted`:

| `type` | required quote field(s) |
| --- | --- |
| `blueSupply`, `vaultV1Deposit`, `vaultV2Deposit` | `sharesMinted` and `assetsPaid` |
| `blueBorrow` | `sharesMinted` and `assetsReceived` |
| `blueRepay` | `sharesBurned` and `assetsPaid` |
| `blueRefinance` | `sharesBurned` and `sharesMinted` (target-market debt-share cap; the collateral a refinance moves is not verified) |
| `vaultV1InKindRedeem`, `vaultV2InKindRedeem` | `sharesBurned`, and `positions` or `assetsReceived` |
| `blueWithdraw`, `vaultV1Withdraw`, `vaultV2Withdraw`, `vaultV1Redeem`, `vaultV2Redeem`, `vaultV2ForceWithdraw`, `vaultV2ForceRedeem` | `sharesBurned` and `assetsReceived` |
| `vaultV1MigrateToV2` | `sharesMinted` and `sharesBurned` |
| `blueSupplyCollateral` | `collateralSupplied` and `assetsPaid` |
| `midnightSupplyCollateral` (8.1.0+) | `collateralSupplied` and `assetsPaid` |
| `midnightSupplyBlueMakeLend` (8.1.0+) | Exact sender debit of the full parked amount plus expected callback-position `sharesMinted`; for wNative, `assetsPaid` counts ETH sent plus net wNative change, so native funding needs no quote adjustment. `slippageTolerance` applies to the minimum shares quote but does not widen the exact debit; combining Blue parking with collateral supplies is unsupported |
| `midnightRedeem` (8.1.0+) | `assetsReceived` and `creditRedeemed` |
| `midnightTakeLend` (8.1.0+) | `assetsPaid` and `unitsBought` |
| `midnightTakeBorrow` (8.1.0+) | `assetsReceived` and `unitsSold` |
| `midnightSupplyCollateralTakeBorrow` (8.1.0+) | Exact `collateralSupplies` per supplied index (each amount is the exact minimum credit and pull-cap source, not widened by tolerance), plus `assetsReceived` and `unitsSold`; wallet spending and proceeds use one net token/account bound. Owner native value is subtracted from the owner's wNative pull cap; exceeding it, including at `0n`, or using native value on a chain without registered wNative fails closed with `SlippageCheckUnavailableError`. Without an owner wNative bound, native value is not checked. The operation rejects overlapping wallet or Midnight position reads/bounds from another operation, and `expected.collateralSupplies` cannot override action amounts. |
| `midnightTakeWithdraw` (8.1.0+) | `assetsReceived` and `creditRedeemed`; debt is unchanged across the bundle |
| `midnightRepayWithdrawCollateral` (8.1.0+) | The repay leg requires `quote.assetsPaid` and either `quote.debtRepaid` or `position.maxDebt`; at least one active repay leg or non-empty `quote.collateralWithdrawals` is required. Every `position.maxCollateral` index needs a matching withdrawal quote. Collateral delivery is checked per quote, credit must remain unchanged, and debt/collateral bounds are inclusive final-state caps. Without `quote.debtRepaid`, sender debt must not increase. |
| `midnightTakeRepayWithdrawCollateral` (8.1.0+) | Same checks as `midnightRepayWithdrawCollateral` (always measures the sender and rejects any explicit `account`), but the repay leg is always required: `quote.assetsPaid` plus `quote.debtRepaid` or `position.maxDebt`. `quote.collateralWithdrawals` is optional. Repayment through offers and the direct fallback are measured together across the bundle. |
| `blueWithdrawCollateral` | `collateralWithdrawn` and `assetsReceived` |
| `blueSupplyCollateralBorrow` | at least one of `collateralSupplied`, `assetsReceived`; plus `sharesMinted` (debt-share cap — quote a small positive cap like `1n` on a collateral-only use); `assetsPaid` (unconditional — quote `1n` on an inactive pay-in leg); `assetsReceived` when `sharesMinted` is above `1n` (an active borrow leg); `collateralSupplied` when `assetsPaid` is above `1n` (an active supply leg) |
| `blueRepayWithdrawCollateral` | at least one of `sharesBurned`, `assetsReceived`; plus `collateralWithdrawn` (cap — quote a small positive cap like `1n` on a repay-only use); `assetsPaid` (unconditional — quote `1n` on an inactive pay-in leg); `assetsReceived` when `collateralWithdrawn` is above `1n` (an active collateral leg); `sharesBurned` when `assetsPaid` is above `1n` (an active repay leg) |

Every operation carries at least one minimum-bound field, so a bundle that
moves nothing (or credits another account) fails. In-kind redeems pay out
Blue supply positions rather than wallet assets, so they must quote
`positions` — the Blue supply shares delivered to the receiver per market —
or `assetsReceived` for the idle wallet portion, on top of the `sharesBurned`
cap.

A missing required side throws `SimulationValidationError` at parse time
(e.g. `limits.operations[0].quote.sharesMinted: required for "blueSupply"`).
v7 entries quoting only asset amounts must add the required side.
For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, quote `positions` — the
Blue supply shares the redeem delivers to the receiver in each market
(`{ marketId, supplyShares }`, each a minimum under tolerance) — or
`assetsReceived` when the redeem is expected to pay out idle wallet assets
only.

All quote amounts must be greater than zero; a `0` quote field is rejected
(`...quote.<field>: must be positive (got "0")`).

## New collateral quote fields

`SlippageQuote` gains `collateralSupplied` and `collateralWithdrawn`.
Collateral amounts are measured as the Blue
`position(marketId, account).collateral` delta, except
`midnightSupplyCollateral`, which measures the Midnight
`collateral(marketId, account, collateralIndex)` delta. `account` defaults to
the transaction sender. `collateralSupplied` is a minimum: the observed delta
must be at least `ceil(quote * (1 - tolerance))`.
`midnightSupplyCollateralTakeBorrow` instead uses its action-encoded
`collateralSupplies` as exact per-index minimum-credit and sender pull-cap
sources; tolerance does not widen them.
`collateralWithdrawn` is a cap, like `sharesBurned` on supply positions: the
observed withdrawal must be at most `floor(quote * (1 + tolerance))`, and a
zero withdrawal is caught by the now-required `assetsReceived` side on
`blueWithdrawCollateral`, and on `blueRepayWithdrawCollateral` once its
collateral leg is active (cap above `1n`). `midnightRepayWithdrawCollateral` and
`midnightTakeRepayWithdrawCollateral` quote collateral per index through
`quote.collateralWithdrawals` and reject `collateralWithdrawn`. These fields are
measurable only on the operations that move them — `collateralSupplied` on
`blueSupplyCollateral`/`blueSupplyCollateralBorrow`/`midnightSupplyCollateral`,
`collateralWithdrawn` on
`blueWithdrawCollateral`/`blueRepayWithdrawCollateral`; on any other operation
they throw `SimulationValidationError`. Share quotes on pure collateral
operations stay rejected, and `assetsPaid`/`assetsReceived` keep measuring the
wallet on collateral operations.

## Set `account`/`receiver` from the connected user

Measurement attribution fails closed: if a bundle credits shares or assets
to a different account than the limit names, the observed delta is zero and
the check throws `ConsumerLimitViolationError`. Set `account` and `receiver`
from the connected user's address — never from the transaction's own calldata,
which a constructed bundle can point elsewhere. For `midnightRedeem`, set
`account` to the credit owner (`onBehalf`) and `receiver` to the intended
payee; both are checked against the action. `midnightTakeBorrow`,
`midnightTakeWithdraw`, and `midnightSupplyCollateralTakeBorrow` act for
`msg.sender`; an external `receiver` is supported when it matches the action's
encoded receiver. `midnightTakeLend` always measures the sender and accepts
neither `account` nor `receiver`. `midnightRepayWithdrawCollateral` always
measures the
sender and rejects an explicit `account`; when it has withdrawals, `receiver`
must match `collateralReceiver`. `midnightTakeRepayWithdrawCollateral` also
always measures the sender and rejects an explicit `account`; when it has
withdrawals, `receiver` must match `collateralReceiver`.

## Build limits with `toSimulationLimits`

Hand-built `operations` arrays can be replaced by the morpho-sdk action
metadata (`tx.action`), which `toSimulationLimits` reads to derive every side
the encoded calldata fixes:

```ts
const tx = action.buildTx();
limits: toSimulationLimits(tx.action, {
  owner: connectedUser,
  expected: { sharesMinted: quotedShares },
});
```

Sides the args do not fix (e.g. shares minted by a supply, assets returned by a
redeem) must come from the UI's quote through `expected`; a missing required
side throws `MissingExpectedQuoteError`, an `onBehalf`/`recipient` differing
from `owner`/`receiver` throws `LimitAccountMismatchError`, and action types
without a supported operation throw `UnsupportedLimitActionError`.
From 8.1.0, `toSimulationLimits` supports `midnightSupplyCollateral`: it derives
`collateralSupplied` and `assetsPaid` from the action, and accepts an optional
`onBehalf` for the collateral owner (defaulting to `owner`). A mismatch between
that limit subject and the action's `onBehalf` throws
`LimitAccountMismatchError`. It also supports `midnightRedeem`, deriving both
`creditRedeemed` and `assetsReceived` from the action's `units`. Its `onBehalf`
and `receiver` both default to `owner`, while the morpho-sdk builder defaults
`receiver` to `onBehalf`, so redeeming another owner's credit requires both
`onBehalf` (the credit owner) and `receiver` (the payee). `midnightTakeLend`
derives `unitsBought` and `assetsPaid` from the action target and rejects both
`account` and `receiver`. `midnightTakeBorrow` and `midnightTakeWithdraw` derive
their values from the sell target, so no `expected` quote is needed:
`assetsReceived` is `target.assets` (assets target) or
`target.minSellerAssets` (units target), and the position cap is
`target.maxUnits` or `target.units`. `midnightSupplyCollateralTakeBorrow`
derives `collateralSupplies` per index, `unitsSold`, and `assetsReceived` from
the action; its exact collateral amounts cannot be overridden. These sell
operations support an external `receiver` only when it matches the action.
`midnightRepayWithdrawCollateral` supports withdrawals when `receiver` matches
`collateralReceiver`. `midnightTakeRepayWithdrawCollateral` derives its repay
quote from the offer target: an assets target uses its assets cap and minimum
units, a finite units target uses its maximum buyer assets and units, and a
full-repay `units: maxUint256` target derives a zero final-debt bound. Its
withdrawals use the same receiver rule and optional per-index collateral
quotes. A funded `supplyCollateralMakeBorrow` (`midnightCancelAndMake`) with
collateral supplies and no Blue supply derives one `midnightSupplyCollateral`
operation per distinct `collateralIndex`, summing repeated indices in
first-seen order and crediting `owner`. An `onBehalf` other than `owner` throws
`LimitAccountMismatchError`, and an `expected` quote on a multi-index action
throws `AmbiguousExpectedQuoteError`. These limits cap the sender's wNative
debit but not ETH sent as `tx.value`; bound that with a `nativeBalanceAssertion`
in `assertAfter`. A `midnightCancelAndMake` action with a Blue supply and no
collateral supplies maps to the
`midnightSupplyBlueMakeLend` operation; its `assetsPaid` is derived from the
parked amount, and `expected.sharesMinted` supplies the callback's expected
Blue supply-share increase. Combining Blue parking with collateral supplies is
unsupported, as are unfunded maker publications and cancel-only bundles. Other
Midnight actions without a supported operation throw
`UnsupportedLimitActionError`. `receiver` applies to `vaultV2ForceRedeem`,
`midnightRedeem`, `midnightTakeBorrow`, `midnightTakeWithdraw`,
`midnightSupplyCollateralTakeBorrow`, `midnightRepayWithdrawCollateral`, and
`midnightTakeRepayWithdrawCollateral` when they have withdrawals; every other
action pays `msg.sender`, so a `receiver` other than
`owner` also throws `LimitAccountMismatchError` (`field: "receiver"`).

## Upgrading from 6.x

Consumers on 6.x must apply both guides in order: first the
[v6 → v7 guide](./evm-simulation-v6-to-v7.md) for the simplified errors and
original revert bytes, then this guide for required limits.
