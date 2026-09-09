[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueRefinance

# Function: blueRefinance()

> **blueRefinance**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRefinanceAction`](../interfaces/BlueRefinanceAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:153](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L153)

Prepares an atomic refinance migrating a Morpho Blue position to another market on the same
chain that shares the same loan and collateral tokens.

Strategy: flash-collateral via the target's `onMorphoSupplyCollateral` callback. The collateral
is credited before the deferred `safeTransferFrom`, so inside the callback GA1 borrows on the
target, repays the source, then withdraws the source collateral to settle the transfer.

Bundle shape (callback contents depend on borrow mode):

```text
// optional targetReallocations run first:
reallocateTo(...) | reallocate(...) | allocateFromIdle(...),

morphoSupplyCollateral(target, collateralAmount, user, [
  // omitted in collat-only mode
  morphoBorrow(target, borrowAssets, 0, minBorrowSharePrice, GA1),
  morphoRepay(source, assets|0, 0|shares, maxRepaySharePrice, user, []),
  // shares mode only: sweep overshoot before the withdraw so same-token markets aren't drained
  morphoRepay(target, maxUint256, 0, maxUint256, user, [], skipRevert=true),
  // shares mode only: fallback if the repay is skipped, skim residual loan tokens to the user
  erc20Transfer(loanToken, user, maxUint256, GA1, skipRevert=false),
  morphoWithdrawCollateral(source, collateralAmount, GA1),
])
```

Borrow modes:

- **Assets mode** (`borrowAssets > 0n`): exact-asset borrow and repay, no GA1 dust.
- **Shares mode** (`borrowShares > 0n`, `borrowAssets` is the overshoot): the trailing
  `morphoRepay(target, maxUint256, …, skipRevert=true)` sweeps the residual into the target debt,
  then an `erc20Transfer` skims any residual to the user if that repay is skipped.
- **Collat-only** (both zero/omitted): only collateral is migrated; borrow/repay legs omitted.

Prerequisite: GA1 must be authorized on Blue — the entity's `getRequirements()` returns the
`setAuthorization` transaction when needed.

## Parameters

### \_\_namedParameters

[`BlueRefinanceParams`](../interfaces/BlueRefinanceParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRefinanceAction`](../interfaces/BlueRefinanceAction.md)\>\>

A deep-frozen `Transaction<BlueRefinanceAction>`.

## Remarks

`borrowAssets` and `borrowShares` describe different markets (target borrow vs. source
repay); in shares mode the entity passes both. Caller-facing mutual exclusivity is enforced at the entity layer.

## Throws

when `collateralAmount <= 0n`, a repay leg has a non-positive
  `maxRepaySharePrice`, or any reallocation withdrawal amount is non-positive.

## Throws

when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.

## Throws

when V2 entries for one vault use different penalties.

## Throws

when a V2 vault or adapter address is malformed.

## Throws

when a V2 source is absent, incomplete, or has an unknown discriminator.

## Throws

when an entry matches both or neither V1/V2 shape.

## Throws

when one plan contains both V1 and V2 entries.

## Throws

when `borrowAssets`, `borrowShares`, `minBorrowSharePrice`,
  `maxRepaySharePrice`, a V1 fee, or a V2 penalty is negative.

## Throws

when source and target market ids are equal.

## Throws

when source and target do not share both tokens.

## Throws

when `borrowShares > 0n` but `borrowAssets` is omitted or non-positive.

## Throws

when any `reallocation.withdrawals` is empty.

## Throws

when a reallocation withdrawal references the target market.

## Throws

when reallocation withdrawals are not strictly sorted by market id.

## Example

```ts
import { blueRefinance } from "@morpho-org/morpho-sdk";

const tx = blueRefinance({
  source: { chainId: 1, marketParams: sourceParams },
  target: { marketParams: targetParams },
  args: {
    user: borrower,
    collateralAmount: 1_000_000_000_000_000_000n,
    borrowShares: 500_000_000_000n,
    borrowAssets: 501_000_000n, // overshoot computed by entity layer
    minBorrowSharePrice: 0n,
    maxRepaySharePrice: 1_500_000_000_000_000_000_000_000_000n,
  },
});
// tx satisfies Readonly<Transaction<BlueRefinanceAction>>
```
