# Architecture

This document explains the design decisions, protocol context, and internal structure of the Morpho Consumer SDK.

## Purpose and Philosophy

The Consumer SDK is a TypeScript abstraction layer over the Morpho Protocol. Its job is to
build **ready-to-send transactions**
operations on EVM-compatible chains for Morpho protocol.

**Design principles:**

- **Deterministic transaction building.** Given the same inputs and on-chain state, the SDK
  always produces the same `Transaction` object. No simulation, no gas estimation, no
  sending — the consumer handles those concerns.
- **Predictable developer experience.** Every operation returns a `{ buildTx, getRequirements }`
  pair (for deposits) or `{ buildTx }` (for withdrawals/redeems). The interface is identical
  across V1 and V2 vaults.
- **Immutability.** Every returned `Transaction` is deep-frozen via `@morpho-org/morpho-ts`'s
  `deepFreeze`. Once built, a transaction object cannot be mutated.
- **No `any`.** Strict TypeScript throughout, with discriminated unions for action types and
  dedicated error classes for every failure mode.

The SDK intentionally does **not** simulate or execute transactions. It produces the calldata;
the consuming application decides when and how to send it.

## Layered Architecture

```
┌─────────────────────────────────────────────────┐
│                   Consumer App                  │
└────────────────────────┬────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │    MorphoClient     │  ← Client layer
              │  (wraps viem Client,│
              │   holds options)    │
              └───┬────────┬────┬───┘
                  │        │    │
        .vaultV1()│        │    │.marketV1()
                  │        │    │
        ┌─────────▼──┐     │   ┌▼──────────────┐
        │MorphoVaultV1│    │   │MorphoMarketV1 │  ← Entity layer
        │(MetaMorpho) │    │   │(Morpho Blue)  │
        └──────┬──────┘    │   └──────┬────────┘
               │           │          │
               │ .vaultV2()│          │  delegates
               │           │          │
               │   ┌───────▼────┐     │
               │   │MorphoVaultV2│    │
               │   └──────┬─────┘     │
               │          │           │
               │delegates │  delegates│
               │          │           │
        ┌──────▼───────── ▼───────────▼──┐
        │         Action functions       │  ← Action layer
        │  (pure tx builders, no state)  │
        └────────────────────────────────┘
```

### Why this layering exists

Each layer has a single responsibility and a strict boundary:

| Layer      | Responsibility                                                                                                                                  | What it must NOT do                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Client** | Wrap a viem `Client`, normalize SDK options (`supportSignature`, `metadata`, `supportDeployless`), produce vault/market entities                | Call actions directly, hold mutable state     |
| **Entity** | Fetch on-chain data (vault accrual data for V1/V2, market/position data for MarketV1), compute derived values (e.g. `maxSharePrice`, LLTV buffer), delegate to actions | Encode calldata, know about bundler internals |
| **Action** | Validate inputs, encode calldata, deep-freeze the result, return a `Transaction<TAction>`                                                       | Fetch data, hold state, mutate anything       |

**Calls flow strictly downward**: Client → Entity → Action. An action never calls an entity;
an entity never instantiates a client.

## VaultV1 vs VaultV2: Technical Differences

Both vault versions are ERC-4626 compliant and share the same deposit/withdraw/redeem interface
at the SDK level. The differences are at the protocol layer:

### VaultV1 (MetaMorpho)

- **Market allocation**: A curator-managed set of Morpho Blue markets. The vault allocates
  deposits across these markets according to a supply queue.
- **Roles**: Owner, guardian, curator, allocator. The curator manages market lists and caps;
  allocators can reallocate between markets.
- **Fee structure**: A single performance fee set by the owner, applied to interest earned.
- **Withdrawal**: Users withdraw from a withdraw queue of markets. If a market is illiquid,
  the withdrawal may be partial — there is no mechanism to force liquidity out.
- **Contract**: Uses `metaMorphoAbi` from `@morpho-org/blue-sdk-viem`.
- **SDK data**: Fetched via `fetchVault` / `fetchAccrualVault`.

### VaultV2

- **Adapter-based allocation**: Instead of directly allocated markets, V2 uses an
  **adapter system**. Each adapter is a contract that interfaces with a specific yield source
  (Morpho Blue markets, other V1 vaults, etc.). The vault allocates to adapters, not directly
  to markets.
- **Roles**: Expanded role system with more granular permissions.
- **Fee structure**: More flexible fee configuration.
- **Gate system**: V2 can gate deposits and withdrawals behind configurable conditions.
- **Force deallocation**: The key V2 innovation for the SDK. When liquidity is locked in
  adapters, any user can call `forceDeallocate` to pull assets back into the vault's idle
  balance — at the cost of a penalty (share burn). This enables withdrawals even when the
  vault's idle liquidity is insufficient.
- **Native multicall**: V2 contracts expose a `multicall` function, allowing multiple
  operations (N `forceDeallocate` + 1 `withdraw`/`redeem`) to execute atomically in a single
  transaction.
- **Contract**: Uses `vaultV2Abi` from `@morpho-org/blue-sdk-viem`.
- **SDK data**: Fetched via `fetchVaultV2` / `fetchAccrualVaultV2`.

### MarketV1 (Morpho Blue)

- **Market-based lending**: MarketV1 represents Morpho Blue isolated lending markets. Each market
  has a loan token, collateral token, oracle, IRM, and LLTV (liquidation loan-to-value).
- **Supply collateral**: Users deposit collateral tokens into a market position. Routed through
  bundler3 via GeneralAdapter1 (`erc20TransferFrom` + `morphoSupplyCollateral`). Supports native
  token wrapping when collateral is wNative.
- **Borrow**: Users borrow loan tokens against their collateral. Routed through bundler3 via
  `morphoBorrow`. Requires GeneralAdapter1 authorization on Morpho (`setAuthorization`). Uses
  `minSharePrice` for slippage protection.
- **Supply collateral + borrow (atomic)**: Atomic bundler operation combining collateral transfer,
  `morphoSupplyCollateral`, and `morphoBorrow` in a single transaction. Validates position health
  with an LLTV buffer (default 0.5%) to prevent instant liquidation.
- **LLTV buffer**: Both `borrow` and `supplyCollateralBorrow` validate that the resulting position
  stays below `LLTV - buffer` (default 0.5%). Throws `BorrowExceedsSafeLtvError` if exceeded.
- **SDK data**: Fetched via `fetchMarket` / `fetchAccrualPosition`. `AccrualPosition` provides
  health metrics: `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`.


### Force Deallocation (V2 only)

Force deallocation solves the liquidity problem: when vault assets are
locked in adapters (e.g. lent in a Morpho Blue market with no available liquidity), a user can
force the vault to pull assets back to vault level and withdraw/redeem after.

## Bundled vs Direct Calls

This is the most important routing decision in the SDK.

### Deposits: Always through the Morpho Bundler

All deposits — both V1 and V2 — are routed through the **Morpho Bundler** (specifically, its
**general adapter**). The bundle atomically:

1. _(If `nativeAmount` is provided)_ Transfers native token to the general adapter via `nativeTransfer`, then wraps it to wNative via `wrapNative`.
2. _(If `amount` is provided)_ Transfers the user's ERC-20 tokens to the general adapter (via `erc20TransferFrom`, permit,
   or permit2).
3. Calls `erc4626Deposit` on the vault with a `maxSharePrice` parameter, using `totalAssets = amount + nativeAmount`.

**Why the bundler is mandatory for deposits:** The `maxSharePrice` check inside the general
adapter prevents **ERC-4626 inflation attacks**. In this attack, a malicious actor manipulates
the share price between the user's approval and the deposit transaction. The general adapter
enforces the price check atomically in the same transaction as the token transfer, closing this
vector. Vaults without "dead deposit protection" are especially vulnerable.
This also makes the UX simpler, since users only need to approve the general adapter instead of approving each vault individually.

**Native token wrapping:** For vaults whose underlying asset is wNative, deposits accept an optional `nativeAmount` parameter. When provided, the bundler first transfers native token (`nativeTransfer`) to the general adapter, then wraps it (`wrapNative`) before depositing. The transaction's `value` field is set to `nativeAmount`. Users can combine ERC-20 `amount` and `nativeAmount` in a single deposit. Validation ensures the vault asset is the chain's wrapped native token (`wNative`), and throws `NativeAmountOnNonWNativeVaultError` otherwise.

**Security invariant:** Never bypass the general adapter for deposits.

The bundle is encoded via `BundlerAction.encodeBundle(chainId, actions)` from
`@morpho-org/bundler-sdk-viem`. The `to` address of the resulting transaction is always the
Bundler3 contract address for the target chain.

### Withdrawals and Redeems: Direct vault calls

Withdraw and redeem operations are **direct calls** to the vault contract. No bundler, no
general adapter. The user calls `withdraw(assets, recipient, onBehalf)` or
`redeem(shares, recipient, onBehalf)` directly on the vault.

**Why no bundler?** Withdrawals burn the user's shares in exchange for assets. There is no token transfer from the user to the vault, so there is no inflation attack surface. Direct calls avoid the overhead and approval complexity of the bundler.

### Force Withdrawals and Force Redeems (V2 only): VaultV2 multicall

Force operations use the VaultV2 contract's native `multicall` — not the bundler. The multicall
bundles N `forceDeallocate` calls + 1 `withdraw`/`redeem` into a single atomic transaction
on the vault contract itself.

### Summary

| Operation                             | Route                      | Why                                                                                                        |
| ------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Deposit (V1 & V2)                     | Bundler3 (general adapter) | `maxSharePrice` enforcement prevents inflation attacks. Optional native token wrapping for wNative vaults. |
| Withdraw (V1 & V2)                    | Direct vault call          | No attack surface, no approval needed                                                                      |
| Redeem (V1 & V2)                      | Direct vault call          | No attack surface, no approval needed                                                                      |
| Force Withdraw (V2)                   | VaultV2 `multicall`        | Atomic deallocation + withdrawal on the vault contract                                                     |
| Force Redeem (V2)                     | VaultV2 `multicall`        | Atomic deallocation + redemption on the vault contract                                                     |
| Supply Collateral (MarketV1)          | Bundler3 (general adapter) | `erc20TransferFrom` + `morphoSupplyCollateral`. Optional native wrapping for wNative collateral.           |
| Borrow (MarketV1)                     | Bundler3 (general adapter) | `morphoBorrow` with `minSharePrice` slippage protection. Requires GA1 authorization on Morpho.             |
| Supply Collateral + Borrow (MarketV1) | Bundler3 (general adapter) | Atomic collateral supply + borrow. LLTV buffer prevents instant liquidation.                               |

## Dependency Map

The SDK builds on the Morpho TypeScript ecosystem. Each dependency has a specific role:

```
morpho-sdk
├── @morpho-org/blue-sdk           Core protocol constants and math
├── @morpho-org/blue-sdk-viem      On-chain data fetching and ABIs
├── @morpho-org/bundler-sdk-viem   Bundle encoding for deposits
├── @morpho-org/morpho-ts          Shared utilities (deepFreeze, Time)
├── @morpho-org/simulation-sdk     Token approval constants
└── viem                           Ethereum client and ABI encoding
```

### `@morpho-org/blue-sdk`

Provides protocol-level constants and math:

- **`getChainAddresses(chainId)`** — resolves contract addresses for the target chain:
  `bundler3.generalAdapter1`, `permit2`, `dai`, and others.
- **`MathLib`** — fixed-point arithmetic (`mulDivUp`, `wToRay`, `min`, `WAD`, `RAY`).
- **`DEFAULT_SLIPPAGE_TOLERANCE`** — the default 0.03% slippage used for deposit `maxSharePrice`.
- **`MarketParams`** and **`marketParamsAbi`** — used when encoding force-deallocation data
  for Morpho Market V1 adapters.

### `@morpho-org/blue-sdk-viem`

On-chain data fetching and contract ABIs:

- **ABIs**: `metaMorphoAbi` (V1), `vaultV2Abi` (V2) — used for calldata encoding in actions.
- **Fetchers**: `fetchVault`, `fetchAccrualVault` (V1), `fetchVaultV2`, `fetchAccrualVaultV2`
  (V2) — read vault state from the blockchain.
- **`fetchHolding`** — reads a user's token allowances, EIP-2612 nonce, and Permit2 state.
  Used by the requirements system to determine what approvals are needed.
- **`fetchToken`** — token metadata lookups.
- **Typed data helpers**: `getPermitTypedData`, `getPermit2PermitTypedData` — used to build
  EIP-712 signing payloads for permit flows.

### `@morpho-org/bundler-sdk-viem`

Deposit bundle encoding:

- **`BundlerAction.encodeBundle(chainId, actions)`** — takes an array of bundler `Action`
  objects (e.g. `erc20TransferFrom`, `erc4626Deposit`, `permit`, `approve2`, `transferFrom2`)
  and encodes them into a single calldata blob targeting the Bundler3 contract.
- **`Action` type** — the typed action union used inside bundles.

### `@morpho-org/morpho-ts`

Shared utilities:

- **`deepFreeze`** — recursively freezes objects. Applied to every returned `Transaction`.
- **`Time`** — timestamp helpers used for permit deadlines and metadata timestamps.
- **`isDefined`** — type-narrowing utility used in the requirements decision tree.

### `@morpho-org/simulation-sdk`

Token approval constants:

- **`MAX_TOKEN_APPROVALS`** — per-chain/token cap for approval amounts in `encodeErc20Approval`.
- **`APPROVE_ONLY_ONCE_TOKENS`** — tokens (like USDT) that require resetting allowance to zero
  before setting a new value. Used in `getRequirementsApproval` to prepend a reset transaction.

## Requirements System

Before a deposit or supply collateral, the user must grant the **general adapter** permission to spend their
ERC-20 tokens. The requirements system resolves what approvals or signatures are needed.

### Why requirements target the general adapter, not the vault

Deposits always flow: **user → general adapter → vault**. The general adapter is the contract
that calls `transferFrom` on the user's tokens, then calls `erc4626Deposit` on the vault.
Therefore, the **spender** in any approval/permit is always `bundler3.generalAdapter1` for the
target chain — the vault address only determines which contract receives the deposit inside the
bundle.

### Decision tree

```
getRequirements(viemClient, params)
│
├─ supportSignature: false (default)
│    └─► getRequirementsApproval()
│         Spender: generalAdapter1
│         Returns: Transaction<ERC20ApprovalAction>[]
│         • Checks current allowance — skips if sufficient.
│         • For APPROVE_ONLY_ONCE_TOKENS (e.g. USDT): prepends
│           a reset-to-zero approval before the actual approval.
│
└─ supportSignature: true
     │
     ├─ Token supports EIP-2612 AND useSimplePermit: true
     │    └─► getRequirementsPermit()
     │         Returns: Requirement[] with sign() → PermitAction
     │         • Checks generalAdapter1 allowance — skips if sufficient.
     │         • Produces a signable permit for the generalAdapter1 spender.
     │
     ├─ Permit2 contract exists on this chain
     │    └─► getRequirementsPermit2()
     │         Returns: (Transaction | Requirement)[]
     │         Two-step:
     │         1. ERC20 → Permit2: classic approve() if needed (infinite).
     │         2. Permit2 → generalAdapter1: signature if needed or expiring.
     │
     └─ Fallback
          └─► getRequirementsApproval() (same as supportSignature: false)
```

### How signatures flow into deposits

When requirements return a `Requirement` object (permit or permit2 path), the consuming
application calls `requirement.sign(client, userAddress)` to obtain a `RequirementSignature`.
This signature is then passed to `buildTx(requirementSignature)`:

```
getRequirements() → Requirement { sign() } → RequirementSignature → buildTx(sig)
```

Inside `buildTx`, `getRequirementsAction()` converts the signature into bundler actions:

- **Permit path**: `permit` action + `erc20TransferFrom` to generalAdapter1.
- **Permit2 path**: `approve2` action + `transferFrom2` to generalAdapter1.

These actions are prepended to the `erc4626Deposit` action in the bundle. The entire sequence
executes atomically in a single transaction.

When no signature is provided (classic approval path), `buildTx()` uses a simple
`erc20TransferFrom` action to move tokens from the user to the general adapter before the
deposit.

### Guard functions

Two type guards distinguish requirement types in application code:

- `isRequirementApproval(r)` — true when `r` is a `Transaction<ERC20ApprovalAction>` (send as tx).
- `isRequirementSignature(r)` — true when `r` is a `Requirement` (needs signing first).
