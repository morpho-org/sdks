# `packages/morpho-sdk/`

Transaction builders for VaultV1, VaultV2, Blue, and Midnight. Subfolders carry the layer-scoped detail; this file is the package overview + glossary.

> Architecture / type / test / doc / release rules apply per the [root `AGENTS.md`](../../AGENTS.md). Subfolder rules: see each `src/<layer>/AGENTS.md`.

## Routing summary

- **VaultV1 / VaultV2 deposits** route through bundler3 via GeneralAdapter1 (which enforces `maxSharePrice`, protecting against inflation attacks). VaultV1/V2 `withdraw` and `redeem` are direct vault calls. VaultV2 `forceWithdraw` / `forceRedeem` use `multicall` with `forceDeallocate` calls before the final withdraw/redeem.
- **Blue bundled paths** (`supply`, `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `repayWithdrawCollateral`, `withdraw`) route through bundler3 via GeneralAdapter1. `repay` and `withdraw` each accept assets or shares (mutually exclusive); `repayWithdrawCollateral` repays first then withdraws. Loan-asset `supply` supports native wrapping when `loanToken === wNative`; loan-asset `withdraw` supports optional PublicAllocator reallocations to top up market liquidity (same mechanism as `borrow`).
- **Midnight paths** expose lazy action outputs under `client.morpho.midnight(chainId)`. Fixed-rate market taker flows route through Midnight Bundles, direct collateral supply/cancel/redeem route through Midnight, and maker flows return ratify-root requirements plus the mempool payload transaction. The SDK owns protocol transactions and requirements; integrators keep UI labels, rate math, and display decisions.
- **Bundle composition, native wrapping, and reallocation rules** are canonical in [`src/actions/AGENTS.md`](./src/actions/AGENTS.md).

## Tests

Per root §5: tests for this package are colocated (`src/**/*.test.ts`). Some legacy tests still live under `packages/morpho-sdk/test/` — migrate them next to source on refactor. Use parameterized fixtures (`randomMarket(...)`); never weaken assertions to make a test pass.

## Glossary

Protocol terms used across this package's docs and JSDoc:

### Contracts and adapters

- **Blue / Morpho Blue** — Morpho's immutable, **variable-rate** lending primitive (formerly called "MarketV1" in this SDK). Each market is an isolated pair whose borrow rate floats with utilization, driven by the market's IRM. A market is identified by `MarketParams { loanToken, collateralToken, oracle, irm, lltv }`. Exposed via `client.blue(marketParams, chainId) → MorphoBlue`. This is the canonical definition of "Blue" for the whole package; other docs link here rather than redefine it.
- **Midnight** — Morpho's fixed-rate lending primitive. Takers consume signed offers through Midnight Bundles; makers submit offer groups/trees to the Midnight mempool after Ecrecover signing or Setter ratification.
- **VaultV1 / MetaMorpho** — ERC-4626 vault layered on top of Blue.
- **VaultV2** — successor vault with adapter-based liquidity routing and `forceDeallocate`.
- **bundler3** — the bundler entry point; receives a sequence of adapter actions in one transaction.
- **GeneralAdapter1** — the bundler-side adapter that holds approvals/auth and executes Morpho calls on the user's behalf. Required as the spender for ERC-20 approvals on every bundled path; required as authorized operator on Morpho for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` (the supplier-side path).
- **PublicAllocator** — Morpho contract that lets vault curators move liquidity between markets within a vault (`reallocateTo(...)`).

### Bundler actions

The action verbs an integrator sees in the bundle (`BundlerAction.encode...`):

- **`morphoBorrow` / `morphoSupply` / `morphoSupplyCollateral` / `morphoRepay` / `morphoWithdraw`** — Morpho Blue contract calls executed by GeneralAdapter1 on the user's behalf.
- **`setAuthorization`** — Morpho call that grants GeneralAdapter1 the right to call market functions on behalf of the user. Required pre-condition for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` (loan-asset).
- **`erc20TransferFrom`** — pulls user-approved tokens into the bundler.
- **`nativeTransfer` + `wrapNative`** — pair that converts an attached native amount (`tx.value`) into the chain's wNative for a deposit/supply path.
- **`forceDeallocate`** — VaultV2 multicall entry that pulls liquidity out of a specific adapter before withdraw/redeem.
- **`reallocateTo`** — `PublicAllocator` call that shifts liquidity between markets in a curator vault before a borrow or a loan-asset withdraw.

### Constants and conventions

- **wNative** — the chain's wrapped-native token (e.g. WETH). The only asset/collateral for which native wrapping bundles are valid.
- **WAD** — fixed-point scale `1e18`. Used for rates, slippage tolerances, LTVs.
- **`ORACLE_PRICE_SCALE`** — `1e36`, the scale Morpho uses for `price * collateral / WAD = collateralValueInLoanToken`.
- **LLTV / LLTV buffer** — Liquidation-LTV. The `DEFAULT_LLTV_BUFFER` (0.5%, hardcoded) is subtracted from the market LLTV before validating that a `supplyCollateralBorrow` (or post-withdraw safety check) keeps the position healthy.
- **`minSharePrice` / `maxSharePrice`** — slippage bounds attached to bundled `morphoBorrow` / vault deposits, computed from market or vault state plus the user's slippage tolerance (capped by `MAX_SLIPPAGE_TOLERANCE` = 10%).
- **Permit / Permit2** — signature-based approval flows. Permit covers ERC-2612–compatible tokens (one signature per token); Permit2 (canonical Universal Router pattern) batches and revokes via the Permit2 contract. Both flow through `actions/requirements`.
