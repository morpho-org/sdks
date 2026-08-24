# TIB-2026-08-18: Vault V2 Blue reallocation API

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Status**     | Accepted                                                  |
| **Date**       | 2026-08-18                                                |
| **Author**     | @Rubilmax                                                 |
| **Scope**      | Package: `morpho-sdk`                                     |
| **Supersedes** | TIB-2026-07-29 V2 reallocation API naming and entrypoints |

---

## Context

TIB-2026-07-29 named the state `VaultV2ReallocationData` and exposed both an
operation-aware entity method and a standalone function delegating to that
method. The generic Vault V2 name is ambiguous because Vault V2 can allocate
through Morpho Blue and Midnight adapters. The standalone function adds no
behavior and preserves no released API.

The existing unversioned `MorphoBlue.getReallocationData` method only fetches
Vault V1 state, making its protocol scope unclear.

## Decision

- Name the entity `VaultV2BlueReallocationData` and its input
  `InputVaultV2BlueReallocationData`.
- Use one `computeVaultV2BlueReallocations` method. Without an operation it
  discovers every friendly call; with `options.operation` it returns the
  amount-aware plan. Both modes return the calls and simulated state.
- Remove the standalone V2 planner and the separate unreleased
  `computeVaultV2BlueReallocationsForOperation` method.
- Add `MorphoBlue.getVaultV2BlueReallocationData` to fetch the target market,
  Vault V2 accrual trees, and BluePublicAllocator state at one block.
- Add `MorphoBlue.getVaultV1ReallocationData`. Keep `getReallocationData` as a
  deprecated delegating alias.
- Use the same unversioned liquidity-metric method names on both data classes;
  the class name supplies protocol context.

V1's per-market source and trigger utilization options remain deprecated, while
`defaultMaxWithdrawalUtilization` remains configurable for its two-phase
planner. V2 exposes a scalar `maxWithdrawalUtilization` for the friendly source
phase, defaulting to 90%; its target threshold remains fixed at 90%, and its
second phase always uses the internal 100% source ceiling.

V2 keeps the latest market or vault `lastUpdate` as its default simulation
timestamp. A target market can be older than a source or vault; using only its
timestamp would evaluate one fetched snapshot at inconsistent times. Callers
can pass the fetched block timestamp explicitly.

V2 candidate cap sizing remains a binary search. Cap fit is monotonic but not
linear because the candidate amount changes penalty donations,
`firstTotalAssets`, rounded market shares, and potentially shared allocation
IDs. Direct headroom subtraction cannot reproduce the contract-exact boundary.

### Addendum (2026-08-24): shared-cap intervals

The monotonic-prefix statement above applies only to target allocation IDs that
are not shared with the source. Principal cancels for a shared ID, while a
positive penalty can increase `firstTotalAssets` and its relative-cap capacity;
that shared cap therefore imposes a lower bound. Combined feasibility is an
interval. The planner folds the operation's remaining amount into the initial
ceiling, bisects only non-shared upper-bound caps, then probes the selected
amount against every target cap before retaining the call.

The V2 mutation helper remains private and returns a cloned state. It must keep
penalty accounting, vault accrual, adapter shares, allocations, and canonical
market references coherent as one transition. V1's protected helper is a
legacy test seam, not a public extension point to copy.

## Consequences

- V2 Blue-specific symbols are unambiguous beside future Midnight state APIs.
- Root, `/utils`, and `/entities` expose no standalone V2 planner.
- No V2 compatibility aliases are needed because the renamed surface was
  unreleased.
- Published V1 names continue through the existing deprecation policy.
