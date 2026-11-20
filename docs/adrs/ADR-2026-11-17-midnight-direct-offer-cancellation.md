# ADR-2026-11-17: Cancel Midnight offers through a direct Midnight call

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **Date**   | 2026-11-17                                                                         |
| **Author** | @jinmel                                                                            |
| **Scope**  | Packages and target versions: `morpho-sdk` 10.0.0, `evm-simulation` (next patch) |

_Frozen after merge; only superseded-by entries in References change._

## Context

`ADR-2026-10-02-midnight-bundles-v2-sdk-actions` routed `cancelOffers` through
`MidnightBundlesV2.midnightBundlesV2CancelAndMake`, the entrypoint that also publishes offers, parks
loan assets and supplies collateral, to keep one publication path for cancelling and making.

Makers who signed with MPC wallets reported that such a cancellation was hard to approve and hard
to write a policy for. A cancel-only call carried about 17 arguments, most of them zero, so an
approver had to check each one, and a policy letting a signer cancel had to decode the calldata and
assert on argument values. Not every wallet provider supported argument-level conditions. The
bundle route also required the maker to authorize `MidnightBundlesV2` on Midnight first, existed
only on chains with a pinned bundle, and cancelled the groups of whichever account sent the
transaction, so a send from the wrong account could succeed and leave the maker's offers fillable.

`Midnight.setConsumed(group, amount, onBehalf)` had three flat fields, could only raise a group's
consumed amount (it reverted with `AlreadyConsumed()` when `amount` was below the current value), and
reverted unless the sender was `onBehalf` or its authorized operator. A wallet
policy could allow it by function name alone. `Midnight.multicall` delegatecalled each entry to
Midnight itself and reverted as a whole on the first failure.

## Decision

`cancelOffers` calls Midnight directly and never targets `MidnightBundlesV2`.

- **Encoding.** One group encodes a bare `setConsumed(group, maxUint128, onBehalf)`. Two or more
  groups encode one `Midnight.multicall` holding one such `setConsumed` call per group, in list
  order. A single group is never wrapped in `multicall`: only the bare call is matchable by a
  method-name policy. The SDK encodes only `setConsumed` entries into the `multicall`, never
  caller-supplied calldata.
- **Full cancellation only.** The amount is always `maxUint128`. There is no partial amount, no
  `maxConsumed` consumption guard and no `deadline`.
- **Account.** `onBehalf` is the account the caller passes. The maker or its Midnight-authorized
  operator can send the transaction; any other sender reverts and no group changes.
- **Requirements.** The entity handle's `getRequirements()` resolves to an empty list and reads
  nothing: no Midnight authorization, approval or signature.
- **Validation.** An empty list, a repeated group, a group that is not 32-byte hex, an invalid or
  zero account, a client on another chain and a chain without a Midnight deployment all throw an
  existing typed error before encoding. No error class is added.
- **Availability.** The route builds on every chain with a registered Midnight deployment, not only
  chains with a pinned `MidnightBundlesV2`.
- **Simulation.** `evm-simulation` has no operation limit for a cancellation, which moves no value:
  `toSimulationLimits` throws `UnsupportedLimitActionError` for the new action type, as it does for
  a cancel-only bundle.

Public surface:

```ts
// Pure action, exported from the morpho-sdk barrel.
midnightCancelOffers(params: {
  readonly chainId: number;
  readonly groups: readonly Hex[];
  readonly onBehalf: Address;
  readonly metadata?: Metadata;
}): Readonly<Transaction<MidnightCancelOffersAction>>;

// Action metadata, the same type for both encodings.
interface MidnightCancelOffersAction
  extends BaseAction<
    "midnightCancelOffers",
    { readonly groups: readonly Hex[]; readonly onBehalf: Address }
  > {}

// Entity method on client.morpho.midnight(chainId); name kept, parameters and action retyped.
cancelOffers(params: {
  readonly accountAddress: Address;
  readonly groups: readonly Hex[];
}): MidnightActionOutput<MidnightCancelOffersAction>;
```

`cancelOffers` no longer accepts `cancellations` or `deadline`, and its transactions carry
`MidnightCancelOffersAction` instead of `MidnightCancelAndMakeAction`.

Semver: a `morpho-sdk` major, because `cancelOffers` is retyped. The name is kept and retyped in
that major with no deprecation period, under a `docs/EXCEPTIONS.md` entry scoped to that symbol and
version; the migration guide shows the call before and after. The `evm-simulation` change is a
patch: no public symbol or thrown class changes.

Not covered: the pure `midnightCancelAndMake` builder, including its cancel-only mode, and every
maker flow (`makeLend`, `makeBorrow`, `makeWithdraw`, `makeRepay`, `supplyCollateralMakeBorrow`,
`supplyBlueMakeLend`) keep the `MidnightBundlesV2` route and their calldata. Cancel-and-replace stays
on the bundle, where the `maxConsumed` guard protects the replacement.

## Invariants

- A cancellation never makes an offer more fillable: every encoded amount is `maxUint128`. Check:
  unit and property tests decode every `setConsumed` entry of both encodings.
- A single-group cancellation is a bare `setConsumed` call. Check: a unit test asserts the
  calldata selector and decodes the call; a fork test sends it.
- A batch `multicall` holds only `setConsumed` entries. Check: a unit test decodes every entry.
- A batch cancels every listed group or none. Check: a fork test sends a batch from an
  unauthorized account and reads every group unchanged.
- A sender that is neither the maker nor its Midnight operator reverts and never cancels its own
  groups instead. Check: a fork test.
- No cancellation transaction targets `MidnightBundlesV2`. Check: a unit test builds on every
  registered Midnight chain and asserts the target.
- Maker-flow calldata is unchanged. Check: the existing maker-flow inline snapshots.
- Revisit if makers need a consumption guard or a partial amount on plain cancellation, or if
  wallet policies gain a safe way to allow a `multicall` of `setConsumed` calls by method name.

## Rejected alternatives

- **Add `cancelOffer` and `cancelOfferBatch`, deprecate `cancelOffers`, remove it in the next
  major.** Rejected because it leaves a bundle cancel route alive for a release and three names for
  one intent.
- **Always wrap in `multicall`, as the collateral batches do.** Rejected because a single
  cancellation would be matched by the `multicall` selector, which a method-name policy cannot
  safely allow, and the change would lose its purpose.
- **Keep the bundle route and document an argument-level policy per wallet provider.** Rejected
  because the policy needs about ten positional conditions and not every provider supports them.

## References

- Supersedes the cancel route of
  [`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)
  (`cancelOffers` through `midnightCancelAndMake`), its `cancelOffers` signature and single-group
  cancellation rule, and its rejection of a direct `setConsumed` call.
- [`Midnight.setConsumed`](https://github.com/morpho-org/midnight/blob/336b924/src/Midnight.sol#L761-L766)
  at the pinned commit: `require(amount >= consumed[onBehalf][group], AlreadyConsumed())`.
- [`ADR-2026-09-23-stateless-entity-flows`](./ADR-2026-09-23-stateless-entity-flows.md) — the
  handle shares no state between `getRequirements()` and `buildTx()`.
