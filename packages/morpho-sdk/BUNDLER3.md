# Bundler3 & GeneralAdapter1

This document describes how **Bundler3** and **GeneralAdapter1** are used in the Morpho SDK, the flows that rely on them, and the security guarantees and limits of this routing.

## What is Bundler3?

Bundler3 is a _multicall_ contract specific to the Morpho ecosystem. It takes as input a **list of typed actions** (ERC20 transfers, permit, permit2, native wrapping, ERC-4626 deposits, Morpho Blue calls, reallocations…) and executes them **atomically in a single transaction**.

Instead of exposing the user directly to target contracts (ERC-4626 vault, Morpho Blue, PublicAllocator, WETH…), the SDK encodes a bundle via [`BundlerAction.encodeBundle(chainId, actions)`](src/actions/vaultV1/deposit.ts#L146) from `@morpho-org/bundler-sdk-viem`. The `to` of the resulting transaction is **always** the Bundler3 address for the target chain.

### GeneralAdapter1: the trusted adapter

`GeneralAdapter1` (resolved via [`getChainAddresses(chainId).bundler3.generalAdapter1`](src/actions/vaultV1/deposit.ts#L82-L84)) is the **"generic" adapter** called by Bundler3. It is the contract that:

- receives the user's ERC20 tokens (`erc20TransferFrom`, `permit`, `approve2` / `transferFrom2`),
- wraps native into wNative (`nativeTransfer` + `wrapNative`),
- calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)` enforcing `maxSharePrice` **on-chain**,
- executes `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral` on Morpho Blue,
- forwards `reallocateTo` calls to the `PublicAllocator` for shared liquidity.

The **spender** of every approval / permit / permit2 is therefore **always** `generalAdapter1`, never the vault or Morpho directly. See [src/actions/requirements/getRequirements.ts](src/actions/requirements/getRequirements.ts) and the "Requirements System" section of [ARCHITECTURE.md](ARCHITECTURE.md#requirements-system).

## Composability & modularity

The value of the Bundler3 + GeneralAdapter1 pairing rests on three properties:

1. **Composition of elementary actions.** Each step (`nativeTransfer`, `wrapNative`, `erc20TransferFrom`, `permit`, `approve2`, `transferFrom2`, `erc4626Deposit`, `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral`, `reallocateTo`) is an independent building block. The SDK **composes** them in an explicit order to build a business flow.
2. **Atomicity.** The entire bundle either succeeds or reverts as one. No intermediate state is exposed to MEV bots or other transactions.
3. **Simplified approval UX.** A user approves _a single spender_ (GeneralAdapter1) for the entire protocol surface — rather than one approval per V1/V2 vault or per Morpho contract.

Concretely, `marketV1SupplyCollateralBorrow` is not a new contract: it is simply the composition `erc20TransferFrom` + `morphoSupplyCollateral` + `morphoBorrow` inside a single bundle. Same story for `repayWithdrawCollateral`, or for a borrow that must first trigger `reallocateTo` calls through the PublicAllocator. The business logic lives in the **order and selection of actions**, not in a dedicated contract.

## Flows overview

| Operation                               | Route                        | Bundler actions (order)                                                                                                  |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| VaultV1 `deposit`                       | Bundler3 → GeneralAdapter1   | _(opt)_ `nativeTransfer` + `wrapNative` → `erc20TransferFrom` / `permit` / `approve2`+`transferFrom2` → `erc4626Deposit` |
| VaultV2 `deposit`                       | Bundler3 → GeneralAdapter1   | same as VaultV1                                                                                                          |
| MarketV1 `supplyCollateral`             | Bundler3 → GeneralAdapter1   | _(opt)_ `nativeTransfer` + `wrapNative` → `erc20TransferFrom` → `morphoSupplyCollateral`                                 |
| MarketV1 `borrow`                       | Bundler3 → GeneralAdapter1   | _(opt)_ `reallocateTo`×N → `morphoBorrow` _(requires `setAuthorization` for GA1 on Morpho)_                              |
| MarketV1 `supplyCollateralBorrow`       | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoSupplyCollateral` → _(opt)_ `reallocateTo`×N → `morphoBorrow`                               |
| MarketV1 `repay`                        | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoRepay` (by `assets` or by `shares`)                                                         |
| MarketV1 `repayWithdrawCollateral`      | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoRepay` → `morphoWithdrawCollateral` _(repay **before** withdraw, order is critical)_        |
| VaultV1 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| VaultV2 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| MarketV1 `withdrawCollateral`           | **Direct Morpho Blue call**  | _(no bundler, no GA1 auth required — `msg.sender` = `onBehalf`)_                                                         |
| VaultV2 `forceWithdraw` / `forceRedeem` | VaultV2 `multicall` (native) | `forceDeallocate`×N + `withdraw` / `redeem` — **on the vault contract itself**, not through Bundler3                     |

## Strengths

### 1. Inflation-attack protection (`maxSharePrice`)

For every ERC-4626 deposit (VaultV1 / VaultV2), GeneralAdapter1 calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)`. The `maxSharePrice` parameter is verified **on-chain, in the same transaction as the token transfer** — closing the _ERC-4626 inflation_ attack window (share-price manipulation between approval and deposit). Vaults without _dead-deposit protection_ are especially exposed to this vector; the bundler is the defense.

> **Security invariant:** never bypass the general adapter for a deposit.

### 2. LLTV-buffer protection on debt operations

`borrow` and `supplyCollateralBorrow` validate SDK-side that the resulting position stays below `LLTV − buffer` (default 0.5%); otherwise `BorrowExceedsSafeLtvError` is thrown. This prevents the creation of an immediately liquidatable position.

### 3. Symmetric ERC-4626 slippage

- **Borrow**: `minSharePrice` (protects against a collapsing share price).
- **Repay**: `maxSharePrice` (protects against a share price that spikes between signature and execution).
- The _repay by shares_ mode is additionally immune to interest accrual — useful for cleanly closing a position.

### 4. Shared liquidity without an ad-hoc contract

`VaultReallocation`s are encoded as plain `reallocateTo` bundler actions (PublicAllocator). They are **prepended to the bundle** (borrow) or **inserted between supply-collateral and borrow** (`supplyCollateralBorrow`), and native fees are aggregated into `tx.value`. No extra off-chain machinery: everything flows through the same bundler-action composition.

### 5. A single approval surface

Whether it's a V1 deposit, a V2 deposit, a `supplyCollateral`, a `repay`, or a `supplyCollateralBorrow`: the spender is **always** `generalAdapter1`. A user who has already approved GA1 for a given token transparently reuses that approval. The approval / permit / permit2 decision is centralized in [`getRequirements`](src/actions/requirements/getRequirements.ts).

## Dangers & limits

### Withdraw / redeem do NOT go through Bundler3

This is the main design caveat. For the following operations the SDK emits a **direct call to the target contract** (the vault):

| Operation                           | Direct target    |
| ----------------------------------- | ---------------- |
| `vaultV1Withdraw` / `vaultV1Redeem` | MetaMorpho vault |
| `vaultV2Withdraw` / `vaultV2Redeem` | VaultV2          |
| `marketV1WithdrawCollateral`        | Morpho Blue      |

**Consequences:**

- **No on-chain share-price check.** There is no equivalent of `maxSharePrice` / `minSharePrice` passed to the ERC-4626. A share price manipulated between transaction construction and inclusion can adversely impact the number of assets received (withdraw by shares) or shares burned (withdraw by assets), **without the transaction reverting**.
- **No automatic LLTV guard** on the adapter side. `marketV1WithdrawCollateral` validates position health SDK-side (LLTV buffer) _before_ building the tx, but that check is _off-chain_ — if on-chain state moves between simulation and inclusion (oracle price, interest, other borrows), nothing stops the transaction. It is up to the caller to ensure data freshness.
- **No cross-action atomicity.** A `withdraw` cannot be composed with another call inside the same bundle using the standard flow — by definition it steps out of bundler composition.

**Design rationale** (cf. [ARCHITECTURE.md](ARCHITECTURE.md#withdrawals-and-redeems-direct-vault-calls)): a withdraw does not transfer tokens _from_ the user to the protocol, it burns shares. There is therefore no _inflation_ attack surface to close, and no approval to grant to GA1 — hence the direct call, simpler from a UX standpoint. **But the trade-off is real**: the absence of an on-chain share-price check still leaves the caller exposed to share-price manipulation, to be weighed case by case.

### Force deallocation: also not Bundler3

`vaultV2ForceWithdraw` / `vaultV2ForceRedeem` use the **native `multicall`** on the VaultV2 contract, not Bundler3. `forceDeallocate` calls penalize the user (share burn) — this is a degraded-liquidity exit tool, not a normal flow.

### Other pitfalls

- **Morpho authorization for GA1 required for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`.** A user who has never granted it will receive the `setAuthorization` requirement through [`getMorphoAuthorizationRequirement`](src/actions/requirements/getMorphoAuthorizationRequirement.ts) — to execute beforehand or sign via permit.
- **Critical order in `repayWithdrawCollateral`**: `morphoRepay` **must** precede `morphoWithdrawCollateral` in the bundle, otherwise the position is deemed unhealthy at withdraw time and the tx reverts.
- **Builder must equal signer.** Bundler actions reference accounts in two different ways: some take an explicit `onBehalf` and act on `userAddress` (e.g. `morphoRepay`), others act implicitly on the **initiator** — the `msg.sender` of `bundler3.multicall`, i.e. the EOA signing the tx, not the adapter — (e.g. `erc20TransferFrom`, `morphoWithdrawCollateral`, the latter exposing no `onBehalf` parameter on GA1). `repayWithdrawCollateral` is the canonical example: the repay leg targets `userAddress` while the transfer-from and the withdraw target the initiator. If the address that built the tx (and filled `userAddress`) is not the address that signs/executes it, the bundle would repay one account's debt while pulling tokens from and withdrawing collateral against the signer. The SDK enforces builder = signer via `validateUserAddress` (throws `MissingClientPropertyError` or `AddressMismatchError`).
- **Tricky `tx.value`**: whenever a `nativeAmount` or a `reallocateTo` (native fee) is involved, `tx.value` is computed by the SDK. Do not overwrite it on the caller side.
- **Chain-specific Bundler3 address**: always resolve through `getChainAddresses(chainId)` and validate that the viem client's `chainId` matches the params.

## Code references

- Bundle encoding: [src/actions/vaultV1/deposit.ts](src/actions/vaultV1/deposit.ts), [src/actions/vaultV2/deposit.ts](src/actions/vaultV2/deposit.ts), [src/actions/marketV1/](src/actions/marketV1/)
- Approval resolution (spender = GA1): [src/actions/requirements/](src/actions/requirements/)
- Morpho authorization for GA1: [src/actions/requirements/getMorphoAuthorizationRequirement.ts](src/actions/requirements/getMorphoAuthorizationRequirement.ts)
- Reallocations / PublicAllocator: [src/types/sharedLiquidity.ts](src/types/sharedLiquidity.ts)
- Full architectural context: [ARCHITECTURE.md](ARCHITECTURE.md)
