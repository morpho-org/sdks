# ADR-2026-10-21: Unlimited SDK approvals

| Field      | Value                  |
| ---------- | ---------------------- |
| **Status** | accepted               |
| **Date**   | 2026-10-21             |
| **Author** | @Foulks-Plb            |
| **Scope**  | Packages: `morpho-sdk` 9.0.0, `wdk-protocol-lending-morpho-evm` 4.0.0 |

_Status is the only field that changes after acceptance._

## Context

Integrators currently manage repeated token and vault-share approvals through the SDK. Exact-amount
approvals require another approval transaction as positions or token pulls change, while a standing
approval must be explicitly requested and can be capped by an SDK-derived share ceiling. A simpler
flow should request one approval per token and spender, while preserving the bundle contracts'
existing exact-value permit calls and making the remaining share-burn risk explicit.

## Decision

SDK-generated classic token approvals and vault-share approvals and permits authorize
`maxUint256`, subject to the existing per-token approval caps and USDT-style zero-reset behavior.

- Classic ERC-20 approvals to BlueBundlesV1, VaultBundlesV1, VaultExitBundlesV1, Midnight, and
  MidnightBundlesV2 request the maximum allowed by `MAX_TOKEN_APPROVALS` when the current allowance
  is below the pull amount.
- Vault-share approvals and ERC-2612 share permits authorize `maxUint256`; any allowance at least
  as large as the SDK-derived minimum satisfies the requirement. Spender allowlists remain.
- ERC-2612 token permits and Permit2 SignatureTransfer remain exact because the deployed bundles
  pass the pull amount as the permit value or transfer permission.
- Asset-mode vault withdrawals, the asset-mode V1 `migrateToV2` source leg, and in-kind redemption
  have no on-chain share-price or max-shares bound. Only Vault V2 `forceWithdraw`'s
  `minSharePriceE27`, shares-mode redemption's fixed share amount, and deposit or migration
  destination `maxSharePrice` constrain those operations. A share-price drop before inclusion can
  therefore burn more shares than quoted when an unlimited share allowance is available.
- In `morpho-sdk` 9.0.0 and WDK 4.0.0, remove `approvalAmount` from `BlueTokenRequirementsParams`,
  `GetBundlesTokenRequirementsParams`, `GetMidnightApprovalRequirementsParams`,
  `MidnightRequirementsParams`, `RequirementOptions`, and `getRequirementsApproval` arguments;
  remove `EncodeVaultSharesPermitParams.amount`, `ApprovalAmountLessThanSpendAmountError` and its
  WDK re-export. Retype the `BundlesTokenRequirementsState` approval branch without the option.
  These listed removals and retypes skip the deprecation minor under the matching §7 exception.
- JavaScript callers that continue passing `approvalAmount` receive no warning; the extra property
  is ignored and the SDK requests an unlimited approval when needed. Migration guides must call
  out this silent behavior change.
- Unlimited approvals expose the full token or share balance to the registered bundles contract if
  that contract is compromised. Any remaining allowance is visible to wallet and allowance-revocation
  tools.

## Invariants

- Classic approvals use the maximum allowed amount, and sufficient allowances return no
  requirement → approval and allowance-threshold unit tests.
- USDT-style zero-reset and per-token caps remain intact → approval encoder unit tests.
- Token permits remain exact and share permits remain unlimited → bundle-permit behavior tests and
  fork tests where RPC is available.
- Only the operations listed above have the stated on-chain share bounds → action calldata tests
  and review of the fixed bundles ABI; no contract change is part of this decision.

## Rejected alternatives

- **Keep exact approvals and expose a reusable-allowance option.** Rejected because it retains the
  repeated-approval flow this change is intended to remove.
- **Sign unlimited ERC-2612 token permits or Permit2 SignatureTransfer values.** Rejected because
  deployed bundle contracts tie the permit or transfer permission to the exact pull amount.
- **Change contracts to add exit share-burn bounds.** Rejected for this SDK change; existing
  deployed bundle contracts cannot be changed here.

## References

- [`ADR-2026-07-27-vault-exit-in-kind-redemption`](./ADR-2026-07-27-vault-exit-in-kind-redemption.md),
  Alternative 4.
- [`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md).
- [`ADR-2026-08-28-vault-exit-force-withdraw`](./ADR-2026-08-28-vault-exit-force-withdraw.md):
  its bounded vault-share allowance is superseded by this record.
- [`ADR-2026-09-18-evm-simulation-calldata-verification`](./ADR-2026-09-18-evm-simulation-calldata-verification.md):
  its VaultBundlesV1 exit share-allowance rule is superseded by this record.
