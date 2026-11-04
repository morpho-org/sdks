# ADR-2026-10-22: EVM simulation — sender approval allowlist

| Field      | Value                                        |
| ---------- | -------------------------------------------- |
| **Date**   | 2026-10-22                                   |
| **Author** | @devin-ai-integration                        |
| **Scope**  | `@morpho-org/evm-simulation` 8.4.0           |

_Frozen after merge; only superseded-by entries in References change._

## Context

Bundles could grant allowances or authorizations whose lasting authority was not visible in
balance deltas. Slippage and retained-balance checks therefore did not show which permissions
would remain after execution. Preview signatures could also be applied outside the simulated
bundle. ADR-2026-10-01 had left permission checks outside the simulator's contract, while consumers
needed a bounded safeguard that did not decode calldata or restrict every bundle target.

## Decision

When a request supplies operation limits, the simulator rejects sender-granted permissions outside
an allowlist derived from those operations and the chain registry, unioned with explicit caller
approvals.

`SimulationLimits` and `SimulationInputLimits` gain the optional, non-breaking field:

```ts
export type ApprovalLimit =
  | {
      readonly type: "token";
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
    }
  | {
      readonly type: "morphoAuthorization";
      readonly authorizer: Address;
      readonly authorized: Address;
    }
  | {
      readonly type: "midnightAuthorization";
      readonly onBehalf: Address;
      readonly authorized: Address;
    };

readonly approvals?: readonly ApprovalLimit[];
```

- Derive the allowed token, owner, and spender from the declared operation and subject, the
  simulation sender, pinned subject-token reads, and registered chain addresses. Vault deposits
  additionally allow the subject token directly to the vault; Blue pay-in legs additionally allow
  it directly to Morpho Blue. Midnight pay-ins (supply collateral, lend, repay, Blue parking) allow
  the paid token to Midnight and MidnightBundlesV2; the token comes from the pinned Midnight
  market, or from the declared `loanToken` for Blue parking. Never derive permission from transaction calldata or
  caller-supplied quote-token overrides; the one exception is an explicit `assetPaid` on a first
  `midnightSupplyCollateral` or `midnightSupplyCollateralMakeBorrow` into a market the bundle
  creates, which has no pinned market to read.
- Check sender grants in events from every preparation and user call, and check pending preview
  approval, permit, Permit2, and Morpho authorization requests against the same allowlist before
  execution.
- Check ERC-20 and Permit2 allowances, ERC-721 token and operator approvals, and Morpho
  authorizations. Allow zero amounts and revocations; do not bound approval amounts. Permit2 is
  optional when the chain registry has no Permit2 address: no Permit2 spender is derived, but
  Permit2-topic events are decoded from any emitter and checked against the allowlist. ERC-721
  grants are never allowlistable.
- Validate that pending Morpho authorization signatures use the registered Morpho verifying
  contract and Permit2 transfer signatures use the registered Permit2 verifying contract; a
  mismatch is not allowlistable.
- Fail closed with typed errors when a required token or registry address is unavailable. Bundler
  spenders the registry doesn't list are left off the derived allowlist instead.
- `limits: "none"` explicitly opts out of approval checks. Restricting call targets and recipients
  remains out of scope.
- The optional `approvals` field and the new error classes are additive and no public symbol is
  removed or retyped, so this ships in a minor release.
- Sender Midnight `setIsAuthorized` grants are checked from the registered Midnight contract's `SetIsAuthorized` logs whenever the sender is `onBehalf` or `caller`; a sender-called grant for another account needs an explicit entry matching both `onBehalf` and `authorized`. Every Midnight operation allows a grant to `midnightBundlesV2`; plain `midnightSupplyCollateral` allows only that grant, while `midnightSupplyCollateralMakeBorrow` and `midnightSupplyBlueMakeLend` also allow `priceRatifierV1` and `rateRatifierV1`, and other grants need a matching `midnightAuthorization` entry. Revocations pass. Ratifier root ratification (`SetIsRootRatified*`) is not checked.
- ERC-777 operator grants (`authorizeOperator`, `AuthorizedOperator` events) are not checked.

## Consequences and compatibility

This change ships in `evm-simulation` 8.4.0 as a minor release, with no migration guide.

## Invariants

- Derived permissions use only the operation type and subject, the sender, pinned subject-token
  reads and registered addresses (plus an explicit `assetPaid` on a first
  `midnightSupplyCollateral` or `midnightSupplyCollateralMakeBorrow` into a market the bundle
  creates), and explicit entries extend rather than replace them → approval-limit unit tests.
- Sender-granted permissions outside the allowlist fail; sender ERC-721 grants and pending
  signatures for an unregistered verifying contract always fail; other token and Morpho owners'
  events, Midnight grants where neither caller nor `onBehalf` is the sender, zero grants, and
  revocations pass → approval-event unit tests and pinned-fork tests.
- Pending preview authorization requests use the same allowlist before execution → authorization
  unit tests and the pinned-fork permit test.
- Missing registry or token evidence never disables the check → unavailable-registry unit test and
  fail-closed token resolution.
- `"none"` is an explicit opt-out; no call-target or recipient policy is implied → request parser
  tests and the approval-check gate in the simulation pipeline.

## References

- [ADR-2026-10-01: EVM simulation — caller-quoted slippage limits](./ADR-2026-10-01-evm-simulation-quoted-slippage-limits.md) — this decision partially supersedes its no-permission-checks stance.
