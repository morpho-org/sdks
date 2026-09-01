# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 keeps the Blue entity at `client.morpho.blue(marketParams, chainId)` and preserves its
write-method names while routing them through five direct BlueBundlesV1 entrypoints. Blue reads and
versioned reallocation-data helpers remain on the same entity. There is no parallel BlueBundlesV1
extension or automatic fallback to the v5 route.

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

The two combined methods require at least one non-zero leg. `refinance` supports only a
full debt-and-collateral migration between markets with the same loan and collateral tokens. Stay
on v5 if the product requires partial or collateral-only refinance behavior.

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

The transaction metadata exports and discriminator strings stay stable; their argument fields change:

| Stable action type / discriminator | Removed v5 `action.args` fields | v6 `action.args` fields |
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

## Upgrade checklist

- Update every Blue write call using the table above; method names remain stable.
- Remove Blue slippage and PublicAllocator V1 write inputs.
- Re-run approval and Morpho-authorization setup against the new spender/operator.
- Update transaction decoding, simulation fixtures, and action metadata fields; discriminator
  names remain stable.
- Test native funding, full repay, and full-position migration paths used by the application.
