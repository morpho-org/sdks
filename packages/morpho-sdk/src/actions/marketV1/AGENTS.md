# `actions/marketV1/`

MarketV1 (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures (argument order, the `morphoBorrow` tuple shape, the receiver vs initiator distinction) live as JSDoc on each action — that's the canonical source. This file documents only the routing, the bundle ordering, and the pre-conditions the entity layer enforces.

## Routing

| Function | Route |
| --- | --- |
| `marketV1SupplyCollateral` | bundler3 via GeneralAdapter1 |
| `marketV1Borrow` | bundler3 via `morphoBorrow` |
| `marketV1SupplyCollateralBorrow` | bundler3 via GeneralAdapter1 (atomic) |
| `marketV1Repay` (assets or shares) | bundler3 via GeneralAdapter1 |
| `marketV1RepayWithdrawCollateral` | bundler3 — repay first, then withdraw collateral |
| `marketV1WithdrawCollateral` | direct Morpho call |

ERC-20 approval spender is **GeneralAdapter1** for any bundled path — never the Morpho contract.

## Bundle composition

| Path | Bundle |
| --- | --- |
| `supplyCollateral` (ERC-20) | `erc20TransferFrom → morphoSupplyCollateral` |
| `supplyCollateral` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoSupplyCollateral` |
| `borrow` | `morphoBorrow` |
| `borrow` (with reallocations) | `[reallocateTo × N] → morphoBorrow` |
| `supplyCollateralBorrow` | `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → morphoBorrow` |
| `supplyCollateralBorrow` (with reallocations) | `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → [reallocateTo × N] → morphoBorrow` |

`tx.value = (nativeAmount ?? 0n) + reallocationFeeTotal`.

## Mode and ordering rules

- `repay` accepts exactly one mode: assets (partial repay) or shares (full repay, with upper-bound transfer + `maxSharePrice`).
- `repayWithdrawCollateral` repays first, then withdraws — never the other order.
- `borrow` and `supplyCollateralBorrow` use `minSharePrice` for slippage protection (computed from market state + slippage tolerance).

## Required pre-conditions

Enforced by the entity layer's `getRequirements`; see [`entities/marketV1/AGENTS.md`](../../entities/marketV1/AGENTS.md):

- `borrow`, `supplyCollateralBorrow`, and `repayWithdrawCollateral` require GeneralAdapter1 to be authorized on Morpho (`setAuthorization`).
- Native wrapping requires the collateral token to be the configured wNative for the chain.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
