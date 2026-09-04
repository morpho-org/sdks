# Bundler3 & GeneralAdapter1

This document describes the SDK flows that still use Bundler3 and GeneralAdapter1, plus the public
low-level composition surface.

> Blue routing changed in `@morpho-org/morpho-sdk` v6. The high-level writes on
> `client.morpho.blue(...)` call BlueBundlesV1 directly; they do not use the route described below.
> See the [v5 → v6 migration guide](./MIGRATION-v5-to-v6.md).

## What is Bundler3?

Bundler3 is a Morpho multicall contract. It accepts a list of typed actions—token transfers,
permits, native wrapping, ERC-4626 deposits, Morpho primitives, and allocator calls—and executes
them atomically. `BundlerAction.encodeBundle(chainId, actions)` encodes that list into a transaction
whose destination is the chain's Bundler3 deployment.

The low-level `BundlerAction` primitives remain public for advanced composition. Their presence
does not imply that a high-level entity method routes through Bundler3.

### GeneralAdapter1

GeneralAdapter1 is the generic adapter used by Bundler3. For current high-level vault flows it:

- receives ERC-20 tokens through `erc20TransferFrom`, ERC-2612, or Permit2 AllowanceTransfer;
- wraps native assets through `nativeTransfer` + `wrapNative`; and
- calls `erc4626Deposit(vault, assets, maxSharePrice, recipient)`, enforcing the vault share-price
  bound onchain.

Classic approvals and ERC-2612 permits for these Bundler3 flows name GeneralAdapter1 as spender.
With Permit2 AllowanceTransfer, the ERC-20 allowance targets canonical Permit2 and the signed
allowance names GeneralAdapter1. Bundler3 primitives can also execute Morpho and allocator actions
for applications that deliberately build their own low-level bundles.

All Vault V1 shared-liquidity planning, data, input, validation, and explicit PublicAllocator V1
Bundler3-composition surfaces are deprecated and will be removed from the SDK in the next major.
Use Vault V2 BluePublicAllocator actions for new integrations.

## Current high-level routes

| Operation | Route | Composition |
| --- | --- | --- |
| VaultV1 `deposit` | Bundler3 → GeneralAdapter1 | Optional native wrap or ERC-20 permit/pull, then `erc4626Deposit`. |
| VaultV2 `deposit` | Bundler3 → GeneralAdapter1 | Same shape as VaultV1. |
| VaultV1 `migrateToV2` | Bundler3 → GeneralAdapter1 | Pull/redeem VaultV1 shares, then deposit into VaultV2. |
| VaultV1/VaultV2 `withdraw` / `redeem` | Direct vault call | No Bundler3 or adapter. |
| VaultV1/VaultV2 `inKindRedeem` | VaultExitBundlesV1 | Fixed standalone periphery call. |
| VaultV2 `forceWithdraw` | VaultExitBundlesV1 | Fixed standalone periphery call; the contract computes its own `forceDeallocate` calls and bounds the realized exit share price with `minSharePriceE27`. |
| VaultV2 `forceRedeem` | VaultV2 `multicall` | Caller-supplied `forceDeallocate` calls followed by `redeem`. |
| Blue writes | BlueBundlesV1 | One of five fixed direct entrypoints; see below. |

## Blue writes are not Bundler3 flows

`client.morpho.blue(marketParams, chainId)` preserves:

- `supply`
- `withdraw`
- `supplyCollateral`
- `borrow`
- `supplyCollateralBorrow`
- `repay`
- `withdrawCollateral`
- `repayWithdrawCollateral`
- `refinance`

Each method builds one transaction to the registered BlueBundlesV1 deployment. BlueBundlesV1 owns
the token pull or native wrap, Morpho call ordering, optional referral fee, refund handling, signed
authorization consumption, and optional Vault V2 public allocations.

Consequences for integrators:

- Classic approvals and ERC-2612 permits target BlueBundlesV1, not GeneralAdapter1.
- Permit2 uses SignatureTransfer: the ERC-20 prerequisite still targets canonical Permit2, while
  the signature authorizes BlueBundlesV1 as spender.
- Morpho authorization grants BlueBundlesV1 operator rights, not GeneralAdapter1.
- High-level Blue reallocations are Vault V2 BluePublicAllocator calls only. Deprecated
  PublicAllocator V1 helpers and low-level composition remain available until the next major, but
  these writes do not accept their outputs.
- High-level Blue writes have no `slippageTolerance`, `minSharePrice`, or `maxSharePrice` input.
  BlueBundlesV1 cannot enforce the old Bundler3 share-price bounds.
- Transaction decoding and simulation must expect one BlueBundlesV1 function call rather than a
  Bundler3 multicall action list.

## Guarantees retained by Bundler3 vault deposits

### Atomic share-price protection

For every VaultV1/VaultV2 deposit, GeneralAdapter1 calls
`erc4626Deposit(vault, assets, maxSharePrice, recipient)`. The share-price bound is checked in the
same transaction as the asset transfer, closing the ERC-4626 inflation-attack window. Never bypass
GeneralAdapter1 for a high-level vault deposit.

### Ordered composition

Bundler3 either executes every encoded action in order or reverts the whole multicall. This is why
vault migration and native-wrap deposit flows can safely combine several protocol steps without
exposing intermediate state.

### One spender for Bundler3 flows

Vault deposits and advanced GeneralAdapter1 compositions share the same requirement resolver,
[`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts).
An allowance to GeneralAdapter1 can be reused by those flows. It is not reused by direct
BlueBundlesV1 writes because they have a different spender.

## Pitfalls

- **Builder must equal signer.** Bundler actions may mix explicit `onBehalf` accounts with the
  Bundler3 transaction initiator. Keep `userAddress` aligned with the account that signs and sends
  the transaction. Signature requirements enforce this at `sign()` time.
- **Do not overwrite `tx.value`.** `BundlerAction.encodeBundle` derives native value from encoded
  native transfers and any low-level value-carrying allocator calls.
- **Resolve addresses per chain.** Use the address registry and validate the viem client's chain
  before encoding. Bundler3, GeneralAdapter1, and BlueBundlesV1 are independent addresses.
- **Do not infer high-level routing from low-level exports.** Morpho and PublicAllocator Bundler3
  primitives remain public for advanced users, but `client.morpho.blue(...)` never falls back to
  them in v6.
- **Direct vault `withdraw`/`redeem` have no share-price bound.** Unlike GeneralAdapter1 deposits,
  VaultV1/VaultV2 `withdraw` and `redeem` are direct vault calls that carry no on-chain
  `minSharePrice`/`maxSharePrice` bound, so callers must weigh share-price movement between
  transaction construction and inclusion.

## Force deallocation and force withdrawal are not Bundler3

`vaultV2ForceRedeem` uses the native `multicall` on the VaultV2 contract. `vaultV2ForceWithdraw`
instead calls the standalone **VaultExitBundlesV1** periphery, which computes its own
`forceDeallocate` sequence on-chain. Two consequences the multicall path did not have: the user must
authorize vault shares to VaultExitBundlesV1 (approval or ERC-2612 permit), and the vault's
`receiveAssetsGate` must allow that periphery as an asset recipient. In exchange the exit carries a
real `minSharePriceE27` slippage bound the multicall path never had.

## Code references

- Bundle encoding: [src/bundler/actions.ts](src/bundler/actions.ts)
- Vault deposit actions: [src/actions/vaultV1/deposit.ts](src/actions/vaultV1/deposit.ts),
  [src/actions/vaultV2/deposit.ts](src/actions/vaultV2/deposit.ts)
- GeneralAdapter1 requirements:
  [src/actions/requirements/generalAdapter/](src/actions/requirements/generalAdapter/)
- Blue actions and requirements: [src/actions/blue/](src/actions/blue/),
  [src/actions/requirements/blue/](src/actions/requirements/blue/)
- Full architectural context: [ARCHITECTURE.md](ARCHITECTURE.md)
