# `packages/morpho-sdk/`

Transaction builders for VaultV1, VaultV2, Blue, and Midnight, plus shared requirement helpers used by protocol flows. Subfolders carry the layer-scoped detail; this file is the package overview + glossary.

> Architecture / type / test / doc / release rules apply per the [root `AGENTS.md`](../../AGENTS.md). Subfolder rules: see each `src/<layer>/AGENTS.md`.

## Routing summary

- **VaultV1 / VaultV2 deposits** route through bundler3 via GeneralAdapter1 (which enforces `maxSharePrice`, protecting against inflation attacks). VaultV1/V2 `withdraw` and `redeem` are direct vault calls. VaultV2 `forceWithdraw` / `forceRedeem` use `multicall` with `forceDeallocate` calls before the final withdraw/redeem.
- **Blue bundled paths** (`supply`, `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `repayWithdrawCollateral`, `withdraw`) route through bundler3 via GeneralAdapter1. `repay` and `withdraw` each accept assets or shares (mutually exclusive); `repayWithdrawCollateral` repays first then withdraws. Loan-asset `supply`, `repay`, and `repayWithdrawCollateral` support native wrapping when `loanToken === wNative` (repay assets mode is additive like supply; repay shares mode carves native out of the transfer); loan-asset `withdraw` supports optional PublicAllocator reallocations to top up market liquidity (same mechanism as `borrow`).
- **Midnight paths** expose lazy action outputs under `client.morpho.midnight(chainId)`. Fixed-rate market taker flows route through Midnight Bundles, direct collateral supply/cancel/redeem route through Midnight, and maker flows return ratify-root requirements plus the mempool payload transaction. Requirement helpers under `src/actions/requirements/midnight` resolve Midnight authorization, Setter ratify-root, and token-pull requirements.
- **Bundle composition, native wrapping, and reallocation rules** are canonical in [`src/actions/AGENTS.md`](./src/actions/AGENTS.md).

## Tests

Per root §5: tests for this package are colocated (`src/**/*.test.ts`). Some legacy tests still live under `packages/morpho-sdk/test/` — migrate them next to source on refactor. Use parameterized fixtures (`randomMarket(...)`); never weaken assertions to make a test pass.

## Glossary

Protocol terms used across this package's docs and JSDoc:

### Contracts and adapters

- **Blue / Morpho Blue** — Morpho's immutable, **variable-rate** lending primitive (formerly called "MarketV1" in this SDK). Each market is an isolated pair whose borrow rate floats with utilization, driven by the market's IRM. A market is identified by `MarketParams { loanToken, collateralToken, oracle, irm, lltv }`. Exposed via `client.blue(marketParams, chainId) → MorphoBlue`. This is the canonical definition of "Blue" for the whole package; other docs link here rather than redefine it.
- **VaultV1 / MetaMorpho** — ERC-4626 vault layered on top of Blue.
- **VaultV2** — successor vault with adapter-based liquidity routing and `forceDeallocate`.
- **bundler3** — the bundler entry point; receives a sequence of adapter actions in one transaction.
- **GeneralAdapter1** — the bundler-side adapter that holds approvals/auth and executes Morpho calls on the user's behalf. Required as the spender for ERC-20 approvals on every bundled path; required as authorized operator on Morpho for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` (the supplier-side path).
- **PublicAllocator V1** — MetaMorpho allocator that moves liquidity from one or more sorted source markets into a target via `reallocateTo(...)`; each call pays one `fee`.
- **BluePublicAllocator V2** — Vault V2 allocator that moves one source market or vault idle liquidity into the enclosing Blue action's target market via `reallocate(...)` or `allocateFromIdle(...)`. The caller supplies the allocator and adapter addresses explicitly because no canonical deployment is registered; each call pays its own `nativePenalty`.

### Bundler actions

The action verbs an integrator sees in the bundle (`BundlerAction.encode...`):

- **`morphoBorrow` / `morphoSupply` / `morphoSupplyCollateral` / `morphoRepay` / `morphoWithdraw`** — Morpho Blue contract calls executed by GeneralAdapter1 on the user's behalf.
- **`setAuthorization`** — Morpho call that grants GeneralAdapter1 the right to call market functions on behalf of the user. Required pre-condition for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` (loan-asset).
- **`setAuthorizationWithSig`** — the offchain-signature equivalent of `setAuthorization`. When the client opts into signatures (`supportSignature: true`), the authorization requirement becomes a signable `Requirement`; the signed `AuthorizationRequirementSignature` is folded into the bundle as a `setAuthorizationWithSig` call (prepended before the Morpho operation), removing the standalone authorization transaction.
- **`erc20TransferFrom`** — pulls user-approved tokens into the bundler.
- **`nativeTransfer` + `wrapNative`** — pair that converts an attached native amount (`tx.value`) into the chain's wNative for a deposit/supply path.
- **`forceDeallocate`** — VaultV2 multicall entry that pulls liquidity out of a specific adapter before withdraw/redeem.
- **`reallocateTo`** — PublicAllocator V1 call that shifts liquidity from sorted source markets into the target market.
- **`bluePublicAllocatorV2Reallocate` / `bluePublicAllocatorV2AllocateFromIdle`** — BluePublicAllocator V2 calls that move one market source or vault idle liquidity into the enclosing Blue action's target market. Both target an explicit allocator address and carry one native penalty.

### Constants and conventions

- **wNative** — the chain's wrapped-native token (e.g. WETH). The only asset/collateral for which native wrapping bundles are valid.
- **WAD** — fixed-point scale `1e18`. Used for rates, slippage tolerances, LTVs.
- **`ORACLE_PRICE_SCALE`** — `1e36`, the scale Morpho uses for `price * collateral / WAD = collateralValueInLoanToken`.
- **LLTV / LLTV buffer** — Liquidation-LTV. The `DEFAULT_LLTV_BUFFER` (0.5%, hardcoded) is subtracted from the market LLTV before validating that a `supplyCollateralBorrow` (or post-withdraw safety check) keeps the position healthy.
- **`minSharePrice` / `maxSharePrice`** — slippage bounds attached to bundled `morphoBorrow` / vault deposits, computed from market or vault state plus the user's slippage tolerance (capped by `MAX_SLIPPAGE_TOLERANCE` = 10%).
- **Permit / Permit2** — signature-based approval flows. Permit covers ERC-2612–compatible tokens (one signature per token); Permit2 (canonical Universal Router pattern) batches and revokes via the Permit2 contract. Both flow through `actions/requirements`.
