# Actions Layer

> Full context: [AGENTS.md](../../AGENTS.md)

Pure functions that build deep-frozen `Transaction<TAction>` objects. No side effects, no state.

## Sub-Layers

| Sub-layer | Path | Role | Docs |
|-----------|------|------|------|
| **VaultV1 Operations** | `vaultV1/` | Build VaultV1 (MetaMorpho) deposit / withdraw / redeem transactions | [`vaultV1/AGENTS.md`](vaultV1/AGENTS.md) |
| **VaultV2 Operations** | `vaultV2/` | Build VaultV2 deposit / withdraw / redeem / forceWithdraw / forceRedeem transactions | [`vaultV2/AGENTS.md`](vaultV2/AGENTS.md) |
| **MarketV1 Operations** | `marketV1/` | Build MarketV1 (Morpho Blue) supplyCollateral / borrow / supplyCollateralBorrow transactions. Supports shared liquidity via reallocations. | [`marketV1/AGENTS.md`](marketV1/AGENTS.md) |
| **Requirements** | `requirements/` | Resolve token approval needs before a deposit or supply collateral | [`requirements/AGENTS.md`](requirements/AGENTS.md) |

## Data Flow

```
Entity (MorphoVaultV1)                          Entity (MorphoVaultV2)
  │                                               │
  ├─ deposit ──► vaultV1Deposit()  ← bundler (+ native wrap)  ├─ deposit ──────────► vaultV2Deposit()  ← bundler (+ native wrap)
  ├─ withdraw ─► vaultV1Withdraw() ← direct       ├─ withdraw ─────────► vaultV2Withdraw()          ← direct
  └─ redeem ──► vaultV1Redeem()   ← direct        ├─ redeem ───────────► vaultV2Redeem()            ← direct
                                                   ├─ forceWithdraw ────► vaultV2ForceWithdraw()      ← multicall
                                                   └─ forceRedeem ──────► vaultV2ForceRedeem()        ← multicall

Entity (MorphoMarketV1)
  │
  ├─ supplyCollateral ──────► marketV1SupplyCollateral()       ← bundler (general adapter)
  ├─ borrow ────────────────► marketV1Borrow()                 ← bundler (general adapter)
  └─ supplyCollateralBorrow ► marketV1SupplyCollateralBorrow() ← bundler (general adapter)
                    │
                    ▼
         Readonly<Transaction<TAction>>  (deep-frozen)
```

## Shared Liquidity (Reallocations)

`marketV1Borrow` and `marketV1SupplyCollateralBorrow` accept optional `reallocations: VaultReallocation[]`. Each reallocation becomes a `reallocateTo` bundler action placed before `morphoBorrow`. Fees accumulate in `tx.value`. Validated via `validateReallocations()`.

## Key Constraints

- Every returned object **must** be `deepFreeze`-d — immutability is non-negotiable.
- Validate all inputs (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`) and throw dedicated errors from `src/types/error.ts`.
- For deposits with `nativeAmount`: validate vault asset is `wNative`, prepend `nativeTransfer` + `wrapNative` bundler actions, set `tx.value`.
- Append metadata via `addTransactionMetadata` only when `metadata` param is provided.
- **Never bypass the general adapter for deposits** — it enforces `maxSharePrice` (inflation attack prevention).
- All actions extend `BaseAction<TType, TArgs>` (discriminated union on `type`).

## Exports

Barrel `index.ts` re-exports all sub-layers:

```typescript
export * from "./requirements";
export * from "./vaultV1";
export * from "./vaultV2";
export * from "./marketV1";
```
