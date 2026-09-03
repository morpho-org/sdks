# Bundler3 & GeneralAdapter1

This document describes the SDK flows that still use Bundler3 and GeneralAdapter1, plus the public
low-level composition surface.

> Vault deposit and Blue routing changed in `@morpho-org/morpho-sdk` v6. Vault V1/V2 deposits
> call VaultBundlesV1 directly, and high-level writes on `client.morpho.blue(...)` call
> BlueBundlesV1 directly.
> See the [v5 → v6 migration guide](./MIGRATION-v5-to-v6.md).

## What is Bundler3?

Bundler3 is a Morpho multicall contract. It accepts a list of typed actions—token transfers,
permits, native wrapping, ERC-4626 deposits, Morpho primitives, and allocator calls—and executes
them atomically. `BundlerAction.encodeBundle(chainId, actions)` encodes that list into a transaction
whose destination is the chain's Bundler3 deployment.

The low-level `BundlerAction` primitives remain public for advanced composition. Their presence
does not imply that a high-level entity method routes through Bundler3.

### GeneralAdapter1

GeneralAdapter1 is the generic adapter used by Bundler3. Its low-level primitives can:

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
| VaultV1 `deposit` | VaultBundlesV1 | Exclusive ERC-20 pull or native wrap, optional referral fee, then deposit with `maxSharePrice` and `deadline`. |
| VaultV2 `deposit` | VaultBundlesV1 | Same shape as VaultV1. |
| VaultV1 `migrateToV2` | Bundler3 → GeneralAdapter1 | Pull/redeem VaultV1 shares, then deposit into VaultV2. |
| VaultV1/VaultV2 `withdraw` / `redeem` | Direct vault call | No Bundler3 or adapter. |
| VaultV1/VaultV2 `inKindRedeem` | VaultExitBundlesV1 | Fixed standalone periphery call. |
| VaultV2 `forceWithdraw` / `forceRedeem` | VaultV2 `multicall` | `forceDeallocate` calls followed by withdraw/redeem. |
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

## Vault deposit routing

High-level VaultV1/VaultV2 deposits call `vaultBundlesV1Deposit` directly. Funding is either
ERC-20 `amount` or `nativeAmount`, never both. The native path sends the full gross amount as
`tx.value`; VaultBundlesV1 wraps it, and the vault asset must be the chain's wrapped-native token.

VaultBundlesV1 deducts the optional referral fee before depositing and atomically enforces the
`maxSharePrice` inflation-attack guard and execution deadline. The entity computes this bound from
net assets using the vault snapshot accrued through the deadline. Shares go to the transaction
sender, which must match `userAddress`.

Classic approvals and ERC-2612 permits target VaultBundlesV1. Permit2 uses SignatureTransfer:
the ERC-20 prerequisite targets canonical Permit2, and the signed transfer names VaultBundlesV1
as spender with an explicit unused `permit2Nonce`. Native funding needs no token requirements and
rejects token signatures. The same prepared handle resolves requirements and builds the deposit;
its accepted signature is encoded into the fixed call's token permit.

See [the requirements system](./ARCHITECTURE.md#requirements-system) for the decision table and
[the migration guide](./MIGRATION-v5-to-v6.md) for per-chain deployment checks.

## Guarantees retained by Bundler3 compositions

### Atomic share-price protection

Vault V1-to-V2 migration still uses GeneralAdapter1's `erc4626Deposit` primitive to enforce the
destination `maxSharePrice`. Advanced low-level deposit compositions must also retain that guard.

### Ordered composition

Bundler3 either executes every encoded action in order or reverts the whole multicall. Vault
migration can therefore combine a share pull, redemption, and destination deposit atomically.

### One spender for GeneralAdapter1 compositions

Vault V1-to-V2 migration and advanced GeneralAdapter1 compositions use
[`getGeneralAdapterRequirements`](src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts).
An allowance to GeneralAdapter1 can be reused by those flows. Direct VaultBundlesV1 deposits
and BlueBundlesV1 writes each require allowances or permits for their own spender.

## Pitfalls

- **Builder must equal signer.** Bundler actions may mix explicit `onBehalf` accounts with the
  Bundler3 transaction initiator. Keep `userAddress` aligned with the account that signs and sends
  the transaction. Signature requirements enforce this at `sign()` time.
- **Do not overwrite `tx.value`.** `BundlerAction.encodeBundle` derives native value from encoded
  native transfers and any low-level value-carrying allocator calls.
- **Resolve addresses per chain.** Use the address registry and validate the viem client's chain
  before encoding. Bundler3, GeneralAdapter1, VaultBundlesV1, and BlueBundlesV1 are independent addresses.
- **Do not infer high-level routing from low-level exports.** Morpho and PublicAllocator Bundler3
  primitives remain public for advanced users, but `client.morpho.blue(...)` never falls back to
  them in v6. High-level vault deposits, vault withdrawals, and Blue writes require their
  registered fixed bundles contracts in v6.
- **Direct vault `redeem` has no share-price bound.** Unlike VaultBundlesV1 deposits and
  withdrawals, VaultV1/VaultV2 `redeem` is a direct vault call that carries no on-chain
  `minSharePrice`/`maxSharePrice` bound, so callers must weigh share-price movement between
  transaction construction and inclusion.

**Vault withdrawals bound that exposure through their share allowance.** `vaultV1Withdraw` and
`vaultV2Withdraw` burn `msg.sender`'s shares from VaultBundlesV1, so they need a vault-share
allowance for VaultBundlesV1 — the exact spender, not GeneralAdapter1. Because asset-mode calldata
carries no maximum-shares argument, that allowance _is_ the cap on the burn:
`getRequirements()` derives it from the vault snapshot, the deadline, and `slippageTolerance`, and
returns an approval (or an ERC-2612 shares permit folded into the call when `supportSignature` is
enabled) for exactly that amount. An allowance that does not equal the derived cap — including a
larger leftover approval — is replaced rather than reused, so the cap holds on every withdrawal.
Callers must therefore await `getRequirements()` and satisfy it before `buildTx()`.

## Code references

- Bundle encoding: [src/bundler/actions.ts](src/bundler/actions.ts)
- Direct VaultBundlesV1 deposit actions: [src/actions/vaultV1/deposit.ts](src/actions/vaultV1/deposit.ts),
  [src/actions/vaultV2/deposit.ts](src/actions/vaultV2/deposit.ts)
- GeneralAdapter1 requirements:
  [src/actions/requirements/generalAdapter/](src/actions/requirements/generalAdapter/)
- Blue actions and requirements: [src/actions/blue/](src/actions/blue/),
  [src/actions/requirements/blue/](src/actions/requirements/blue/)
- Full architectural context: [ARCHITECTURE.md](ARCHITECTURE.md)
