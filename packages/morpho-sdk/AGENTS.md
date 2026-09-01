# `packages/morpho-sdk/`

Transaction builders for VaultV1, VaultV2, Blue, and Midnight, plus shared requirement helpers used by protocol flows. Subfolders carry the layer-scoped detail; this file is the package overview + glossary.

> Architecture / type / test / doc / release rules apply per the [root `AGENTS.md`](../../AGENTS.md). Subfolder rules: see each `src/<layer>/AGENTS.md`.

> **Dependency facade:** apply root §4 on every `blue-sdk`, `blue-sdk-viem`, or `midnight-sdk` surface change. Raw upstream names live under `/blue/{abis,addresses,constants,entities,errors,fetch,types,utils}` and `/midnight/{abis,constants,entities,errors,fetch,types,utils}`; Midnight has no address surface. The corresponding unprefixed facade qualifies protocol-specific names with `Blue` or `Midnight`, keeps shared infrastructure unqualified, and preserves old ambiguous names only as deprecated compatibility exports. Extend these categories only where an equivalent facade already exists; do not add parity-only upstream internals.

## Routing summary

- **VaultV1 / VaultV2 deposits** route through bundler3 via GeneralAdapter1 (which enforces `maxSharePrice`, protecting against inflation attacks). VaultV1/V2 `withdraw` and `redeem` are direct vault calls. VaultV2 `forceWithdraw` / `forceRedeem` use `multicall` with `forceDeallocate` calls before the final withdraw/redeem. VaultV1/V2 `inKindRedeem` handles validate their supplied snapshots eagerly and call the standalone VaultExitBundlesV1 periphery directly. Their optional RPC-backed pre-flight checks run only when the caller awaits `getRequirements()`; the pure actions and `buildTx()` remain synchronous and can encode without those reads.
- **Blue writes** stay on `client.morpho.blue(marketParams, chainId)` and preserve the established
  high-level methods: `supply`, `withdraw`, `supplyCollateral`, `borrow`,
  `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, and
  `refinance`. They map to the five registered `BlueBundlesV1` entrypoints directly; there is no
  `client.morpho.blueBundlesV1(...)`, route flag, Bundler3 fallback, or GeneralAdapter1 hop. Token
  approvals, ERC-2612 permits, Permit2 signature transfers, and Morpho authorization therefore
  target BlueBundlesV1 (the ERC-20 prerequisite for Permit2 still targets canonical Permit2). Blue
  write calls accept no share-price bounds or `slippageTolerance` input. Optional write
  reallocations are Vault V2 BluePublicAllocator calls only. All Vault V1 reallocation planning,
  data, input, validation, and explicit low-level Bundler3-composition surfaces remain available
  only as deprecated compatibility surfaces and will be removed in the next major; their outputs
  are not accepted by the high-level write methods.
- **Midnight paths** expose lazy action outputs under `client.morpho.midnight(chainId)`. Fixed-rate market taker flows route through Midnight Bundles, direct collateral supply/cancel/redeem route through Midnight, and maker flows return ratify-root requirements plus the mempool payload transaction. Requirement helpers under `src/actions/requirements/midnight` resolve Midnight authorization, Setter ratify-root, and token-pull requirements.
- **Bundle composition, native wrapping, and reallocation rules** are canonical in [`src/actions/AGENTS.md`](./src/actions/AGENTS.md).

## Tests

Per root §5, unit tests are colocated as `src/**/*.test.ts`. Fork and integration tests are named `*.integration.test.ts` and live under `packages/morpho-sdk/test/`; test-only helper units stay beside their helper there. Use parameterized fixtures (`randomMarket(...)`); never weaken assertions to make a test pass.

## Glossary

Protocol terms used across this package's docs and JSDoc:

### Contracts and adapters

- **Blue / Morpho Blue** — Morpho's immutable, **variable-rate** lending primitive (formerly called "MarketV1" in this SDK). Each market is an isolated pair whose borrow rate floats with utilization, driven by the market's IRM. A market is identified by `MarketParams { loanToken, collateralToken, oracle, irm, lltv }`. Exposed via `client.morpho.blue(marketParams, chainId) → MorphoBlue`. This is the canonical definition of "Blue" for the whole package; other docs link here rather than redefine it.
- **VaultV1 / MetaMorpho** — ERC-4626 vault layered on top of Blue.
- **VaultV2** — successor vault with adapter-based liquidity routing and `forceDeallocate`.
- **bundler3** — the bundler entry point; receives a sequence of adapter actions in one transaction.
- **GeneralAdapter1** — the bundler-side adapter that holds approvals and executes composed calls.
  Vault deposits and public low-level Bundler3 primitives use it; the high-level Blue write
  methods do not.
- **BlueBundlesV1** — the protocol-owned periphery called directly by the high-level Blue
  write methods. It owns operation ordering, token pulls, optional native wrapping, Morpho
  authorization consumption, referral fees, refunds, and BluePublicAllocator execution.
- **PublicAllocator V1** — MetaMorpho allocator that moves liquidity from one or more sorted source markets into a target via `reallocateTo(...)`; each call pays one `fee`. Its data and low-level helpers remain public, but v6 high-level Blue writes do not accept V1 reallocations.
- **BluePublicAllocator** — the single canonical Vault V2 allocator registered per chain, which moves one source market or vault idle liquidity into the enclosing Blue action's target market via `reallocate(...)` or `allocateFromIdle(...)`. The caller supplies adapter addresses; the SDK resolves the allocator from the chain registry. Each call passes the vault's configured WAD-scaled `uint64 penalty`; BlueBundlesV1 funds and executes these calls as part of the direct write. Its canonical ABI export is `vaultV2BluePublicAllocatorAbi`.
- **VaultExitBundlesV1** — standalone periphery for exiting an illiquid VaultV1 or single-adapter VaultV2 into idle underlying assets and/or Morpho Blue supply positions.
- **Shared-liquidity migration** — every PublicAllocator V1 planning, data, input, validation, and
  Bundler3-composition symbol is deprecated and will be removed in the next major. The successor is
  `MorphoBlue.getVaultV2BlueReallocationData` plus
  `VaultV2BlueReallocationData.computeVaultV2BlueReallocations`, which return flat, action-ready
  `VaultV2BlueReallocation` calls and their simulated state. Raw protocol ABI, address, fetch, and
  config exports are not part of this SDK-algorithm deprecation.

### Bundler actions

The action verbs available to vault flows and advanced low-level Bundler3 composition
(`BundlerAction.encode...`). They are not the route used by the high-level Blue writes:

- **`morphoBorrow` / `morphoSupply` / `morphoSupplyCollateral` / `morphoRepay` / `morphoWithdraw`** — Morpho Blue contract calls executed by GeneralAdapter1 on the user's behalf.
- **`setAuthorization`** — Morpho call that grants an operator the right to call market functions
  on behalf of the user. High-level Blue requirements authorize BlueBundlesV1; advanced Bundler3
  compositions may authorize GeneralAdapter1.
- **`setAuthorizationWithSig`** — the offchain-signature equivalent of `setAuthorization`. When
  the client opts into signatures (`supportSignature: true`), the authorization requirement
  becomes a signable `Requirement`; the destination action consumes the signed authorization.
- **`erc20TransferFrom`** — pulls user-approved tokens into the bundler.
- **`nativeTransfer` + `wrapNative`** — pair that converts an attached native amount (`tx.value`) into the chain's wNative for a deposit/supply path.
- **`forceDeallocate`** — VaultV2 multicall entry that pulls liquidity out of a specific adapter before withdraw/redeem.
- **`reallocateTo`** — deprecated PublicAllocator V1 call that shifts liquidity from sorted
  source markets into the target market; it will be removed from the SDK in the next major.
- **`vaultV2BluePublicAllocatorReallocate` / `vaultV2BluePublicAllocatorAllocateFromIdle`** — low-level Bundler3 actions that move one market source or vault idle liquidity into a target market. Both target the chain's registered allocator, approve the exact loan-token penalty from Bundler3, and carry the configured penalty rate in calldata. The direct BlueBundlesV1 route instead carries equivalent allocator inputs in its fixed call.

### Constants and conventions

- **wNative** — the chain's wrapped-native token (e.g. WETH). The only asset/collateral for which native wrapping bundles are valid.
- **WAD** — fixed-point scale `1e18`. Used for rates, slippage tolerances, LTVs.
- **`ORACLE_PRICE_SCALE`** — `1e36`, the scale Morpho uses for `price * collateral / WAD = collateralValueInLoanToken`.
- **LLTV / LLTV buffer** — Liquidation-LTV. The `DEFAULT_LLTV_BUFFER` (0.5%, hardcoded) is subtracted from the market LLTV before validating a borrow, collateral withdrawal, or migration leg on the combined BlueBundlesV1 methods. Pure collateral supply and pure repay disable the onchain LTV cap so they can improve an unhealthy position.
- **`minSharePrice` / `maxSharePrice`** — slippage bounds used by vault deposits and low-level Bundler3 primitives. The high-level Blue write methods do not accept share-price bounds or `slippageTolerance` because BlueBundlesV1 cannot enforce them.
- **Permit / Permit2** — signature-based token-pull flows. ERC-2612 permits name the contract that pulls the token. BlueBundlesV1 uses Permit2 SignatureTransfer: the ERC-20 allowance targets canonical Permit2, while the signed transfer names BlueBundlesV1 as spender. Both flow through `actions/requirements`.
