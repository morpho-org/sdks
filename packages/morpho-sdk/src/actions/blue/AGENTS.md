# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from
[`actions/AGENTS.md`](../AGENTS.md) and
[`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures and validation live as JSDoc on each action. This file is the
canonical routing and ordering summary.

## Routing

The established high-level methods on `client.morpho.blue(marketParams, chainId)` map to five
direct calls on the chain's registered BlueBundlesV1 deployment:

| Blue method | BlueBundlesV1 operation |
| --- | --- |
| `supply` | Supply loan assets. |
| `supplyCollateral`, `borrow`, `supplyCollateralBorrow` | Supply collateral, borrow, or perform both legs atomically. |
| `repay`, `withdrawCollateral`, `repayWithdrawCollateral` | Repay, withdraw collateral, or perform both legs in that order. |
| `withdraw` | Withdraw supplied loan assets by assets or shares. |
| `refinance` | Move the caller's full debt and collateral to a compatible destination market. |

There is no high-level Bundler3 or GeneralAdapter1 fallback and no second
`client.morpho.blueBundlesV1(...)` extension.

## Contract-owned composition

BlueBundlesV1, rather than an SDK-built `BundlerAction[]`, owns each operation's sequencing:

- `supply` pulls or wraps the loan token, deducts the referral fee, and supplies the remainder.
- `supplyCollateralBorrow` consumes optional Morpho authorization, pulls or wraps collateral,
  supplies it, executes optional Vault V2 public allocations, borrows, and pays net proceeds.
- `repayWithdrawCollateral` consumes optional Morpho authorization, pulls or wraps the maximum
  repay funding, repays before withdrawing collateral, charges the fee on assets actually repaid,
  and refunds unused funding.
- `withdraw` consumes optional Morpho authorization, executes optional Vault V2 public allocations,
  withdraws from Blue, then deducts allocator penalties and the referral fee from proceeds.
- `refinance` consumes optional Morpho authorization and moves the caller's full live
  debt and collateral. Optional Vault V2 allocator penalties and referral fees increase the
  destination debt.

Every call carries a contract execution deadline and optional referral-fee configuration. Action
builders stay synchronous and encode-only.

## Permit, native, and authorization rules

- Classic ERC-20 approvals and ERC-2612 permits name BlueBundlesV1 as spender.
- Permit2 SignatureTransfer keeps the ERC-20 approval on canonical Permit2, while the signed
  transfer names BlueBundlesV1 as spender. It is distinct from the Permit2 AllowanceTransfer flow
  used by GeneralAdapter1.
- Native funding is available only when the funded token is the chain's wNative. It is exclusive
  with an ERC-20 token permit, and `tx.value` must equal the funded amount.
- Morpho authorization names BlueBundlesV1, not GeneralAdapter1. A signed authorization is encoded
  in the direct entrypoint; otherwise the user submits the standalone requirement first.

## Mode, safety, and reallocation rules

- `supplyCollateralBorrow` and `repayWithdrawCollateral` require at least one non-zero leg.
  The simple `supplyCollateral`, `borrow`, `repay`, and `withdrawCollateral` builders delegate to
  these combined builders with the inactive leg set to zero.
  Repay accepts assets or shares; full repay uses the contract's saturated shares value. Withdraw
  accepts assets or shares.
- Borrow, collateral-withdraw, and migration legs enforce the SDK's buffered LLTV cap. Pure
  collateral supply and pure repay pass `maxUint256`, allowing an unhealthy position to improve
  without an oracle-dependent LTV rejection.
- High-level Blue writes expose no `slippageTolerance`, `minSharePrice`, or `maxSharePrice` input.
  BlueBundlesV1 cannot enforce Bundler3 share-price bounds.
- Write reallocations are Vault V2 `VaultV2BlueReallocation` calls only. They map to the contract's
  `PublicAllocations` and execute unconditionally. PublicAllocator V1 planning and low-level
  composition helpers remain available only for compatibility, are deprecated for future removal,
  and do not produce valid inputs for these builders.

Requirement details live in [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md). Reallocation
mapping is canonical in
[`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement).
