# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 keeps the Blue entity at `client.morpho.blue(marketParams, chainId)` and preserves its
write-method names while routing them through five direct BlueBundlesV1 entrypoints. Blue reads and
versioned reallocation-data helpers remain on the same entity. There is no parallel BlueBundlesV1
extension or automatic fallback to the v5 route. Version 6 also reshapes Vault V2 `forceWithdraw`
to route through the standalone `VaultExitBundlesV1` periphery. This guide covers both breaking
changes; other v6 breaks are documented by their own changesets as they land.

> **Chain availability.** The direct BlueBundlesV1 route requires the `bundles.blueBundlesV1`
> deployment on the target chain. On a registered chain without it (the previous Bundler3-routed
> flows covered more chains), **every** Blue write — `supply`, `supplyCollateral`, `borrow`,
> `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `withdraw`, and
> `refinance` — throws `UnknownAddressError` synchronously at handle creation (via
> `validateWriteCommon`). Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.blueBundlesV1 != null`.

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

## Update pure action builder inputs and metadata

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
  `VaultV2BlueReallocation` inputs. All Vault V1 reallocation planning, data, input, validation,
  and explicit low-level Bundler3-composition surfaces remain available only as deprecated
  compatibility surfaces and will be removed in the next major; the high-level Blue writes do not
  accept their outputs.
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
  BlueBundlesV1 as spender. Explicit Permit2 nonces are now required — see the subsection below.
- Morpho authorization now grants BlueBundlesV1 operator rights instead of GeneralAdapter1.
- Without signature support, saturated full-repay requirements use the token's reusable maximum
  allowance so a later bounded debt quote remains covered; BlueBundlesV1 still refunds unused
  transaction funding.
- The built transaction's `to` is BlueBundlesV1, not Bundler3, and calldata contains one fixed
  BlueBundlesV1 entrypoint rather than a `BundlerAction[]` multicall.

Update simulations and analytics for the v6 action-field changes. Do not assert
Bundler3/GeneralAdapter1 destinations or inspect Bundler3 sub-actions for these
high-level writes.

### Permit2 SignatureTransfer requires an explicit nonce

SignatureTransfer consumes an owner-global unordered nonce rather than an allowance, so the SDK no
longer allocates one implicitly. For a client with `supportSignature: true`, the default supply
requirement path selects Permit2 and `supply(...).getRequirements()` now throws
`MissingPermit2TransferFromNonceError` when no nonce is supplied. Pass an unused nonce explicitly:

```ts
const requirements = await market
  .supply({ userAddress, assets, deadline })
  .getRequirements({ permit2Nonce });
```

Allocate any `uint256` whose Permit2 `nonceBitmap` bit is still unset for `userAddress` (each nonce
is single-use; a consumed one throws `Permit2TransferFromNonceAlreadyUsedError`). To skip Permit2
for ERC-2612 tokens, pass `getRequirements({ useSimplePermit: true })`, which prefers a one-signature
ERC-2612 permit and needs no nonce.

## Blue refinance

The `refinance` entity method and the `blueRefinance` pure builder keep their names but now call
BlueBundlesV1's full-position migration entrypoint. Both drop partial and collateral-only migration:
the full live source debt and collateral always move, the source and destination markets must use the
same loan and collateral tokens and must not be the same market, and Morpho authorization targets
BlueBundlesV1.

`userAddress` must be the account that signs the Morpho authorization **and** sends the transaction.
The BlueBundlesV1 migration calldata carries no owner field: it migrates the position of the
authorization signer, which the contract binds to `msg.sender`. Unlike the v5 Bundler3 route (where
`args.user` was encoded as `onBehalf` in every leg), a relayer can no longer migrate a third party's
position — supplying a `userAddress` other than the sender reverts on-chain. On-behalf refinance is no
longer supported; the SDK uses `userAddress` only to build the authorization requirement and action
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
`RefinanceExceedsBorrowAssetsError`, and `RefinanceSharesMissingBorrowAssetsError` are **deprecated,
not removed**: they stay exported through v6 (marked `@deprecated`) for consumers pattern-matching on
the v5 surface, are never thrown by the full-position route, and are removed in the next major. The
full-position route validates ownership and token/market compatibility, rejects a reallocation plan
whose rounded aggregate penalty exceeds the migrated source debt (`InputExceedsMaxError`), then checks
the combined destination position against the buffered LLTV (`BorrowExceedsSafeLtvError`);
`RefinanceSameMarketError` and `RefinanceTokenMismatchError` stay.

## Removed action-output field: `reallocationFee`

`BlueBorrowAction`, `BlueWithdrawAction`, `BlueSupplyCollateralBorrowAction`, and
`BlueRefinanceAction` no longer expose `reallocationFee` in `action.args`. That field only ever
carried Vault V1 native PublicAllocator fees, which high-level writes no longer emit. Read
`reallocationPenaltyAssets` for the loan-token penalty donated by Vault V2 BluePublicAllocator
reallocations.

## Removed type: `BlueReallocationPlan`

The `BlueReallocationPlan` union is removed. High-level Blue write inputs accept
`Iterable<VaultV2BlueReallocation>` directly; for explicit low-level Vault V1 composition, use
`VaultV1Reallocation[]`.

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
- `InKindRedeemRequiresSingleAdapterError` and `UnsupportedInKindAdapterError` are deprecated aliases
  of `VaultV2SingleAdapterRequiredError` and `VaultV2UnsupportedExitAdapterError`; `instanceof` keeps
  working for both names.

See the `vault-v2-force-withdraw-via-vault-exit-bundles` changeset and
`docs/tibs/TIB-2026-08-28-vault-exit-force-withdraw.md` for the full record.

## Upgrade checklist

- Update every Blue write call using the table above; method names remain stable.
- Remove Blue slippage and PublicAllocator V1 write inputs.
- Re-run approval and Morpho-authorization setup against the new spender/operator.
- Update transaction decoding, simulation fixtures, and action metadata fields; discriminator
  names remain stable, including `VaultV2ForceWithdrawAction`.
- Test native funding, full repay, and full-position migration paths used by the application.
- Migrate Vault V2 `forceWithdraw` to the penalty-inclusive `exitAssets` + `vaultData` shape,
  resolve its new `getRequirements()`, and authorize vault shares to `VaultExitBundlesV1`.
- Test the multi-adapter and legacy-adapter `forceWithdraw` fallbacks (`forceRedeem` / plain
  `withdraw`) used by the application.
