# Migrating from morpho-sdk v9 to v10

Version 10 changes how `client.morpho.midnight(chainId).cancelOffers` cancels Midnight offer groups.
It now calls Midnight directly instead of going through MidnightBundlesV2. Nothing else changes:
the maker flows (`makeLend`, `makeBorrow`, `makeWithdraw`, `makeRepay`,
`supplyCollateralMakeBorrow`, `supplyBlueMakeLend`) and the pure `midnightCancelAndMake` builder
keep their inputs and calldata.

## Why

A cancellation through MidnightBundlesV2 is a call to `midnightBundlesV2CancelAndMake`, the function
that also publishes offers, with about 17 arguments, most of them zero. Wallets that approve
transactions by policy (MPC wallets such as Utila, Fireblocks and Fordefi) need an argument-level
calldata policy to allow it. `Midnight.setConsumed(group, amount, onBehalf)` has three flat fields
and can only raise a group's consumed amount, so a policy can allow it by method name.

## `cancelOffers` before and after

```ts
// v9
const output = midnight.cancelOffers({
  accountAddress: maker,
  cancellations: [{ group, maxConsumed: maxUint128 }],
  deadline,
});
// Returned the Midnight authorization of MidnightBundlesV2 when it was missing.
for (const requirement of await output.getRequirements()) {
  await walletClient.sendTransaction(requirement);
}
await walletClient.sendTransaction(output.buildTx()); // to: MidnightBundlesV2

// v10
const output = midnight.cancelOffers({
  accountAddress: maker,
  groups: [group],
});
await output.getRequirements(); // always []
await walletClient.sendTransaction(output.buildTx()); // to: Midnight
```

| | v9 | v10 |
| --- | --- | --- |
| Parameters | `{ accountAddress, cancellations, deadline }` | `{ accountAddress, groups }` |
| Target | MidnightBundlesV2 | Midnight |
| Calldata, one group | `midnightBundlesV2CancelAndMake(...)` | `setConsumed(group, maxUint128, accountAddress)` |
| Calldata, two or more groups | `midnightBundlesV2CancelAndMake(...)` | `multicall([setConsumed(...), ...])`, in list order |
| Requirements | Midnight authorization of MidnightBundlesV2 when missing | none |
| Action type | `midnightCancelAndMake` | `midnightCancelOffers`, args `{ groups, onBehalf }` |
| Chains | the six chains with a pinned MidnightBundlesV2 | every chain with a Midnight deployment |

## What is gone

- **`cancellations`.** Pass the offer groups as `groups: readonly Hex[]`. Map
  `cancellations.map(({ group }) => group)`.
- **`maxConsumed`.** There is no consumption guard on a plain cancellation. v9 reverted the
  whole call when a group's consumption was above its ceiling; v10 cancels whatever has been filled
  so far. Reading `Midnight.consumed(maker, group)` before sending is advisory only, because a taker
  can fill the offer after the read and before the cancel is included. For a guard that holds, use
  cancel-only `midnightCancelAndMake` with `maxConsumed` set to the ceiling (for example `0n`); it
  targets MidnightBundlesV2, so the maker must have authorized MidnightBundlesV2 on Midnight.
- **`deadline`.** The call has no deadline and `cancelOffers` no longer throws
  `ExpiredDeadlineError`. A cancellation can only make an offer less fillable, so a late inclusion
  is harmless.
- **The MidnightBundlesV2 authorization requirement.** `getRequirements()` always resolves to an
  empty list and performs no RPC read. A maker that only cancels never needs to authorize
  MidnightBundlesV2. The authorization is still required by the maker and taker flows.
- **`NegativeInputError` and `InputExceedsMaxError`** from `cancelOffers`: there is no ceiling or
  deadline left to validate. `EmptyMidnightGroupCancellationsError`,
  `DuplicateMidnightGroupCancellationError`, `InvalidMidnightHexInputError`,
  `MidnightInvalidAccountAddressError` and `ChainIdMismatchError` are thrown as before.

## What changed

- **Full cancellation only.** Every group is set to `maxUint128`, which Midnight treats as fully
  consumed. There is no partial amount.
- **An operator may send.** `accountAddress` is encoded as `onBehalf`. The maker can send the
  transaction, and so can an operator the maker authorized on Midnight.
- **A wrong sender now reverts.** In v9 the bundle cancelled the groups of whichever account sent
  the transaction, so a send from another account that had authorized MidnightBundlesV2 succeeded
  and left the maker's offers fillable. In v10 a sender that is neither `accountAddress` nor its
  operator reverts with `Unauthorized()` and no group changes.
- **A retry succeeds.** Cancelling a group that is already cancelled does not revert.
- **A batch is atomic.** Two or more groups are one `Midnight.multicall`: every group is cancelled
  or none.
- **The action type changed.** Code that switches on `tx.action.type` for a cancellation must handle
  `"midnightCancelOffers"`; `"midnightCancelAndMake"` now only describes maker bundles built by the
  maker flows or the pure builder.
- **Simulation.** `toSimulationLimits` from `@morpho-org/evm-simulation` throws
  `UnsupportedLimitActionError` for a `midnightCancelOffers` action, as it did for a cancel-only
  bundle. A cancellation moves no value: simulate it with `limits: "none"`.

## MPC wallets: cancel one group per transaction

Only the single-group transaction is a bare `setConsumed` call. A policy that allows `setConsumed`
on the chain's Midnight contract by method name approves it, and an approver reads three fields:
the group, the amount (`maxUint128`) and the maker.

A transaction that cancels two or more groups calls `multicall`, so a `setConsumed` method-name
policy does not match it, and allowing `multicall` by name would allow any Midnight call. In MPC
flows, send one `cancelOffers` transaction per group:

```ts
for (const group of groups) {
  const tx = midnight.cancelOffers({ accountAddress: maker, groups: [group] }).buildTx();
  await walletClient.sendTransaction(tx);
}
```

## Lower-level builders

- `midnightCancelOffers({ chainId, groups, onBehalf, metadata? })` is the new pure action behind
  `cancelOffers`, exported with `MidnightCancelOffersParams` and `MidnightCancelOffersAction`.
- `midnightCancelAndMake` is unchanged, including its cancel-only mode. Keep using it, or a maker
  flow, to cancel and replace offers in one transaction under `maxConsumed` guards.
