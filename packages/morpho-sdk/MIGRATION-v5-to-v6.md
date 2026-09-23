# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 keeps the Blue entity at `client.morpho.blue(marketParams, chainId)` and preserves its
write-method names while routing them through five direct BlueBundlesV1 entrypoints. Blue reads and
the Vault V2 reallocation-data helper remain on the same entity. There is no parallel
extension or automatic fallback to the v5 route. Version 6 also reshapes Vault V2 `forceWithdraw`
to route through the standalone `VaultExitBundlesV1` periphery. This guide covers the Blue write
rerouting and the Vault V2 `forceWithdraw` route replacement alongside the other v6 breaks
documented in the sections below.

## Vault V1 and Vault V2 deposits

`MorphoVaultV1.deposit`, `MorphoVaultV2.deposit`, `vaultV1Deposit`, and `vaultV2Deposit` keep their
names but now route through the chain's registered VaultBundlesV1 contract instead of Bundler3 and
GeneralAdapter1.

> **Chain availability.** Vault deposits and withdrawals require the `bundles.vaultBundlesV1`
> deployment on the target chain. On a registered chain without it, including Fraxtal,
> `MorphoVaultV1.deposit()`, `MorphoVaultV2.deposit()`, `MorphoVaultV1.withdraw()`, and
> `MorphoVaultV2.withdraw()` throw `UnknownAddressError` synchronously at handle creation,
> before `getRequirements()` or `buildTx()` can be called. This is a breaking loss of deposit
> and withdrawal functionality on chains previously supported through Bundler3/GeneralAdapter1
> deposits and direct vault withdrawals; there is no automatic fallback. Confirm coverage before
> upgrading with `getChainAddresses(chainId).bundles?.vaultBundlesV1 != null`. Stay on v5 if your
> application needs deposits or withdrawals on an affected chain until VaultBundlesV1 is deployed
> and registered in the SDK.

As checked on 2026-09-07, the [official deployment list](https://docs.morpho.org/developers/contracts/addresses/#bundles)
and the [SDK registry](../morpho-ts/src/addresses.ts) list VaultBundlesV1 on 14 chains: Ethereum,
Arbitrum, Arc, Base, HyperEVM, Katana, Monad, Optimism, Polygon, Robinhood, Stable, Tempo, Unichain,
and World Chain. Bundler3 availability alone does not imply support for v6 vault deposits or withdrawals.

Update deposit inputs as follows:

| v5 | v6 |
| --- | --- |
| `amount` plus optional additive `nativeAmount` | Choose exactly one positive `amount` or `nativeAmount`. |
| Low-level `args.recipient` | Remove it. VaultBundlesV1 mints shares to `msg.sender`; `userAddress` must be the signing and submitting account. |
| Optional Bundler3 `PermitRequirementSignature` | Use an ERC-2612 or Permit2 SignatureTransfer requirement returned by the prepared entity handle. |
| No deadline or referral fee | Entity methods accept an optional `deadline` that defaults to two hours from preparation; low-level builders require it. Both surfaces accept optional `referralFeePct` and `referralFeeRecipient`. |

For ERC-20 funding, approvals and ERC-2612 permits now name VaultBundlesV1 as spender. Permit2
keeps its ERC-20 approval on canonical Permit2, while its one-time SignatureTransfer payload names
VaultBundlesV1. Resolve requirements and build from the same prepared handle so its captured nonce,
deadline, asset, owner, amount, and spender remain consistent:

```ts
const deposit = vault.deposit({
  amount: 1_000_000n,
  userAddress,
  vaultData,
  referralFeePct,
  referralFeeRecipient,
});

const requirements = await deposit.getRequirements({ permit2Nonce });
// Submit approval transactions or sign the returned token requirement first.
const tx = deposit.buildTx(requirementSignature ? [requirementSignature] : undefined);
```

Deposit action metadata no longer contains `recipient`. It now reports the gross `amount`, optional
`nativeAmount`, `maxSharePrice`, `referralFeePct`, `referralFeeRecipient`, exact
`referralFeeAssets`, resulting `netAssets`, and `deadline`.

## Blue write routing

> **Chain availability.** The direct BlueBundlesV1 route requires the `bundles.blueBundlesV1`
> deployment on the target chain. On a registered chain without it (the previous Bundler3-routed
> flows covered more chains), **every** Blue write — `supply`, `supplyCollateral`, `borrow`,
> `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `withdraw`, and
> `refinance` — throws `UnknownAddressError` synchronously at handle creation (via
> `validateWriteCommon`). Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.blueBundlesV1 != null`.

Version 6 also preserves the Vault V1 and Vault V2 method and builder names while routing `deposit`,
`withdraw`, and `redeem` through VaultBundlesV1. Vault V1 `migrateToV2` uses the same fixed route.

> **Chain availability.** The VaultBundlesV1 route requires the `bundles.vaultBundlesV1` deployment
> on the target chain. On a registered chain without it (Celo, for example, still registers
> MetaMorpho and Vault V2 deployments), **every** routed vault write — Vault V1 `deposit`,
> `withdraw`, `redeem`, and `migrateToV2`, and Vault V2 `deposit`, `withdraw`, and `redeem` — throws
> `UnknownAddressError` synchronously at handle creation, where v5 built a direct vault or Bundler3
> call. Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.vaultBundlesV1 != null`. Vault `inKindRedeem` is unaffected:
> it already routed through `bundles.vaultExitBundlesV1` in v5, and its chain coverage is unchanged.

## Update Vault V1 and Vault V2 methods

| Stable method | v5 input/workflow | v6 input/workflow |
| --- | --- | --- |
| `deposit` | Additive `amount` and `nativeAmount`; Bundler3/GeneralAdapter1 requirements. | Supply exactly one of `amount` or `nativeAmount`; optionally set `deadline`, `referralFeePct`, and `referralFeeRecipient`. Token requirements authorize VaultBundlesV1 and may return Permit2 SignatureTransfer. |
| `withdraw` | Direct vault withdrawal with no share requirement. | Exact-assets VaultBundlesV1 exit. Optionally set `slippageTolerance`, `deadline`, and referral fields; resolve a vault-share approval or ERC-2612 permit before building. |
| `redeem` | Direct vault redemption with no share requirement. | Exact-shares VaultBundlesV1 exit. Optionally set `deadline` and referral fields; resolve a vault-share approval or ERC-2612 permit before building. |
| `migrateToV2` (Vault V1 only) | Share-denominated Bundler3 migration with a source `minSharePriceVaultV1`. | Keep the existing `shares` mode or supply the new `assets` alternative; remove the source share-price bound; optionally set `slippageTolerance`, `deadline`, and referral fields. Resolve source-vault share authorization before building. The destination deposit retains its onchain maximum-share-price bound. |

`userAddress` now means the account that will submit the transaction. VaultBundlesV1 always deposits
for, burns shares from, and pays `msg.sender`; arbitrary `recipient` and `onBehalf` values are no
longer supported. Keep `userAddress` equal to the eventual signer, including when preparing a
transaction with a public client.

The lazy workflow now applies to Vault V1 exits as well as deposits: await `getRequirements()`, send
any returned approval transactions or collect the returned signature, and pass collected signatures
to `buildTx(signatures)`. Deposit requirement options accept `useSimplePermit` and an explicit
`permit2Nonce`; exit requirements use the vault share token's ERC-2612 permit. The built transaction
targets VaultBundlesV1 rather than Bundler3 or the vault itself.

Pure builder names remain stable, but their `args` objects change:

| Stable builder | v6 `args` fields |
| --- | --- |
| `vaultV1Deposit` | Exclusive `amount`/`nativeAmount`, `maxSharePrice`, `userAddress`, optional bundles token `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1Withdraw` | `amount`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1Redeem` | `shares`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1MigrateToV2` | Exclusive `assets`/`shares`, `targetVault`, `targetAsset`, `maxSharePriceVaultV2`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Deposit` | Exclusive `amount`/`nativeAmount`, `maxSharePrice`, `userAddress`, optional bundles token `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Withdraw` | `amount`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Redeem` | `shares`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |

Every vault builder replaces v5's `recipient` and `onBehalf` with a single `userAddress` that must be
the eventual `msg.sender`, and `vault` now takes `{ chainId, address }` (plus `asset` on the deposit
and migration builders) so the builder can resolve the VaultBundlesV1 address for the target chain.

Vault V1 deposit and migration destination bounds are forecast through the selected deadline, so an
explicit deadline beyond the two-hour default remains covered by the computed maximum share price.

## Update Blue methods

| Stable method | v5 input | v6 input |
| --- | --- | --- |
| `supply` | `amount`/`nativeAmount`, `marketData`, `slippageTolerance` | Rename gross `amount` to `assets`; remove `marketData` and slippage; add required `deadline` plus optional `referralFeePct` and `referralFeeRecipient`. ERC-20 and native funding are now exclusive. |
| `withdraw` | `assets` or `shares`, optional `receiver`, `slippageTolerance`, mixed-version `reallocations` | Keep `assets`/`shares`; remove `receiver` and slippage; use only `VaultV2BlueReallocation`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `supplyCollateral` | `amount` plus optional additive `nativeAmount` | Rename `amount` to `collateralAssets`; make native and ERC-20 funding exclusive; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `borrow` | `amount`, `slippageTolerance`, mixed-version `reallocations` | Rename `amount` to `borrowAssets`; remove slippage; use only `VaultV2BlueReallocation`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `supplyCollateralBorrow` | `amount`, `borrowAmount`, required `positionData`, `slippageTolerance`, mixed-version `reallocations` | Rename the legs to `collateralAssets` and `borrowAssets`; `positionData` is required only when borrowing; use exclusive native funding and V2-only reallocations; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `repay` | `amount` or `shares`, optional additive `nativeAmount`, `slippageTolerance` | Rename the modes to `repayAssets` or `repayShares`; use `maxUint256` shares for a full close; remove slippage; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. Native funding must cover the full derived cap. |
| `withdrawCollateral` | `amount` | Rename `amount` to `collateralAssets`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `repayWithdrawCollateral` | `amount` or `shares`, `withdrawAmount`, optional additive `nativeAmount`, `slippageTolerance` | Rename the repay modes to `repayAssets`/`repayShares` and `withdrawAmount` to `collateralAssets`; remove slippage; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `refinance` | `target`, `collateralAmount`, `borrowAssets`/`borrowShares`, `slippageTolerance`, `targetReallocations` | Rename `target` to `destination`; remove partial-leg amounts and share-price inputs; rename V2-only `targetReallocations` to `reallocations`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. The full live position always moves. |

The two combined methods require at least one non-zero leg. See the dedicated **Blue refinance**
section below for that method's larger shape change.

## Vault V1 and V2 withdrawals

The established `withdraw` methods and the `vaultV1Withdraw` / `vaultV2Withdraw` builder names stay
stable, but now encode one direct VaultBundlesV1 call instead of a direct vault call.

> **Chain availability.** Both entity `withdraw()` methods require `bundles.vaultBundlesV1` and
> throw `UnknownAddressError` synchronously at handle creation on registered chains without it,
> including Fraxtal. Stay on v5 if your application needs withdrawals on an affected chain until
> VaultBundlesV1 is deployed and registered in the SDK, even if your application makes no deposits.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `withdraw` | `amount`, `userAddress` | Keep `amount` and `userAddress`; remove the implicit `recipient` / `onBehalf` (VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`); add optional `slippageTolerance`, `deadline`, and referral-fee fields. |

`withdraw` now returns `{ buildTx, getRequirements }` instead of `{ buildTx }`. VaultBundlesV1 spends
the caller's vault shares, so the withdrawal needs a vault-share allowance for VaultBundlesV1 — a
prerequisite v5 withdrawals did not have. Await `getRequirements()` and satisfy it before calling
`buildTx()`, or the withdrawal reverts:

- Without signature support, it returns one ERC-20 approval transaction to send first.
- With `supportSignature: true`, it returns one signable ERC-2612 shares permit when the current
  allowance is below the cap; pass the signature to `buildTx([sharesPermit])` and it is folded into
  the VaultBundlesV1 call. A larger leftover allowance is always reset with an ERC-20 approval
  transaction instead, because VaultBundlesV1 skips a permit whose nonce was already consumed.

The allowance is the only cap on the burn, since asset-mode calldata carries no maximum-shares
argument. `getRequirements()` therefore derives an exact cap from the vault snapshot, the deadline,
and `slippageTolerance` (default 0.03%), and returns an approval or permit for exactly that amount
whenever the current allowance differs.

`getRequirements()` re-validates the deadline on every call, so a prepared withdrawal reused after
its deadline throws `ExpiredDeadlineError` rather than returning cached prerequisites.

## Blue pure action builder inputs and metadata

Direct action consumers keep the root-barrel builder and parameter-type names, but must replace
their `args` objects as follows. `metadata` is unchanged.

| Stable builder / params | v6 `args` fields |
| --- | --- |
| `blueSupply` / `BlueSupplyParams` | `userAddress`, `assets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueWithdraw` / `BlueWithdrawParams` | `userAddress`, `withdrawAssets`, `withdrawShares`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueSupplyCollateral` / `BlueSupplyCollateralParams` | `userAddress`, `collateralAssets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueBorrow` / `BlueBorrowParams` | `userAddress`, `borrowAssets`, `maxLtv`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueSupplyCollateralBorrow` / `BlueSupplyCollateralBorrowParams` | `userAddress`, `collateralAssets`, `borrowAssets`, `maxLtv`, optional `nativeAmount`/V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, `requirementSignature`, and `authorizationSignature`. |
| `blueRepay` / `BlueRepayParams` | `userAddress`, `repayAssets`, `repayShares`, `maxRepayAssets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueWithdrawCollateral` / `BlueWithdrawCollateralParams` | `userAddress`, `collateralAssets`, `maxLtv`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueRepayWithdrawCollateral` / `BlueRepayWithdrawCollateralParams` | `userAddress`, `repayAssets`, `repayShares`, `maxRepayAssets`, `collateralAssets`, `maxLtv`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, `requirementSignature`, and `authorizationSignature`. |
| `blueRefinance` / `BlueRefinanceParams` | `userAddress`, `maxLtv`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`; replace `source`/`target` with `market: { chainId, sourceMarketParams, destinationMarketParams }`. |

The transaction metadata exports and discriminator strings stay stable; their argument fields change
as below. The table lists only the delta: unchanged fields are retained and omitted. In particular
every Blue action keeps its `market` (`Hex` market id) field, so a strict decoder must keep matching
it alongside the added fields.

| Stable action type / discriminator | Removed v5 `action.args` fields | Changed / added v6 `action.args` fields |
| --- | --- | --- |
| `BlueSupplyAction` / `"blueSupply"` | `amount`, `maxSharePrice` | `assets`, `onBehalf`, optional `nativeAmount`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |
| `BlueWithdrawAction` / `"blueWithdraw"` | `assets`, `shares`, `receiver`, `minSharePrice`, `reallocationFee` | `withdrawAssets`, `withdrawShares`, `onBehalf`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |
| `BlueSupplyCollateralAction`, `BlueBorrowAction`, `BlueSupplyCollateralBorrowAction` | `amount`, `collateralAmount`, `borrowAmount`, `receiver`, `minSharePrice`, `reallocationFee` | All three use the combined shape: `collateralAssets`, `borrowAssets`, `maxLtv`, `onBehalf`, optional `nativeAmount`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`; an inactive simple-method leg is zero. |
| `BlueRepayAction`, `BlueWithdrawCollateralAction`, `BlueRepayWithdrawCollateralAction` | `amount`, `shares`, `transferAmount`, `withdrawAmount`, `receiver`, `maxSharePrice` | All three use the combined shape: `repayAssets`, `repayShares`, `maxRepayAssets`, `collateralAssets`, `maxLtv`, `onBehalf`, optional `nativeAmount`, `referralFeePct`, `referralFeeRecipient`, `deadline`; inactive simple-method legs are zero. |
| `BlueRefinanceAction` / `"blueRefinance"` | `targetMarket`, `collateralAmount`, `borrowAssets`, `borrowShares`, borrow/repay share-price bounds, `user`, `reallocationFee` | `sourceMarket`, `destinationMarket`, `maxLtv`, `onBehalf`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |

`RepayAmountArgs` and `RepayActionAmountArgs` are removed. Use the mutually exclusive
`repayAssets` / `repayShares` fields on the replacement method or builder instead.

## Update write inputs

- Remove Blue `slippageTolerance`, `minSharePrice`, and `maxSharePrice` inputs. BlueBundlesV1 does
  not expose the Bundler3 share-price checks. Vault deposit slippage protection is unchanged.
- Remove Blue `receiver`, `to`, and arbitrary `onBehalf` overrides. BlueBundlesV1 operates on the
  transaction sender and sends proceeds and refunds back to that sender; `userAddress` must be the
  eventual sender used to resolve requirements and position snapshots.
- Replace PublicAllocator V1 or mixed-version reallocation write inputs with Vault V2
  `VaultV2BlueReallocation` inputs. Vault V1 reallocation planning, data, input, validation, and
  explicit low-level Bundler3-composition surfaces are removed in v6. Direct Vault V1 vault
  operations (`deposit`, `withdraw`, `redeem`, `migrateToV2`, `inKindRedeem`) remain; allocator-specific
  raw exports are gone.
- Provide the BlueBundlesV1 execution deadline and any optional referral-fee configuration through
  the new typed method inputs. Share-mode repayment deadlines are limited to two hours so the SDK's
  derived `maxRepayAssets` remains sufficient through execution.
- Treat `supply` assets as gross funding: referral fees reduce assets supplied. Allocator penalties
  and referral fees similarly affect proceeds or destination debt on the other operations.
- For native funding, the funded token must be the chain's wNative. Native and ERC-20 funding are
  not additive on the direct BlueBundlesV1 call.

Borrow, collateral-withdraw, and migration legs retain the SDK's buffered LLTV validation. Pure
collateral supply and pure repay intentionally disable the onchain LTV cap so they can improve an
already-unhealthy position.

## Update requirements and transaction handling

The lazy workflow is unchanged: await `getRequirements()`, satisfy approval transactions, collect
signatures, then pass the signatures to synchronous `buildTx(signatures)`.

The destinations are different:

- Classic ERC-20 approvals and ERC-2612 permits now authorize BlueBundlesV1.
- Permit2 keeps its ERC-20 approval on canonical Permit2, but the SignatureTransfer payload names
  BlueBundlesV1 as spender. The SDK resolves the lowest unused Permit2 nonce by default — see the
  subsection below.
- Morpho authorization now grants BlueBundlesV1 operator rights instead of GeneralAdapter1.
- Without signature support, full-repay requirements approve exactly the derived `maxRepayAssets`
  funding cap; pass `approvalAmount` to `getRequirements()` to keep a reusable allowance.
  BlueBundlesV1 still refunds unused transaction funding.
- The built transaction's `to` is BlueBundlesV1, not Bundler3, and calldata contains one fixed
  BlueBundlesV1 entrypoint rather than a `BundlerAction[]` multicall.

Update simulations and analytics for the v6 action-field changes. Do not assert
Bundler3/GeneralAdapter1 destinations or inspect Bundler3 sub-actions for these
high-level writes.

### Permit2 SignatureTransfer resolves the nonce automatically

SignatureTransfer consumes an owner-global unordered nonce rather than an allowance. For a client
with `supportSignature: true`, the default supply requirement path selects Permit2 and
`supply(...).getRequirements()` resolves the lowest unused nonce for `userAddress` automatically — no
nonce argument is required:

```ts
const requirements = await market
  .supply({ userAddress, assets, deadline })
  .getRequirements();
```

Pass `getRequirements({ permit2Nonce })` to pin an explicit `uint256` whose Permit2 `nonceBitmap` bit
is still unset for `userAddress` (each nonce is single-use; a consumed one throws
`Permit2SignatureTransferNonceAlreadyUsedError`). An owner whose every nonce at or after the scan
start is consumed throws `NoUnusedPermit2NonceError`. To skip Permit2 for ERC-2612 tokens, pass
`getRequirements({ useSimplePermit: true })`, which prefers a one-signature ERC-2612 permit and needs
no nonce.

### Signature requirements expose `action.typedData`; low-level encoders take `owner`

Every signable requirement action (`PermitAction`, `Permit2SignatureTransferAction`,
`AuthorizationAction`, `MidnightOfferRootSignatureAction`) now carries the deep-frozen EIP-712
payload that `sign()` signs, so it can be inspected or displayed before signing:

```ts
const requirement = (await output.getRequirements()).find(isRequirementSignature);
if (requirement == null) return; // nothing to sign (only on-chain approvals, or none)

const typedData = requirement.action.typedData; // exact EIP-712 payload `sign()` will sign
const signed = await requirement.sign(walletClient, owner);
const tx = output.buildTx([signed]); // Midnight outputs take the single signature instead
```

`requirement.action.typedData` is typed as required on a `Requirement`, so no null check is needed.
It is the exact `TypedDataDefinition` that `sign()` signs; signing itself still goes through
`Requirement.sign(client, userAddress)`.

Because the permit and authorization payloads embed the owner and are built eagerly, two exported
low-level encoders take a new required `owner` parameter. Their `sign(client, userAddress)` rejects
a `userAddress` different from `owner` with `AddressMismatchError`.

| v5 call | v6 call |
| --- | --- |
| `encodeErc20Permit(client, { token, spender, amount, chainId, nonce })` | `encodeErc20Permit(client, { token, owner, spender, amount, chainId, nonce })` |
| `encodeBlueSignatureAuthorization(client, { authorized, isAuthorized, chainId, nonce })` | `encodeBlueSignatureAuthorization(client, { owner, authorized, isAuthorized, chainId, nonce })` |

High-level entity flows (`client.morpho.blue(...)`, vault deposits, Midnight) already supply the
owner and need no changes.

## Blue refinance

The `refinance` entity method and the `blueRefinance` pure builder keep their names but now call
BlueBundlesV1's full-position migration entrypoint. Both drop partial and collateral-only migration:
the full live source debt and collateral always move, the source and destination markets must use the
same loan and collateral tokens and must not be the same market, and Morpho authorization targets
BlueBundlesV1.

`userAddress` must be the account that sends the transaction and, when used, signs the Morpho
authorization. BlueBundlesV1 migration calldata carries no owner field and always migrates
`msg.sender`; a supplied authorization signature is likewise bound to that sender. Unlike the v5
Bundler3 route (where `args.user` was encoded as `onBehalf` in every leg), a relayer can no longer
migrate a third party's position. Builders cannot enforce that `userAddress` matches the sender; a
mismatch does not itself revert, and BlueBundlesV1 still migrates `msg.sender`. The SDK uses
`userAddress` only to validate snapshots, build the authorization requirement, and populate action
metadata.

`market.refinance(...)` (entity method):

- Rename `target` to `destination`.
- Remove `collateralAmount`, `borrowAssets`, `borrowShares`, slippage, and share-price bounds.
- Rename V2-only `targetReallocations` to `reallocations`.
- Add `deadline` and optional referral-fee fields.
- Pass source and destination position snapshots.

`blueRefinance(...)` (pure builder):

- Replace the top-level `{ source: { chainId, marketParams }, target: { marketParams } }` shape with
  `{ market: { chainId, sourceMarketParams, destinationMarketParams } }`.
- Rename `args.user` to `args.userAddress` and supply `args.maxLtv` (the buffered destination LTV).
- Remove `args.collateralAmount`, `args.borrowAssets`, `args.borrowShares`,
  `args.minBorrowSharePrice`, and `args.maxRepaySharePrice`.
- Rename `args.targetReallocations` to `args.reallocations`.
- Add `args.deadline` and optional referral-fee fields.

The action metadata replaces `targetMarket`, partial-leg amounts, user, share-price bounds, and the
V1 fee with `destinationMarket`, `maxLtv`, `onBehalf`, a reallocation count and penalty total,
referral-fee fields, and `deadline`.

Stay on v5 if the product requires partial or collateral-only refinance behavior.

The partial-migration error classes `BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, and `RefinanceSharesMissingBorrowAssetsError` are removed. They
were never thrown by the full-position route. This removal did not receive a published deprecation
window; remove pattern-matching branches for these errors or stay on v5. The full-position route
validates snapshot ownership and token/market compatibility, accounts for reallocation penalties in
destination debt, then checks the combined destination position against the buffered LLTV
(`BorrowExceedsSafeLtvError`); `RefinanceSameMarketError` and `RefinanceTokenMismatchError` stay.

## Removed action-output field: `reallocationFee`

`BlueBorrowAction`, `BlueWithdrawAction`, `BlueSupplyCollateralBorrowAction`, and
`BlueRefinanceAction` no longer expose `reallocationFee` in `action.args`. That field only ever
carried Vault V1 native PublicAllocator fees, which high-level writes no longer emit. Read
`reallocationPenaltyAssets` for the loan-token penalty donated by Vault V2 BluePublicAllocator
reallocations.

## Removed type: `BlueReallocationPlan`

The `BlueReallocationPlan` union is removed. High-level Blue write inputs accept
`Iterable<VaultV2BlueReallocation>` directly. Stay on v5 if explicit PublicAllocator V1 planning or
Bundler3 composition is required.

## Removed deprecated compatibility exports

Version 6 removes all deprecated compatibility exports, including names first deprecated only in a
v6 prerelease:

- Ambiguous unprefixed Blue and Midnight facade aliases are removed. Use the `Blue*` / `Midnight*`
  names from shared facade subpaths or canonical names from `/blue/*` and `/midnight/*`.
- Operation-specific scalar and native-asset error aliases are removed. Pattern-match on the
  current generic input errors and canonical native-asset error classes.
- `InvalidReallocationShapeError` is removed. Use `InvalidVaultV2BlueReallocationShapeError` for
  malformed Vault V2 entries.
- Deprecated ABI, constant, typed-data helper, and utility-type aliases inherited from upstream
  packages are removed. Import their canonical replacements from the same facade category.
- The deprecated `getDaiPermitTypedData` and `DaiPermitArgs` exports are removed from both the root
  and raw `/blue` facades. Maintained action flows route DAI approvals through Permit2 or a classic
  approval.
- PublicAllocator V1 addresses, ABIs, configs, fetchers, augmentation, planner, data, input,
  validation, and Bundler3-composition symbols are removed.
  Use `getVaultV2BlueReallocationData` and
  `VaultV2BlueReallocationData.computeVaultV2BlueReallocations`.
- In-kind, fixed-bundles, referral-fee, and Permit2 compatibility errors are removed. Use
  `VaultV2SingleAdapterRequiredError`, `VaultV2UnsupportedExitAdapterError`,
  `BundlesPermitMismatchError`, `BundlesRequirementSignatureMismatchError`,
  `Permit2SignatureTransferNonceAlreadyUsedError`, and `ReferralFeeRecipientMissingError`.
- `UnsupportedRequirementSignatureError` is thrown by `selectRequirementSignatures` and
  `getBundlesTokenPermit` when a requirement signature carries an action type the v6 flows do not
  support, such as a stale v5 `permit2` signature. `getBundlesTokenPermit` previously threw
  `UnexpectedRequirementSignatureError("permit")` for that case.
- `getVaultExitBundlesV1PermitStruct` and its parameter/result types are removed. Use
  `getBundlesSharesPermit` and `BundleSharesPermit`.

Direct Vault V1 actions remain. Vault V1 PublicAllocator compatibility does not.

Several compatibility names above, including the partial-refinance errors, did not complete a
published deprecation window. Their v6 removal is intentional; stay on v5 if migration cannot be
completed atomically.

## Removed without a deprecation window

The stable low-level Bundler3 and migration-adapter surfaces, including their registry and ABI
re-exports, compatibility errors, signature helpers and types, the WDK requirement alias, and the
five v5 partial-refinance error classes were removed without a published deprecation window. This
is an intentional one-time lifecycle deviation; migrate to the standalone bundle actions and
canonical exports, or stay on v5.

## Removed low-level Bundler3 and migration surfaces

Version 6 removes the low-level Bundler3 action composer, executor and adapter ABIs, Bundler3-only
requirements and signature helpers, and related action, signature, and error types. It also removes
the residual Aave and Compound migration-adapter ABIs left after `migration-sdk-viem` was retired,
plus the legacy MORPHO token-wrapper ABI entries. Use the fixed standalone BlueBundlesV1,
VaultBundlesV1, and VaultExitBundlesV1 actions for supported SDK workflows.

These low-level surfaces were not deprecated in a published v5 minor. Their removal is an
intentional one-time lifecycle deviation; integrations that still compose arbitrary Bundler3 calls
must stay on v5 or encode against the contracts independently.

## Vault V2 `forceWithdraw`

`MorphoVaultV2.forceWithdraw` and the pure `vaultV2ForceWithdraw` action now route through the
standalone `VaultExitBundlesV1` periphery instead of a `VaultV2.multicall` of caller-supplied
`forceDeallocate` calls. The contract computes its own deallocations and bounds the realized exit
share price. `forceRedeem` is unchanged and stays on the vault multicall.

| Was (v5) | Now (v6) |
| --- | --- |
| `forceWithdraw({ deallocations, withdraw: { amount }, userAddress })` | `forceWithdraw({ exitAssets, vaultData, userAddress, adapter?, deadline?, slippageTolerance?, minSharePriceE27?, referralFeePct?, referralFeeRecipient? })` |
| Returns `{ buildTx }` | Returns an `ActionOutput` — `{ getRequirements(), buildTx(signatures?) }` (`buildTx` stays synchronous) |
| `withdraw.amount` was the net payout | `exitAssets` is **penalty-inclusive**; quote the split with the new `previewVaultV2ForceWithdraw` |
| `tx.to` is the vault | `tx.to` is `VaultExitBundlesV1` |
| No approval needed (the vault burned `msg.sender`'s own shares) | A vault-share allowance or ERC-2612 permit **to `VaultExitBundlesV1`** is now required |

### Pure action

The pure action's call shape changes alongside the entity method:

```ts
// v5
vaultV2ForceWithdraw({
  vault: { address: vaultAddress },
  args: {
    deallocations: [{ adapter, marketParams, amount: 500_000n }],
    withdraw: { amount: 500_000n, recipient },
    onBehalf,
  },
});

// v6
vaultV2ForceWithdraw({
  vault: { chainId, address: vaultAddress },
  args: {
    adapter,
    exitAssets: 500_000n,
    minSharePriceE27,
    userAddress,
    deadline,
  },
});
```

`chainId` is now required so the action can resolve the registered periphery address and apply
`chainId` validation.

Migration steps:

- Fetch a `vaultData` snapshot (`vault.getData()`) and pass it in. The vault must have exactly one
  `MorphoMarketV1AdapterV2` and route liquidity through that same adapter or none; multi-adapter and
  legacy-adapter vaults must use `forceRedeem` or a plain `withdraw`.
- Convert your net-payout amount to a penalty-inclusive `exitAssets` and drop the caller-supplied
  `deallocations` and market ordering — the contract derives them.
- Resolve `getRequirements()` before `buildTx()` to obtain the new vault-share approval or permit to
  `VaultExitBundlesV1`, and make sure the vault's `receiveAssetsGate` allows that periphery.
- Update `VaultV2ForceWithdrawAction` decoding: `deallocations` and `withdraw` are gone; `adapter`,
  `exitAssets`, `minSharePriceE27`, `referralFeePct`, `referralFeeRecipient`, and `deadline` are new.
- Stop batching exits: only one VaultExitBundlesV1 call can execute per transaction, because its
  `initiator` guard is transient and never cleared.
- Replace `InKindRedeemRequiresSingleAdapterError` and `UnsupportedInKindAdapterError` with
  `VaultV2SingleAdapterRequiredError` and `VaultV2UnsupportedExitAdapterError`.

See the [`TIB-2026-08-28-vault-exit-force-withdraw`](https://github.com/morpho-org/sdks/blob/main/docs/tibs/TIB-2026-08-28-vault-exit-force-withdraw.md)
decision record for the full rationale.

## Update Vault V1 and Vault V2 writes

Vault V1 and Vault V2 keep their existing `deposit`, `withdraw`, and `redeem` names, while Vault V1
keeps `migrateToV2`. In v6 these methods encode one direct `VaultBundlesV1` call instead of a direct
ERC-4626 call or Bundler3 multicall.

- Deposits accept exactly one of `amount` and `nativeAmount`. Split a former additive ETH + WETH
  deposit into two transactions. Classic approvals and ERC-2612 permits now authorize
  VaultBundlesV1; Permit2 uses SignatureTransfer with a nonce the SDK resolves by default (pass
  `permit2Nonce` to override).
- Remove `recipient` from deposits and remove `recipient` and `onBehalf` from exits. VaultBundlesV1
  always operates for and pays `msg.sender`. `userAddress` now means the account that must submit the
  transaction. A connected builder account may prepare a transaction for a different submitter;
  identity-bound signature helpers still enforce `userAddress` when signing.
- `withdraw` and `redeem` now return a full `ActionOutput`. Call `getRequirements()` and satisfy the
  exact vault-share approval or ERC-2612 permit before calling `buildTx(signatures)`.
- Vault calls gain `deadline`, `referralFeePct`, and `referralFeeRecipient`. Entity deadlines default
  to two hours; pure builder callers provide them explicitly. Amounts remain gross, and fixed-asset
  action metadata reports `referralFeeAssets` and `netAssets`.
- `migrateToV2` accepts exactly one of `assets` and `shares`, removes `recipient` and source
  `minSharePriceVaultV1`, and retains only the destination `maxSharePriceVaultV2` bound.

VaultBundlesV1 permits only one call to itself in a transaction. Do not put two vault calls into one
Safe multisend or EIP-5792 batch; use `migrateToV2` for an atomic V1-to-V2 move. Permissioned Vault
V2 deployments must allow VaultBundlesV1 in both send-assets and receive-assets gates. Because gates
can inspect the bundle's transient initiator, validate them by simulating the finalized transaction
after satisfying requirements rather than by pre-reading the gate.

```ts
const withdrawal = vault.withdraw({ amount, userAddress });
const signatures = [];
for (const requirement of await withdrawal.getRequirements()) {
  if ("sign" in requirement) {
    signatures.push(await requirement.sign(walletClient, userAddress));
  } else {
    const hash = await walletClient.sendTransaction(requirement);
    await publicClient.waitForTransactionReceipt({ hash });
  }
}
const transaction = withdrawal.buildTx(signatures);
```

## Upgrade checklist

- Confirm `bundles.vaultBundlesV1` coverage for vault deposits and withdrawals and
  `bundles.blueBundlesV1` coverage for Blue writes on every chain your application supports.
  Stay on v5 if you need vault deposits or withdrawals on a chain without VaultBundlesV1.
- Update every Blue write call using the table above; method names remain stable.
- Remove Blue slippage and PublicAllocator V1 write inputs.
- Replace deprecated facade, error, and upstream aliases with their canonical exports.
- Remove low-level Bundler3 composers, migration-adapter ABIs, and legacy MORPHO wrapping imports.
- Re-run approval and Morpho-authorization setup against the new spender/operator.
- Update transaction decoding, simulation fixtures, and action metadata fields; the `type`
  discriminators remain stable, including `"vaultV2ForceWithdraw"`.
- Test native funding, full repay, and full-position migration paths used by the application.
- Migrate Vault V2 `forceWithdraw` to the penalty-inclusive `exitAssets` + `vaultData` shape,
  resolve its new `getRequirements()`, and authorize vault shares to `VaultExitBundlesV1`.
- Test the multi-adapter and legacy-adapter `forceWithdraw` fallbacks (`forceRedeem` / plain
  `withdraw`) used by the application.

## Fixed-bundles token requirement APIs

The Blue-only fixed-bundles requirement surface is generalized into a shared surface used by both
BlueBundlesV1 and VaultBundlesV1.

| v5 symbol | v6 replacement |
| --- | --- |
| `getBlueBundlesV1TokenRequirements` (action-layer) | `getBundlesTokenRequirements` (entity-layer; reads state, so it now lives under `entities/requirements` instead of `actions/requirements/blue`). Takes the same funding parameters plus a `spender` naming the registered fixed bundles deployment (BlueBundlesV1 or VaultBundlesV1). |
| `BlueBundlesV1TokenSignatureRequirement` / `BlueBundlesV1TokenRequirementSignature` | `BundlesTokenSignatureRequirement` / `BundlesTokenRequirementSignature` |
| `encodeErc20Permit2TransferFrom` | `encodeErc20Permit2SignatureTransfer` |
| Action discriminator `"permit2TransferFrom"` | `"permit2SignatureTransfer"` |
| `Permit2TransferFromAction` / `Permit2TransferFromRequirementSignature` | `Permit2SignatureTransferAction` / `Permit2SignatureTransferRequirementSignature` |
| `isPermit2TransferFromSignature` | `isPermit2SignatureTransferSignature` |
| `selectRequirementSignatures` option and result field `permit2TransferFrom` | `permit2SignatureTransfer` |
| `MissingPermit2TransferFromNonceError` | Removed — the nonce is resolved automatically; catch `NoUnusedPermit2NonceError` only if every nonce is consumed |
| `Permit2TransferFromNonceAlreadyUsedError` | `Permit2SignatureTransferNonceAlreadyUsedError` |

Update call sites and `switch`/discriminated-union checks on `action.type` to the new
`"permit2SignatureTransfer"` tag; the signed payload shape (`nonce`, `deadline`, `signature`) is
unchanged.
