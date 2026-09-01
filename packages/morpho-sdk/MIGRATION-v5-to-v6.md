# Migrating morpho-sdk v5 to v6

## Vault V2-only Blue write reallocations

High-level `borrow`, `withdraw`, `supplyCollateralBorrow`, and `refinance` inputs now accept only
`VaultV2BlueReallocation` entries. Replace Vault V1 write inputs with reallocations returned by
`getVaultV2BlueReallocations()`.

Vault V1 data fetchers, planners, types, and explicit low-level Bundler3 composition remain
available. Use them only when constructing Bundler3 calls directly.

## Blue supply and withdraw

The established `supply` and `withdraw` methods and pure builder names stay stable, but now encode
one direct BlueBundlesV1 call.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `supply` | `amount`, `marketData`, optional additive `nativeAmount`, `slippageTolerance` | Rename `amount` to `assets`; remove `marketData` and slippage; add required `deadline` and optional referral-fee fields. Native and ERC-20 funding are exclusive. |
| `withdraw` | `assets` or `shares`, optional `receiver`, `slippageTolerance`, `reallocations` | Keep the amount modes; remove `receiver` and slippage; add required `deadline` and optional referral-fee fields. |

`blueSupply` and `blueWithdraw` keep their names, but their `args` and action metadata use the new
BlueBundlesV1 fields. Supply approvals and permits target BlueBundlesV1. Withdraw authorization
also targets BlueBundlesV1, and proceeds always return to the transaction sender.

> **Chain availability.** The direct BlueBundlesV1 route requires the `bundles.blueBundlesV1`
> deployment on the target chain. On a registered chain without it (the previous Bundler3-routed
> flows covered more chains), **every** Blue write — `supply`, `supplyCollateral`, `borrow`,
> `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `withdraw`, and
> `refinance` — throws `UnknownAddressError` synchronously at handle creation (via
> `validateWriteCommon`). Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.blueBundlesV1 != null`.

Permit2 uses SignatureTransfer for these direct token pulls: its ERC-20 prerequisite still targets
canonical Permit2, while the signed payload names BlueBundlesV1 as spender.

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

## Blue collateral, borrow, repay, and collateral withdrawal

The six established methods below now map to the two BlueBundlesV1 combined entrypoints. Simple
methods set their inactive leg to zero.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `supplyCollateral` | `amount`, optional additive `nativeAmount` | Rename `amount` to `collateralAssets`; add `deadline` and optional referral-fee fields; native and ERC-20 funding are exclusive. |
| `borrow` | `amount`, `slippageTolerance`, `reallocations` | Rename `amount` to `borrowAssets`; remove slippage; add `deadline` and optional referral-fee fields. |
| `supplyCollateralBorrow` | `amount`, `borrowAmount`, required `positionData`, `slippageTolerance`, `reallocations` | Rename the legs to `collateralAssets` and `borrowAssets`; require `positionData` only for a non-zero borrow; remove slippage; add `deadline` and optional referral-fee fields. |
| `repay` | `amount` or `shares`, optional additive `nativeAmount`, `slippageTolerance` | Use `repayAssets` or `repayShares`; remove slippage; add `deadline` and optional referral-fee fields. Native funding covers the full derived cap. |
| `withdrawCollateral` | `amount` | Rename `amount` to `collateralAssets`; add `positionData`, `deadline`, and optional referral-fee fields. |
| `repayWithdrawCollateral` | repay `amount` or `shares`, `withdrawAmount`, optional additive `nativeAmount`, `slippageTolerance` | Use `repayAssets` or `repayShares`, rename `withdrawAmount` to `collateralAssets`, remove slippage, and add `deadline` plus optional referral-fee fields. |

`blueSupplyCollateral`, `blueBorrow`, and `blueSupplyCollateralBorrow` keep their names and share the
combined action shape: `collateralAssets`, `borrowAssets`, `maxLtv`, `onBehalf`, optional native
funding and V2 reallocations, referral-fee fields, and `deadline`.

`blueRepay`, `blueWithdrawCollateral`, and `blueRepayWithdrawCollateral` also keep their names and
share one combined action shape: `repayAssets`, `repayShares`, `maxRepayAssets`,
`collateralAssets`, `maxLtv`, `onBehalf`, optional native funding, referral-fee fields, and
`deadline`. Full repay uses saturated `repayShares`; share-mode deadlines are limited to the SDK's
two-hour funding quote horizon.

Token funding and Morpho authorization target BlueBundlesV1. Borrow and collateral-withdraw legs
retain the buffered LLTV guard. Pure collateral supply and pure repay disable the onchain LTV cap
so they can improve an unhealthy position.

`RepayAmountArgs` and `RepayActionAmountArgs` are removed; use the mutually exclusive
`repayAssets` / `repayShares` fields instead.

## Blue refinance

`refinance` and `blueRefinance` keep their names but now call BlueBundlesV1's full-position
migration entrypoint.

- Rename `target` to `destination`.
- Remove `collateralAmount`, `borrowAssets`, `borrowShares`, slippage, and share-price bounds.
- Rename V2-only `targetReallocations` to `reallocations`.
- Add `deadline` and optional referral-fee fields.
- Pass source and destination position snapshots; the markets must use the same loan and collateral
  tokens and must not be the same market.

The action metadata replaces `targetMarket`, partial-leg amounts, user, share-price bounds, and the
V1 fee with `destinationMarket`, `maxLtv`, `onBehalf`, a reallocation count and penalty total,
referral-fee fields, and `deadline`.

The full live source debt and collateral always move, and Morpho authorization targets
BlueBundlesV1. Stay on v5 if the product requires partial or collateral-only refinance behavior.

The partial-migration error classes `BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, and `RefinanceSharesMissingBorrowAssetsError` are removed. The
full-position route validates ownership and token/market compatibility, then checks the combined
destination position against the buffered LLTV (`BorrowExceedsSafeLtvError`); `RefinanceSameMarketError`
and `RefinanceTokenMismatchError` stay.

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
