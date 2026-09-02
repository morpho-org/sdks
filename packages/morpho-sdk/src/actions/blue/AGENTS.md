# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures live as JSDoc on each action. This file documents only routing,
fixed-call ordering, and the preconditions enforced by the entity layer.

## Routing

| Function | Route |
| --- | --- |
| `blueSupply` | BlueBundlesV1 `supply` |
| `blueSupplyCollateral` | BlueBundlesV1 `supplyCollateral` |
| `blueBorrow` | BlueBundlesV1 `borrow` |
| `blueSupplyCollateralBorrow` | BlueBundlesV1 `supplyCollateralBorrow` |
| `blueRepay` | BlueBundlesV1 `repay` |
| `blueRepayWithdrawCollateral` | BlueBundlesV1 `repayWithdrawCollateral` |
| `blueWithdraw` | BlueBundlesV1 `withdraw` |
| `blueWithdrawCollateral` | BlueBundlesV1 `withdrawCollateral` |
| `blueRefinance` | BlueBundlesV1 `refinance` |

The registered BlueBundlesV1 deployment is the spender for classic token approvals, ERC-2612
permits, and Morpho authorizations. Permit2 SignatureTransfer keeps the ERC-20 allowance on
canonical Permit2 while naming BlueBundlesV1 as the signed spender.

## Fixed-call ordering

| Path | Ordering owned by BlueBundlesV1 |
| --- | --- |
| `supply` / `supplyCollateral` | pull or wrap token → supply |
| `borrow` / `withdraw` | consume Morpho authorization → optional V2 reallocations → transfer proceeds |
| `supplyCollateralBorrow` | pull collateral → supply collateral → optional V2 reallocations → borrow |
| `repay` | pull or wrap loan token → repay → refund excess |
| `repayWithdrawCollateral` | pull or wrap loan token → repay → withdraw collateral → refund excess |
| `withdrawCollateral` | consume Morpho authorization → withdraw collateral |
| `refinance` | consume source authorization → optional V2 reallocations → repay source and open destination |

High-level allocator inputs contain only BluePublicAllocator V2 `reallocate`/`allocateFromIdle`
calls. BlueBundlesV1 pays their aggregate penalties inside the fixed call. PublicAllocator V1
planners and Bundler3 encoders remain available only for deprecated low-level composition.

## Mode and ordering rules

- Fixed-call funding is exclusive: an operation pulls ERC-20 or wraps native value, never both.
- `repay` accepts exactly one mode: assets or shares. The entity resolves state-dependent transfer
  values before calling the pure action. `repayWithdrawCollateral` mirrors this repay leg, then
  withdraws collateral.
- `withdraw` accepts exactly one mode: assets or shares.
- `repayWithdrawCollateral` repays first, then withdraws collateral.
- High-level Blue writes expose no share-price bounds because BlueBundlesV1 cannot enforce them.

## Required preconditions

Enforced by the entity layer's `getRequirements`; see [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md):

- Position-moving calls require BlueBundlesV1 to be authorized on Morpho. With signature support,
  the fixed call consumes a signed authorization instead of requiring a standalone transaction.
- Native funding requires the supplied token to be the configured wNative for the chain.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
