# EVM simulation v6 → v7

## Smaller error surface

`SimulationPackageError` now carries only its stable `code` and standard Error
fields (`name`, `message`, `stack`, `cause`). `SimulationRevertedError` adds
`revertData?: Hex`, the original node-returned bytes, and optional
`transactionIndex`, the zero-based index into the caller's transactions.

Removed fields and types:

- `ExternalServiceError` and the `EXTERNAL_SERVICE_ERROR` code.
- `MissingVerificationEvidenceError` and the `MISSING_VERIFICATION_EVIDENCE` code,
  renamed to `SlippageCheckUnavailableError` / `SLIPPAGE_CHECK_UNAVAILABLE`.
- `SimulationPackageError.context` and context constructor options/arguments.
- `SimulationErrorContext`, `SimulationValidationContext`,
  `SimulationTransportContext`, `SimulationPreparationContext`,
  `SimulationExecutionContext`, `SimulationVerificationContext`, `SimulationStage`.
- `SimulationRevertedError.reason`, `reasonCode`, `details`, and `SimulationExecutionReason`.

```diff
 if (error instanceof SimulationRevertedError) {
-  showError(error.reason);
-  forwardFailureCode(error.reasonCode);
+  showError(error.message);
+  forwardFailureCode(error.code); // "SIMULATION_REVERTED"
+  // Decode error.revertData with your ABI for contract-specific handling.
 }
```

Messages include all decoded custom-error arguments, Solidity reason strings,
and panic codes. They remain presentation text; never parse them for control
flow. Original bytes survive even if decoding fails. `"0x"` denotes an empty
payload; `undefined` means the node supplied no bytes. The SDK cannot recover
bytes a node omits. User reverts expose `transactionIndex`; preparation and
node-level reverts leave it undefined. Internal calls never shift the user index.
Locations also appear in preparation/transaction messages.

A node insufficient-funds rejection (viem `InsufficientFundsError` or JSON-RPC
`-38014`) whose revert bytes are absent or cannot be decoded produces `Sender native balance
cannot fund transaction value. Fund the sender or reduce value.` Any other
undecodable revert produces `Revert reason unavailable`, without provider
message text. Original provider diagnostics remain available in `cause`.

## Constructor changes

```ts
new SimulationRevertedError(message, revertData, { cause, transactionIndex });
new SimulationValidationError(message, fieldErrors, { cause });
new BlacklistViolationError(message, assetChanges, { cause });
new UnsupportedChainError(chainId, { cause });
```

Other errors inheriting the base constructor accept `(message, options?)`.
Specialized fields such as `fieldErrors`, `assetChanges`, and `chainId` remain.
`ExternalServiceError` / `EXTERNAL_SERVICE_ERROR` become `RpcTransportError` /
`RPC_TRANSPORT_ERROR`. RPC failures wrap the original viem error as `cause`,
preserving its class and cause chain. Other unexpected
failures become `UnexpectedSimulationError`, preserving the original value as
`cause`. Do not treat an infrastructure error as a successful simulation.

For API responses, use `toSimulationErrorResponse(error)` instead of serializing
an Error instance. It returns `code`, `message`, and optional `revertData` and `transactionIndex`, omitting
stack, cause, and specialized bigint fields. RPC failures retain `RPC_TRANSPORT_ERROR` with a generic message; non-SDK and unexpected failures map
to a generic `UNEXPECTED_SIMULATION_ERROR` response. Log the original exception
server-side and attach the service's request ID. Return transactions only after
simulation succeeds; see the package README for a complete service pattern.

## `toSimulationAuthorizations` inputs

`chainId`, `mode`, and `blockNumber` only fed the removed error context, so they
are removed. Pass `owner` and `requirements` only.

```diff
 toSimulationAuthorizations({
-  chainId,
-  mode: "preview",
-  blockNumber,
   owner,
   requirements,
 });
```

## Consumer audit

The Actions API and other consumers forwarding `reasonCode` must
switch to `code`, `message`, and optionally `revertData`, and review their own
public compatibility contract before upgrading. No workspace package declares
a direct runtime or peer dependency on evm-simulation; no dependent bump is needed.
Integrations requiring the removed fields can stay on 6.x during migration.

The maintainer-approved lifecycle exception is recorded in
[ADR-2026-10-12](../adrs/ADR-2026-10-12-evm-simulation-simplify-errors-without-deprecation.md). It covers the listed removals and constructor changes only.

## Limits fail closed

Version 7.0.0 makes `simulate()` fail closed on limits: every call must
declare its economic bounds explicitly, and every operation must bound the
position side it moves.

The no-deprecation exception for these limits changes is recorded in [ADR-2026-10-15](../adrs/ADR-2026-10-15-evm-simulation-fail-closed-limits.md).

## `limits` is required

`SimulateParams.limits` is now `SimulationLimits | "none"` — no longer
optional.

- Pass the literal `"none"` to keep v6's omitted-limits behavior: no state
  reads, empty `verification.operations`. `verification.limits` reports
  `"none"` back instead of an empty limit set, so callers can tell an
  opted-out run from a checked one. v6 code that omitted `limits`
  compiles after adding `limits: "none"`. `"none"` is reserved for
  transactions no operation type covers (Merkl reward claims, Midnight
  actions, approval/authorization-only bundles) — every transaction an
  operation type covers must pass limits.
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
`1e18` (100%); `0n` remains valid and means exact matching. v6 code that
relied on a `1e18` (effectively unbounded) tolerance must tighten the bound.

## Every operation requires its position side

Each `OperationLimit` must quote the position side the operation moves, in
addition to any `assetsPaid`/`assetsReceived` bound:

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
v6 entries quoting only asset amounts must add the required side.
For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, quote `positions` — the
Blue supply shares the redeem delivers to the receiver in each market
(`{ marketId, supplyShares }`, each a minimum under tolerance) — or
`assetsReceived` when the redeem is expected to pay out idle wallet assets
only.

All quote amounts must be greater than zero; a `0` quote field is rejected
(`...quote.<field>: must be positive (got "0")`).

## New collateral quote fields

`SlippageQuote` gains `collateralSupplied` and `collateralWithdrawn`,
measured as the Blue `position(marketId, account).collateral` delta
(`account` defaults to the transaction sender). `collateralSupplied` is a
minimum: the observed delta must be at least `ceil(quote * (1 -
tolerance))`. `collateralWithdrawn` is a cap, like `sharesBurned` on supply
positions: the observed withdrawal must be at most `floor(quote * (1 +
tolerance))`, and a zero withdrawal is caught by the now-required
`assetsReceived` side on `blueWithdrawCollateral`, and on
`blueRepayWithdrawCollateral` once its collateral leg is active (cap above
`1n`). They are measurable only on the operations that move them —
`collateralSupplied` on `blueSupplyCollateral`/`blueSupplyCollateralBorrow`,
`collateralWithdrawn` on `blueWithdrawCollateral`/`blueRepayWithdrawCollateral`;
on any other operation they throw `SimulationValidationError`. Share quotes on pure collateral operations stay
rejected, and `assetsPaid`/`assetsReceived` keep measuring the wallet on
collateral operations.

## Set `account`/`receiver` from the connected user

Measurement attribution fails closed: if a bundle credits shares or assets
to a different account than the limit names, the observed delta is zero and
the check throws `ConsumerLimitViolationError`. Always set `account` and
`receiver` from the connected user's address — never from the transaction's
own `onBehalf`/`receiver` calldata, which a constructed bundle can point
elsewhere.

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
without an operation throw `UnsupportedLimitActionError`. `receiver` applies
only to `vaultV2ForceRedeem`; every other action pays `msg.sender`, so a
`receiver` other than `owner` also throws `LimitAccountMismatchError`
(`field: "receiver"`).

## Upgrading from 5.x

Consumers on 5.x (e.g. `evm-simulation` 5.1.0) must apply two guides in
order: first the [v5 → v6 guide](./evm-simulation-v5-to-v6.md) (retention
guard moved to `midnightBundlesV2`, fail-closed RPC responses, dependency
majors), then this guide.
