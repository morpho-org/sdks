# Bundler3 & GeneralAdapter1

This document describes how **Bundler3** and **GeneralAdapter1** are used in the Morpho SDK, the flows that rely on them, and the security guarantees and limits of this routing.

## What is Bundler3?

Bundler3 is a _multicall_ contract specific to the Morpho ecosystem. It takes as input a **list of typed actions** (ERC20 transfers, permit, permit2, native wrapping, ERC-4626 deposits, Morpho Blue calls, reallocations…) and executes them **atomically in a single transaction**.

Instead of exposing the user directly to target contracts (ERC-4626 vault, Morpho Blue, PublicAllocator, WETH…), the SDK encodes a bundle via its local [`BundlerAction.encodeBundle(chainId, actions)`](src/bundler/actions.ts). The `to` of the resulting transaction is **always** the Bundler3 address for the target chain.

### GeneralAdapter1: the trusted adapter

`GeneralAdapter1` (resolved via [`getChainAddresses(chainId).bundler3.generalAdapter1`](src/actions/vaultV1/deposit.ts#L82-L84)) is the **"generic" adapter** called by Bundler3. It is the contract that:

- receives the user's ERC20 tokens (`erc20TransferFrom`, `permit`, `approve2` / `transferFrom2`),
- wraps native into wNative (`nativeTransfer` + `wrapNative`),
- calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)` enforcing `maxSharePrice` **on-chain**,
- executes `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral` on Morpho Blue on the user's behalf.

Bundler3 also calls allocator contracts directly for shared liquidity: `reallocateTo` on Public
Allocator V1 and `reallocate` or `allocateFromIdle` on Blue Public Allocator.

The spender of every **user-supplied** approval / permit / permit2 is `generalAdapter1`, never the vault or Morpho directly. Blue Public Allocator penalties add a separate internal allowance: Bundler3 approves the allocator for each exact penalty amount immediately before the non-skippable allocator call. See [`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts) and the "Requirements System" section of [ARCHITECTURE.md](ARCHITECTURE.md#requirements-system).

## Composability & modularity

The value of the Bundler3 + GeneralAdapter1 pairing rests on three properties:

1. **Composition of elementary actions.** Each step (`nativeTransfer`, `wrapNative`, `erc20TransferFrom`, `permit`, `approve2`, `transferFrom2`, `erc4626Deposit`, `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral`, `reallocateTo`, `vaultV2BluePublicAllocatorReallocate`, `vaultV2BluePublicAllocatorAllocateFromIdle`) is an independent building block. The SDK **composes** them in an explicit order to build a business flow.
2. **Atomicity.** The entire bundle either succeeds or reverts as one. No intermediate state is exposed to MEV bots or other transactions.
3. **Simplified approval UX.** A user approves _a single spender_ (GeneralAdapter1) for the entire protocol surface — rather than one approval per V1/V2 vault or per Morpho contract.

Concretely, `blueSupplyCollateralBorrow` is not a new contract: it is simply the composition `erc20TransferFrom` + `morphoSupplyCollateral` + `morphoBorrow` inside a single bundle. Same story for `repayWithdrawCollateral`, or for a borrow that must first trigger Public Allocator V1 or Blue Public Allocator calls. The business logic lives in the **order and selection of actions**, not in a dedicated contract.

## Flows overview

| Operation                               | Route                        | Bundler actions (order)                                                                                                  |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| VaultV1 `deposit`                       | Bundler3 → GeneralAdapter1   | _(opt)_ `nativeTransfer` + `wrapNative` → `erc20TransferFrom` / `permit` / `approve2`+`transferFrom2` → `erc4626Deposit` |
| VaultV2 `deposit`                       | Bundler3 → GeneralAdapter1   | same as VaultV1                                                                                                          |
| Blue `supplyCollateral`             | Bundler3 → GeneralAdapter1   | _(opt)_ `nativeTransfer` + `wrapNative` → `erc20TransferFrom` → `morphoSupplyCollateral`                                 |
| Blue `borrow`                       | Bundler3 → GeneralAdapter1   | _(opt)_ allocator reallocations → `morphoBorrow` _(requires `setAuthorization` for GA1 on Morpho)_                       |
| Blue `supplyCollateralBorrow`       | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoSupplyCollateral` → _(opt)_ allocator reallocations → `morphoBorrow`                        |
| Blue `withdraw`                     | Bundler3 → GeneralAdapter1   | _(opt)_ allocator reallocations → `morphoWithdraw`                                                                       |
| Blue `refinance`                    | Bundler3 → GeneralAdapter1   | _(opt)_ target allocator reallocations → `morphoSupplyCollateral` with the borrow/repay/withdraw callback                |
| Blue `repay`                        | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoRepay` (by `assets` or by `shares`)                                                         |
| Blue `repayWithdrawCollateral`      | Bundler3 → GeneralAdapter1   | `erc20TransferFrom` → `morphoRepay` → `morphoWithdrawCollateral` _(repay **before** withdraw, order is critical)_        |
| VaultV1 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| VaultV2 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| Blue `withdrawCollateral`           | **Direct Morpho Blue call**  | _(no bundler, no GA1 auth required — `msg.sender` = `onBehalf`)_                                                         |
| VaultV2 `forceWithdraw`                 | VaultExitBundlesV1 (standalone) | Contract-computed `forceDeallocate`×N + `withdraw`, bounded by `minSharePriceE27` — **not through Bundler3**              |
| VaultV2 `forceRedeem`                   | VaultV2 `multicall` (native) | Caller-supplied `forceDeallocate`×N + `redeem` — **on the vault contract itself**, not through Bundler3                   |

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

`BlueReallocationPlan` encodes either Public Allocator V1 `reallocateTo` calls or Blue Public
Allocator `reallocate`/`allocateFromIdle` calls. A plan cannot mix allocator versions. Reallocations
are **prepended to the
bundle** for borrow and loan-asset withdraw, **inserted between supply-collateral and borrow** for
`supplyCollateralBorrow`, and run **before the supply-collateral callback** for `blueRefinance`.
`BundlerAction.encodeBundle` includes Public Allocator V1 fees in `tx.value`. Blue Public Allocator
penalties are different: the bundle pulls the aggregate amount in the target loan token through
GeneralAdapter1, approves each exact per-call amount from Bundler3, and lets the allocator donate
it directly to the vault. The entity's `getRequirements()` returns the corresponding classic
loan-token approval when a V2 penalty is non-zero, except when `supplyCollateralBorrow` uses the
same collateral and loan token: that path folds the penalty into its single collateral approval or
permit and emits no separate penalty requirement.

### 5. A single user approval surface

Whether it's a V1 deposit, a V2 deposit, a `supplyCollateral`, a `repay`, or a `supplyCollateralBorrow`, the spender presented to the user is **always** `generalAdapter1`. A user who has already approved GA1 for a given token transparently reuses that approval. The approval / permit / permit2 decision is centralized in [`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts). For Blue Public Allocator penalties, Bundler3 separately grants the allocator an exact per-call allowance; that approval and allocator call cannot be made independently skippable.

## Dangers & limits

### Withdraw / redeem do NOT go through Bundler3

This is the main design caveat. For the following operations the SDK emits a **direct call to the target contract** (the vault):

| Operation                           | Direct target    |
| ----------------------------------- | ---------------- |
| `vaultV1Withdraw` / `vaultV1Redeem` | MetaMorpho vault |
| `vaultV2Withdraw` / `vaultV2Redeem` | VaultV2          |
| `blueWithdrawCollateral`        | Morpho Blue      |

**Consequences:**

- **No on-chain share-price check.** There is no equivalent of `maxSharePrice` / `minSharePrice` passed to the ERC-4626. A share price manipulated between transaction construction and inclusion can adversely impact the number of assets received (withdraw by shares) or shares burned (withdraw by assets), **without the transaction reverting**.
- **No automatic LLTV guard** on the adapter side. `blueWithdrawCollateral` validates position health SDK-side (LLTV buffer) _before_ building the tx, but that check is _off-chain_ — if on-chain state moves between simulation and inclusion (oracle price, interest, other borrows), nothing stops the transaction. It is up to the caller to ensure data freshness.
- **No cross-action atomicity.** A `withdraw` cannot be composed with another call inside the same bundle using the standard flow — by definition it steps out of bundler composition.

**Design rationale** (cf. [ARCHITECTURE.md](ARCHITECTURE.md#withdrawals-and-redeems-direct-vault-calls)): a withdraw does not transfer tokens _from_ the user to the protocol, it burns shares. There is therefore no _inflation_ attack surface to close, and no approval to grant to GA1 — hence the direct call, simpler from a UX standpoint. **But the trade-off is real**: the absence of an on-chain share-price check still leaves the caller exposed to share-price manipulation, to be weighed case by case.

### Other pitfalls

- **Blue authorization for GA1 required for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`.** A user who has never granted it will receive a requirement through [`getBlueAuthorizationRequirement`](src/actions/requirements/blue/getBlueAuthorizationRequirement.ts). Without signature support, this is a `setAuthorization` transaction to execute beforehand. With `supportSignature`, this is a signable requirement; pass the resulting `AuthorizationRequirementSignature` to `buildTx`, which folds it into the bundle as `setAuthorizationWithSig`.
- **Critical order in `repayWithdrawCollateral`**: `morphoRepay` **must** precede `morphoWithdrawCollateral` in the bundle, otherwise the position is deemed unhealthy at withdraw time and the tx reverts.
- **Builder must equal signer.** Bundler actions reference accounts in two different ways: some take an explicit `onBehalf` and act on `userAddress` (e.g. `morphoRepay`), others act implicitly on the **initiator** — the `msg.sender` of `bundler3.multicall`, i.e. the EOA signing the tx, not the adapter — (e.g. `erc20TransferFrom`, `morphoWithdrawCollateral`, the latter exposing no `onBehalf` parameter on GA1). `repayWithdrawCollateral` is the canonical example: the repay leg targets `userAddress` while the transfer-from and the withdraw target the initiator. If the address that built the tx (and filled `userAddress`) is not the address that signs/executes it, the bundle would repay one account's debt while pulling tokens from and withdrawing collateral against the signer. Transaction builders do not validate this at build time — callers MUST keep `userAddress` aligned with the signing account. The signature requirements (`encodeErc20Permit` / `encodeErc20Permit2Approve`) take a `WalletClient` and enforce this at `sign()` time via `validateUserAddress` (throws `MissingClientPropertyError` / `AddressMismatchError`).
- **Tricky `tx.value`**: `BundlerAction.encodeBundle` computes native value for `nativeAmount` and Public Allocator V1 `reallocateTo` fees. Blue Public Allocator penalties are ERC-20 loan-token amounts and never contribute to `tx.value`. Do not overwrite the encoded value on the caller side.
- **Chain-specific Bundler3 address**: always resolve through `getChainAddresses(chainId)` and validate that the viem client's `chainId` matches the params.

### Force deallocation and force withdrawal are not Bundler3

`vaultV2ForceRedeem` uses the native `multicall` on the VaultV2 contract. `vaultV2ForceWithdraw`
instead calls the standalone **VaultExitBundlesV1** periphery, which computes its own
`forceDeallocate` sequence on-chain. Two consequences the multicall path did not have: the user must
authorize vault shares to VaultExitBundlesV1 (approval or ERC-2612 permit), and the vault's
`receiveAssetsGate` must allow that periphery as an asset recipient. In exchange the exit carries a
real `minSharePriceE27` slippage bound the multicall path never had.

## Code references

- Bundle encoding: [src/actions/vaultV1/deposit.ts](src/actions/vaultV1/deposit.ts), [src/actions/vaultV2/deposit.ts](src/actions/vaultV2/deposit.ts), [src/actions/blue/](src/actions/blue/)
- Approval resolution (spender = GA1): [src/actions/requirements/](src/actions/requirements/)
- Blue authorization for GA1: [src/actions/requirements/blue/getBlueAuthorizationRequirement.ts](src/actions/requirements/blue/getBlueAuthorizationRequirement.ts)
- Reallocations / PublicAllocator: [src/types/sharedLiquidity.ts](src/types/sharedLiquidity.ts)
- Full architectural context: [ARCHITECTURE.md](ARCHITECTURE.md)
