# Bundler3 & GeneralAdapter1

This document describes how **Bundler3** and **GeneralAdapter1** are used in the Morpho SDK, the flows that rely on them, and the security guarantees and limits of this routing.

> **Scope (v6).** As of `morpho-sdk` v6 the Blue position paths — `supplyCollateral`, `borrow`,
> `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral` — and the
> loan-asset `supply` / `withdraw` no longer route through Bundler3. They each encode a **single
> direct `BlueBundlesV1` call** that approves and authorizes BlueBundlesV1 directly; see
> [`src/actions/blue/AGENTS.md`](src/actions/blue/AGENTS.md) and the [README](README.md#actions) for
> their routing. Bundler3 + GeneralAdapter1 now back only **vault V1/V2 deposits**, **Blue
> `refinance`**, and the deprecated **low-level PublicAllocator V1 composition**. The Morpho Blue
> action verbs below (`morphoSupplyCollateral`, `morphoBorrow`, …) remain relevant to `refinance`
> and to that low-level composition.

## What is Bundler3?

Bundler3 is a _multicall_ contract specific to the Morpho ecosystem. It takes as input a **list of typed actions** (ERC20 transfers, permit, permit2, native wrapping, ERC-4626 deposits, Morpho Blue calls, reallocations…) and executes them **atomically in a single transaction**.

Instead of exposing the user directly to target contracts (ERC-4626 vault, Morpho Blue, PublicAllocator, WETH…), the SDK encodes a bundle via its local [`BundlerAction.encodeBundle(chainId, actions)`](src/bundler/actions.ts). The `to` of the resulting transaction is **always** the Bundler3 address for the target chain.

### GeneralAdapter1: the trusted adapter

`GeneralAdapter1` (resolved via [`getChainAddresses(chainId).bundler3.generalAdapter1`](src/actions/vaultV1/deposit.ts#L82-L84)) is the **"generic" adapter** called by Bundler3. It is the contract that:

- receives the user's ERC20 tokens (`erc20TransferFrom`, `permit`, `approve2` / `transferFrom2`),
- wraps native into wNative (`nativeTransfer` + `wrapNative`),
- calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)` enforcing `maxSharePrice` **on-chain**,
- executes `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral` on Morpho Blue on the user's behalf for `refinance` and low-level composition.

Bundler3 also calls allocator contracts directly for shared liquidity: `reallocateTo` on Public
Allocator V1 and `reallocate` or `allocateFromIdle` on Blue Public Allocator.

PublicAllocator V1 composition is deprecated and will be removed from the SDK in the next major.
Use Vault V2 BluePublicAllocator actions for new integrations.

The spender of every **user-supplied** approval / permit / permit2 on a Bundler3 route is
`generalAdapter1`, never the vault or Morpho directly. (The migrated Blue position paths instead
approve **BlueBundlesV1**.) Blue Public Allocator penalties add a separate internal allowance:
Bundler3 approves the allocator for each exact penalty amount immediately before the non-skippable
allocator call. See [`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts) and the "Requirements System" section of [ARCHITECTURE.md](ARCHITECTURE.md#requirements-system).

## Composability & modularity

The value of the Bundler3 + GeneralAdapter1 pairing rests on three properties:

1. **Composition of elementary actions.** Each step (`nativeTransfer`, `wrapNative`, `erc20TransferFrom`, `permit`, `approve2`, `transferFrom2`, `erc4626Deposit`, `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`, `morphoWithdrawCollateral`, `reallocateTo`, `vaultV2BluePublicAllocatorReallocate`, `vaultV2BluePublicAllocatorAllocateFromIdle`) is an independent building block. The SDK **composes** them in an explicit order to build a business flow.
2. **Atomicity.** The entire bundle either succeeds or reverts as one. No intermediate state is exposed to MEV bots or other transactions.
3. **Simplified approval UX.** On a Bundler3 route a user approves _a single spender_ (GeneralAdapter1) — rather than one approval per V1/V2 vault or per Morpho contract.

`refinance` is the canonical remaining example: it is not a new contract but the composition of
`morphoSupplyCollateral` with a borrow/repay/withdraw callback (plus any target allocator
reallocations) inside a single bundle. The business logic lives in the **order and selection of
actions**, not in a dedicated contract. The Blue position paths that were previously composed this
way now use the dedicated `BlueBundlesV1` combined entrypoints instead.

## Flows overview

| Operation                               | Route                        | Bundler actions (order)                                                                                                  |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| VaultV1 `deposit`                       | Bundler3 → GeneralAdapter1   | _(opt)_ `nativeTransfer` + `wrapNative` → `erc20TransferFrom` / `permit` / `approve2`+`transferFrom2` → `erc4626Deposit` |
| VaultV2 `deposit`                       | Bundler3 → GeneralAdapter1   | same as VaultV1                                                                                                          |
| Blue `refinance`                    | Bundler3 → GeneralAdapter1   | _(opt)_ target allocator reallocations → `morphoSupplyCollateral` with the borrow/repay/withdraw callback (authorizes **GA1**) |
| Blue `supplyCollateral`             | **Direct BlueBundlesV1 call** | one `blueBundlesV1SupplyCollateralAndBorrow` call (zero borrow leg) with the collateral `{kind, data}` permit; native funds `tx.value` |
| Blue `borrow`                       | **Direct BlueBundlesV1 call** | one `blueBundlesV1SupplyCollateralAndBorrow` call (zero collateral leg) carrying the signed authorization and any reallocations |
| Blue `supplyCollateralBorrow`       | **Direct BlueBundlesV1 call** | one `blueBundlesV1SupplyCollateralAndBorrow` call carrying the collateral permit, signed authorization, and any reallocations |
| Blue `repay`                        | **Direct BlueBundlesV1 call** | one `blueBundlesV1RepayAndWithdrawCollateral` call (zero withdraw leg) with the loan-token permit; native funds `tx.value` |
| Blue `repayWithdrawCollateral`      | **Direct BlueBundlesV1 call** | one `blueBundlesV1RepayAndWithdrawCollateral` call (repay **before** withdraw) with the loan-token permit and signed authorization |
| Blue `withdrawCollateral`           | **Direct BlueBundlesV1 call** | one `blueBundlesV1RepayAndWithdrawCollateral` call (zero repay leg) with the signed authorization |
| Blue `supply` (loan-asset)          | **Direct BlueBundlesV1 call** | one `blueBundlesV1Supply` call with an inline `{kind, data}` permit, or a payable native-funded call                     |
| Blue `withdraw` (loan-asset)        | **Direct BlueBundlesV1 call** | one `blueBundlesV1Withdraw` call; _(opt)_ reallocations + signed authorization carried in its calldata, penalties netted from proceeds |
| VaultV1 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| VaultV2 `withdraw` / `redeem`           | **Direct vault call**        | _(no bundler, no adapter)_                                                                                               |
| VaultV2 `forceWithdraw` / `forceRedeem` | VaultV2 `multicall` (native) | `forceDeallocate`×N + `withdraw` / `redeem` — **on the vault contract itself**, not through Bundler3                     |

## Strengths

### 1. Inflation-attack protection (`maxSharePrice`)

For every ERC-4626 deposit (VaultV1 / VaultV2), GeneralAdapter1 calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)`. The `maxSharePrice` parameter is verified **on-chain, in the same transaction as the token transfer** — closing the _ERC-4626 inflation_ attack window (share-price manipulation between approval and deposit). Vaults without _dead-deposit protection_ are especially exposed to this vector; the bundler is the defense.

> **Security invariant:** never bypass the general adapter for a deposit.

### 2. LLTV-buffer protection on debt operations

`borrow` and `supplyCollateralBorrow` validate SDK-side that the resulting position stays below `LLTV − buffer` (default 0.5%); otherwise `BorrowExceedsSafeLtvError` is thrown. This prevents the creation of an immediately liquidatable position. The same buffer guards the post-withdraw health check on `withdrawCollateral` and `repayWithdrawCollateral`. On the direct BlueBundlesV1 routes this SDK-side check is paired with a post-operation `maxLtv` bound enforced **on-chain** by BlueBundlesV1 (there is no Bundler3 `minSharePrice`).

### 3. ERC-4626 deposit slippage

Vault deposits carry an on-chain `maxSharePrice` (see §1). This is the only share-price bound in the SDK: the direct BlueBundlesV1 Blue routes have **no** `minSharePrice` / `maxSharePrice` — `borrow` / `supplyCollateralBorrow` bound the post-operation LTV via `maxLtv`, and `repay` / `withdraw` are exact-asset or exact-share (a saturated `repayShares = maxUint256` cleanly closes the debt, immune to interest accrual between construction and execution).

### 4. Shared liquidity without an ad-hoc contract

High-level Blue writes accept only Blue Public Allocator V2 `reallocate`/`allocateFromIdle` calls.
`borrow`, `supplyCollateralBorrow`, and loan-asset `withdraw` carry their reallocations **inside the
single `BlueBundlesV1` call's own calldata** (`blueBundlesV1SupplyCollateralAndBorrow` /
`blueBundlesV1Withdraw`); the contract nets each `ceil(assets × penalty / WAD)` penalty from the
borrow or withdrawn proceeds, so no separate Bundler3 penalty-funding action is emitted and the
builder rejects an aggregate penalty above the borrowed (or withdrawn) amount. `getRequirements()`
emits no penalty approval for these paths.

`refinance` is the exception: it stays on Bundler3, so its target reallocations are run **before the
supply-collateral callback**, the bundle pulls the aggregate V2 penalty in the target loan token
through GeneralAdapter1, approves each exact per-call amount from Bundler3, and lets the allocator
donate it directly to the vault — `getRequirements()` returns the corresponding classic loan-token
approval when a V2 penalty is non-zero.

Public Allocator V1 planners and `BundlerAction.publicAllocatorReallocateTo` remain available
for explicit low-level Bundler3 composition, including the allocator's native fee in `tx.value`.

### 5. Approval surfaces

On a Bundler3 route — a V1 deposit, a V2 deposit, or `refinance` — the spender presented to the user
is **always** `generalAdapter1`, and a user who has already approved GA1 for a token transparently
reuses that approval; the approval / permit / permit2 decision is centralized in
[`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts).
The migrated Blue position paths instead present **BlueBundlesV1** as the spender (the collateral
token for the supply/borrow entrypoint, the loan token for the repay/withdraw entrypoint). For Blue
Public Allocator penalties on the `refinance` route, Bundler3 separately grants the allocator an
exact per-call allowance; that approval and allocator call cannot be made independently skippable.

## Dangers & limits

### Withdraw / redeem do NOT go through Bundler3

This is the main design caveat. For the following operations the SDK emits a **direct call to the target contract** (the vault):

| Operation                           | Direct target    |
| ----------------------------------- | ---------------- |
| `vaultV1Withdraw` / `vaultV1Redeem` | MetaMorpho vault |
| `vaultV2Withdraw` / `vaultV2Redeem` | VaultV2          |

**Consequences:**

- **No on-chain share-price check.** There is no equivalent of `maxSharePrice` / `minSharePrice` passed to the ERC-4626. A share price manipulated between transaction construction and inclusion can adversely impact the number of assets received (withdraw by shares) or shares burned (withdraw by assets), **without the transaction reverting**.
- **No cross-action atomicity.** A `withdraw` cannot be composed with another call inside the same bundle using the standard flow — by definition it steps out of bundler composition.

**Design rationale** (cf. [ARCHITECTURE.md](ARCHITECTURE.md#withdrawals-and-redeems-direct-vault-calls)): a vault withdraw does not transfer tokens _from_ the user to the protocol, it burns shares. There is therefore no _inflation_ attack surface to close, and no approval to grant to GA1 — hence the direct call, simpler from a UX standpoint. **But the trade-off is real**: the absence of an on-chain share-price check still leaves the caller exposed to share-price manipulation, to be weighed case by case.

### Force deallocation: also not Bundler3

`vaultV2ForceWithdraw` / `vaultV2ForceRedeem` use the **native `multicall`** on the VaultV2 contract, not Bundler3. `forceDeallocate` calls penalize the user (share burn) — this is a degraded-liquidity exit tool, not a normal flow.

### Other pitfalls

- **Morpho authorization for BlueBundlesV1 required for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `withdrawCollateral`** (and loan-asset `withdraw`). A user who has never granted it receives a requirement through [`getBlueAuthorizationRequirement`](src/actions/requirements/blue/getBlueAuthorizationRequirement.ts). Without signature support this is a `setAuthorization` transaction to execute beforehand. With `supportSignature` it is a signable requirement; the resulting `AuthorizationRequirementSignature` is embedded directly in the BlueBundlesV1 combined call's calldata. (`refinance`, still on Bundler3, instead authorizes **GeneralAdapter1** and folds a `setAuthorizationWithSig` call into its bundle.)
- **Critical order in `repayWithdrawCollateral`**: BlueBundlesV1 repays **before** it withdraws collateral, otherwise the position would be unhealthy at withdraw time and the call would revert.
- **Builder must equal signer.** BlueBundlesV1 combined calls act on the transaction **initiator** (`msg.sender`) for the token pull and the collateral withdrawal, while the repay/authorization legs reference the signed `userAddress`. `repayWithdrawCollateral` is the canonical example: if the address that built the tx (and filled `userAddress`) is not the address that signs/executes it, the call would repay one account's debt while pulling tokens from and withdrawing collateral against the signer. Transaction builders do not validate this at build time — callers MUST keep `userAddress` aligned with the signing account. The signature requirements (`encodeErc20Permit` / `encodeErc20Permit2Approve`) take a `WalletClient` and enforce this at `sign()` time via `validateUserAddress` (throws `MissingClientPropertyError` / `AddressMismatchError`).
- **Tricky `tx.value`**: on Bundler3 routes, `BundlerAction.encodeBundle` computes native value for `nativeAmount` and Public Allocator V1 `reallocateTo` fees; Blue Public Allocator penalties are ERC-20 loan-token amounts and never contribute to `tx.value`. On direct BlueBundlesV1 routes native funding is all-or-nothing and attached as `tx.value` on the single payable call. Do not overwrite the encoded value on the caller side.
- **Chain-specific addresses**: always resolve Bundler3 / GeneralAdapter1 / BlueBundlesV1 through `getChainAddresses(chainId)` and validate that the viem client's `chainId` matches the params.

## Code references

- Bundle encoding: [src/actions/vaultV1/deposit.ts](src/actions/vaultV1/deposit.ts), [src/actions/vaultV2/deposit.ts](src/actions/vaultV2/deposit.ts), [src/actions/blue/](src/actions/blue/)
- Approval resolution (spender = GA1 on Bundler3 routes, BlueBundlesV1 on Blue position paths): [src/actions/requirements/](src/actions/requirements/)
- Blue authorization: [src/actions/requirements/blue/getBlueAuthorizationRequirement.ts](src/actions/requirements/blue/getBlueAuthorizationRequirement.ts)
- Reallocations / PublicAllocator: [src/types/sharedLiquidity.ts](src/types/sharedLiquidity.ts)
- Full architectural context: [ARCHITECTURE.md](ARCHITECTURE.md)
