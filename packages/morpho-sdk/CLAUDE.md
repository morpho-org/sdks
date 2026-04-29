# Consumer SDK

Morpho Consumer SDK — TypeScript SDK that provides an abstraction layer over the Morpho Protocol.
It simplifies building transactions for **VaultV1** (MetaMorpho), **VaultV2**, and **MarketV1** (Morpho Blue) operations on EVM-compatible chains.

## Intent Layer

This repo uses a layered documentation approach. Before working in any directory:

- `AGENTS.md` mirrors this file for non-Claude agents.
- After significant changes, update `CONVENTIONS.md` if patterns or pitfalls changed.

## Non-Negotiables

- **Validate before done.** After every change: `pnpm lint && pnpm build`. Fix errors before stopping.
- **Never bypass the general adapter for deposits.** It enforces `maxSharePrice` — inflation attack vector otherwise.
- **LLTV buffer on combined market actions.** `supplyCollateralBorrow` validates position health with a buffer (default 0.5%) below LLTV to prevent instant liquidation.
- **Builder = signer.** The viem client used to build a transaction MUST be the client that signs it. `userAddress` MUST equal the connected account address. Enforced by `validateUserAddress` (throws `MissingClientPropertyError` or `AddressMismatchError`). Critical for `repayWithdrawCollateral`, where the bundle mixes explicit `onBehalf = userAddress` (repay) with implicit initiator (`erc20TransferFrom`, `morphoWithdrawCollateral`). Note: this check runs at build time on the builder's own client, so it prevents an honest integrator from *accidentally* emitting the mixed-account bundle — it is **not** a defense against a malicious builder (the signer remains responsible for reviewing what they sign).
- Always validate `chainId` match before any on-chain call between client and params.
- **Immutability.** Every returned `Transaction` object must be `deepFreeze`-d. No exceptions.
- **Strict TypeScript.** Zero `any`. All strict flags enabled. Use `type` imports, `readonly` properties.
- **Do not commit** without explicit user request.
- **Do not modify tests** without understanding what they validate and why.

## Architecture

Strict layering: **Client → Entity → Action**. Never skip a layer.

| Layer        | Location                    | Role                                                                         |
| ------------ | --------------------------- | ---------------------------------------------------------------------------- |
| Client       | `src/client/`               | Wraps viem `Client`, manages options, provides vault/market access           |
| Entity       | `src/entities/vaultV1/`     | VaultV1 (MetaMorpho): fetches on-chain data, delegates to actions            |
| Entity       | `src/entities/vaultV2/`     | VaultV2: fetches on-chain data, delegates to actions                         |
| Entity       | `src/entities/marketV1/`    | MarketV1 (Morpho Blue): fetches market/position data, delegates to actions   |
| Actions      | `src/actions/vaultV1/`      | VaultV1 pure tx builders (deposit, withdraw, redeem)                         |
| Actions      | `src/actions/vaultV2/`      | VaultV2 pure tx builders (deposit, withdraw, redeem, force deallocation ops) |
| Actions      | `src/actions/marketV1/`     | MarketV1 pure tx builders (supplyCollateral, borrow, supplyCollateralBorrow, repay, withdrawCollateral, repayWithdrawCollateral) |
| Requirements | `src/actions/requirements/` | Resolves approval / permit / permit2 needs                                   |
| Types        | `src/types/`                | All type definitions, custom errors. Barrel-exported via `index.ts`          |
| Helpers      | `src/helpers/`              | Utility functions (metadata handling, constants)                             |

VaultV1 (MetaMorpho) operations:

- **deposit** → `vaultV1Deposit()` — routed through bundler3 (never bypass general adapter). Supports optional `nativeAmount` for native token wrapping on wNative vaults.
- **withdraw** → `vaultV1Withdraw()` — direct vault call
- **redeem** → `vaultV1Redeem()` — direct vault call

VaultV2 operations:

- **deposit** → `vaultV2Deposit()` — routed through bundler3 (never bypass general adapter). Supports optional `nativeAmount` for native token wrapping on wNative vaults.
- **withdraw** → `vaultV2Withdraw()` — direct vault call
- **redeem** → `vaultV2Redeem()` — direct vault call
- **forceWithdraw** → `vaultV2ForceWithdraw()` — bundled via multicall on VaultV2 contract (N forceDeallocate + 1 withdraw)
- **forceRedeem** → `vaultV2ForceRedeem()` — bundled via multicall on VaultV2 contract (N forceDeallocate + 1 redeem)

MarketV1 (Morpho Blue) operations:

- **supplyCollateral** → `marketV1SupplyCollateral()` — routed through bundler3 via GeneralAdapter1 (`erc20TransferFrom` + `morphoSupplyCollateral`). Supports optional `nativeAmount` for native token wrapping. `getRequirements` returns collateral token approval for GeneralAdapter1.
- **borrow** → `marketV1Borrow()` — routed through bundler3 via `morphoBorrow`. Requires GeneralAdapter1 authorization on Morpho (`setAuthorization`). `getRequirements` returns authorization tx if needed. Uses `minSharePrice` for slippage protection. LLTV buffer validation prevents instant liquidation. Supports optional **reallocations** for shared liquidity (see below).
- **supplyCollateralBorrow** → `marketV1SupplyCollateralBorrow()` — bundled via bundler3 (collateral transfer + `morphoSupplyCollateral` + `morphoBorrow`). Requires GeneralAdapter1 authorization on Morpho. LLTV buffer validation prevents instant liquidation. Supports `nativeAmount` for collateral wrapping. Supports optional **reallocations** for shared liquidity (see below).
- **repay** → `marketV1Repay()` — routed through bundler3 via GeneralAdapter1 (`erc20TransferFrom` + `morphoRepay`). Two modes: by assets (partial repay) or by shares (full repay, immune to interest accrual). Uses `maxSharePrice` for slippage protection. `getRequirements` returns loan token approval for GeneralAdapter1. Does NOT require Morpho authorization.
- **withdrawCollateral** → `marketV1WithdrawCollateral()` — direct call to `morpho.withdrawCollateral()`. No bundler, no GeneralAdapter1 authorization needed (caller is `msg.sender`). Validates position health after withdrawal (LLTV buffer). No ERC20 approval needed.
- **repayWithdrawCollateral** → `marketV1RepayWithdrawCollateral()` — bundled via bundler3 (`morphoRepay` + `morphoWithdrawCollateral`). Bundle order is critical: repay FIRST to reduce debt, then withdraw. Requires both loan token approval (repay) and Morpho authorization (withdraw). Validates combined position health by simulating repay before checking withdrawal safety.

## Shared Liquidity & Reallocations (PublicAllocator)

When a Morpho Blue market lacks sufficient liquidity for a borrow, liquidity can be **reallocated** from other markets managed by MetaMorpho Vaults via the **PublicAllocator** contract.

**Concept:** A `VaultReallocation` maps 1:1 to a `PublicAllocator.reallocateTo()` call. It withdraws loan tokens from one or more _source markets_ within a vault and supplies them to the _target market_ — all atomically within the same bundler transaction.

**Flow:**

1. Caller provides an optional `reallocations: VaultReallocation[]` parameter to `borrow` or `supplyCollateralBorrow`.
2. Each reallocation is validated (`validateReallocations`) and encoded as a `reallocateTo` bundler action.
3. These actions are prepended (borrow) or inserted between supply-collateral and borrow (supplyCollateralBorrow) in the bundle.
4. Reallocation fees (native token per vault) are summed and set as `tx.value`.
5. The `morphoBorrow` action executes against the now-liquid target market.

**Key types:** `VaultReallocation`, `ReallocationWithdrawal` (in `src/types/sharedLiquidity.ts`).
**Validation errors:** `NegativeReallocationFeeError`, `EmptyReallocationWithdrawalsError`, `NonPositiveReallocationAmountError`.

## Code Standards

- Biome: double quotes, 2-space indent, no unused imports/variables
- All actions extend `BaseAction<TType, TArgs>` — discriminated union on `type`
- New error cases require a dedicated class in `src/types/error.ts`
- All public API re-exported through barrel `index.ts` files
- JSDoc on every exported function and interface
- Read existing code before modifying — follow neighboring patterns
