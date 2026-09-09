[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueSupplyCollateralBorrow

# Function: blueSupplyCollateralBorrow()

> **blueSupplyCollateralBorrow**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyCollateralBorrowAction`](../interfaces/BlueSupplyCollateralBorrowAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts:131](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts#L131)

Prepares an atomic supply-collateral-and-borrow transaction for a Morpho Blue market.

Routed through bundler3: collateral funding → `morphoSupplyCollateral` → optional Public
Allocator calls → `morphoBorrow`. Each plan contains either V1 or V2 entries,
never both. When `nativeAmount > 0`, native ETH is wrapped via
`GeneralAdapter1.wrapNative()` before the supply leg. V1 fees add to
`tx.value`; V2 penalties are paid in the target loan token and donated to the vaults. When the
collateral and loan tokens match, one combined pull funds both collateral and penalties through
`GeneralAdapter1`.

Prerequisite: `GeneralAdapter1` must be authorized on Morpho to borrow on behalf of the user.
Use `getRequirements()` on the entity to check and obtain the authorization transaction.

Zero loss: all collateral reaches Morpho, all borrowed tokens reach the receiver. No dust left
in bundler or adapter.

## Parameters

### \_\_namedParameters

[`BlueSupplyCollateralBorrowParams`](../interfaces/BlueSupplyCollateralBorrowParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueSupplyCollateralBorrowAction`](../interfaces/BlueSupplyCollateralBorrowAction.md)\>\>

A deep-frozen `Transaction<BlueSupplyCollateralBorrowAction>` with `to`, `value`,
  `data`, and the typed `action` discriminator the simulation layer consumes.

## Throws

when `amount`, `nativeAmount`, `minSharePrice`, a V1 fee, or a V2
  penalty is negative.

## Throws

when `borrowAmount <= 0n`, both collateral amounts resolve to
  zero, or any reallocation withdrawal amount is non-positive.

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

when `nativeAmount > 0n` but the chain has no configured wNative.

## Throws

when `nativeAmount > 0n` but the collateral
  token is not the chain's wNative.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed asset differs from `marketParams.collateralToken`.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed amount differs from the total ERC-20 funding amount.

## Throws

from `getTokenRequirementActions` when a Permit2 requirement
  signature is missing its expiration.

## Throws

when any `reallocation.withdrawals` is empty.

## Throws

when any reallocation withdrawal references
  the target market.

## Throws

when reallocation withdrawals are not strictly
  sorted by market id.

## Example

```ts
import { blueSupplyCollateralBorrow } from "@morpho-org/morpho-sdk";

const tx = blueSupplyCollateralBorrow({
  market: { chainId: 1, marketParams },
  args: {
    amount: 1_000_000_000_000_000_000n,
    borrowAmount: 500_000_000n,
    onBehalf: borrower,
    receiver: borrower,
    minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinBorrowSharePrice` from market state + slippage tolerance
  },
});
// tx satisfies Readonly<Transaction<BlueSupplyCollateralBorrowAction>>
```
