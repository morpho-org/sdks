# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures (argument order, the `morphoBorrow` tuple shape, the receiver vs initiator distinction) live as JSDoc on each action — that's the canonical source. This file documents only the routing, the bundle ordering, and the pre-conditions the entity layer enforces.

## Routing

| Function | Route |
| --- | --- |
| `blueSupply` (assets) | bundler3 via `morphoSupply` |
| `blueSupplyCollateral` | bundler3 via GeneralAdapter1 |
| `blueBorrow` | bundler3 via `morphoBorrow` |
| `blueSupplyCollateralBorrow` | bundler3 via GeneralAdapter1 (atomic) |
| `blueRepay` (assets or shares) | bundler3 via GeneralAdapter1 |
| `blueRepayWithdrawCollateral` | bundler3 — repay first, then withdraw collateral |
| `blueWithdraw` (assets or shares) | bundler3 via `morphoWithdraw` |
| `blueWithdrawCollateral` | direct Morpho call |

ERC-20 approval spender is **GeneralAdapter1** for any bundled path — never the Morpho contract.

## Bundle composition

| Path | Bundle |
| --- | --- |
| `supply` (ERC-20) | `[erc20TransferFrom \| permit/permit2] → morphoSupply` |
| `supply` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoSupply` |
| `supplyCollateral` (ERC-20) | `erc20TransferFrom → morphoSupplyCollateral` |
| `supplyCollateral` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoSupplyCollateral` |
| `borrow` | `morphoBorrow` |
| `borrow` (with reallocations) | `[reallocateTo × N] → morphoBorrow` |
| `repay` (ERC-20) | `[erc20TransferFrom \| permit/permit2] → morphoRepay → [erc20Transfer skim if shares]` |
| `repay` (native) | `[nativeTransfer → wrapNative]? → [erc20TransferFrom?] → morphoRepay → [erc20Transfer skim if shares]` |
| `supplyCollateralBorrow` | `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → morphoBorrow` |
| `supplyCollateralBorrow` (with reallocations) | `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → [reallocateTo × N] → morphoBorrow` |
| `withdraw` | `morphoWithdraw` |
| `withdraw` (with reallocations) | `[reallocateTo × N] → morphoWithdraw` |

`BundlerAction.encodeBundle` derives `tx.value` from native wrapping calls and reallocation fees.

## Mode and ordering rules

- `repay` funds the transfer as `amount` (ERC-20) + `nativeAmount` (wrapped), summing to `transferAmount` — same surface as `supply` / `supplyCollateral`. Mode is set by `shares`: omit/`0n` for assets mode (repays exactly `transferAmount`); `shares > 0` for full repay (`transferAmount` is the upper-bound estimate, residual skimmed to `receiver`). Uses `maxSharePrice`.
- `withdraw` accepts exactly one mode: assets (exact asset amount) or shares (full close, immune to interest accrual). No transfer/skim needed — `morphoWithdraw` sends to `receiver` directly.
- `repayWithdrawCollateral` repays first, then withdraws — never the other order.
- `supply` uses `maxSharePrice` (anti-inflation upper bound, `WAD + slippage`).
- `borrow`, `supplyCollateralBorrow`, and `withdraw` use `minSharePrice` (`WAD − slippage`, computed from market state + slippage tolerance).

## Required pre-conditions

Enforced by the entity layer's `getRequirements`; see [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md):

- `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` require GeneralAdapter1 to be authorized on Morpho (`setAuthorization`).
- Native wrapping requires the collateral token (collateral-supply paths) or the loan token (`supply`, `repay`) to be the configured wNative for the chain.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
