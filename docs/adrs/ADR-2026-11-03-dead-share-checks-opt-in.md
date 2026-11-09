# ADR-2026-11-03: Dead-share checks are opt-in for integrators

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| **Date**   | 2026-11-03                                                             |
| **Author** | @Foulks-Plb                                                            |
| **Scope**  | Packages: `morpho-sdk` (next minor), `wdk-protocol-lending-morpho-evm` (next minor) |

_Frozen after merge; only superseded-by entries in References change._

## Context

`ADR-2026-10-30-dead-share-protection` made snapshot-taking supply, deposit and migration builders
refuse targets without a sufficient dead deposit. A check of the vaults and markets listed in the
Morpho apps found that the rule would block deposits into dozens of live vaults, most of them seeded
themselves but reaching an unseeded market through their withdraw queue or caps. Integrators could
not adopt the release without refusing deposits their users already make, and the SDK offered no way
to skip the check for vault deposits.

## Decision

SDK builders do not enforce the dead-deposit rule. Integrators that want the protection run the
exported validators on their snapshot before building.

- Vault V1 and V2 `deposit`, Vault V1 `migrateToV2`, Blue `supply({ marketData })` and Midnight
  `supplyBlueMakeLend` no longer throw `InsufficientDeadSharesError` or `MissingDeadSharesDataError`.
- `validateBlueMarketDeadShares`, `validateVaultV1DeadShares`, `validateVaultV2DeadShares`,
  `MIN_DEAD_SHARES`, `MIN_VAULT_V2_DEAD_ASSETS`, `DEAD_ADDRESS`, `InsufficientDeadSharesError` and
  `MissingDeadSharesDataError` stay exported with unchanged signatures and thresholds, including the
  WDK re-exports.
- `supplyBlueMakeLend` again throws `EmptyBlueParkingMarketError` when the parking market has no
  supply shares.
- `EmptyBlueParkingMarketError` is no longer deprecated.
- The Blue `supply` overloads keep their signatures and deprecation schedule.
- Semver: a minor for both packages; no public symbol is removed or retyped.

## Invariants

- No supply, deposit or migration builder calls a dead-share validator. Check: a grep for
  `validate*DeadShares(` outside the validators and their tests finds nothing.
- The validators keep their thresholds and fail-closed behavior. Check: the validator unit tests.
- Revisit if the listed vaults and markets meet the dead-deposit rule, or if the SDK gains an
  explicit per-call opt-out.

## Rejected alternatives

- Keep enforcement and wait for curators and market seeding: blocks integrators' releases on
  remediation they do not control.
- Revert the enforcement change and its exports: removes public symbols, so it needs a major.

## References

- Supersedes `ADR-2026-10-30-dead-share-protection`.
