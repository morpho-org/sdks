[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueBorrow

# Function: blueBorrow()

> **blueBorrow**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueBorrowAction`](../interfaces/BlueBorrowAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/borrow.ts:99](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/borrow.ts#L99)

Prepares a borrow transaction for a Morpho Blue market.

Routed through bundler3 via `morphoBorrow`. The bundler uses the transaction initiator as
`onBehalf`. Uses `minSharePrice` to protect against share price manipulation between
transaction construction and execution.

A `reallocations` plan contains either PublicAllocator V1 entries or Vault V2
BluePublicAllocator entries, never both. The calls run before the borrow.
V1 fees accumulate in `tx.value`; V2 penalties are paid in the target loan
token and donated directly to each vault.

## Parameters

### \_\_namedParameters

[`BlueBorrowParams`](../interfaces/BlueBorrowParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueBorrowAction`](../interfaces/BlueBorrowAction.md)\>\>

A deep-frozen `Transaction<BlueBorrowAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `amount <= 0n` or any reallocation withdrawal amount
  is non-positive.

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

when `minSharePrice < 0n`, a V1 fee, or a V2 penalty is negative.

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
import { blueBorrow } from "@morpho-org/morpho-sdk";

const tx = blueBorrow({
  market: { chainId: 1, marketParams },
  args: {
    amount: 1_000_000n,
    receiver: borrower,
    minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinBorrowSharePrice` from market state + slippage tolerance
  },
});
// tx satisfies Readonly<Transaction<BlueBorrowAction>>
```
