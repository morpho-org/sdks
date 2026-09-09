[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueWithdraw

# Function: blueWithdraw()

> **blueWithdraw**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueWithdrawAction`](../interfaces/BlueWithdrawAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/withdraw.ts:117](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/withdraw.ts#L117)

Prepares a loan-asset withdraw transaction for a Morpho Blue market.

Routed through bundler3 via `morphoWithdraw`. Supports two modes (exactly one):

- **By assets** (`assets > 0, shares = 0`): withdraws an exact asset amount.
- **By shares** (`assets = 0, shares > 0`): burns an exact share count (typical for a full
  supplier position close; immune to interest accrual between tx construction and execution).

A `reallocations` plan contains either V1 entries or V2 market/idle entries,
never both. The calls run before the withdraw. V1
fees accumulate in `tx.value`; V2 penalties are paid in the target loan
token and donated to the vaults. The on-chain `morphoWithdraw` sends the
assets computed on-chain directly to `receiver`; no skim is required.

The withdraw is performed on behalf of the transaction initiator (signer) — there is no
separate `onBehalf` field; mirror `blueBorrow`. The entity layer keeps `receiver` aligned
with the user when none is provided. Requires the user to have authorized `GeneralAdapter1`
on Morpho.

## Parameters

### \_\_namedParameters

[`BlueWithdrawParams`](../interfaces/BlueWithdrawParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueWithdrawAction`](../interfaces/BlueWithdrawAction.md)\>\>

A deep-frozen `Transaction<BlueWithdrawAction>` with `to`, `value`, `data`, and
  the typed `action` discriminator the simulation layer consumes.

## Throws

when `assets`, `shares`, `minSharePrice`, a V1 fee, or a V2
  penalty is negative.

## Throws

when both `assets` and `shares` are zero or any reallocation
  withdrawal amount is non-positive.

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

when both `assets` and `shares` are non-zero.

## Throws

when any reallocation has no withdrawals.

## Throws

when a reallocation withdrawal references
  the target market.

## Throws

when reallocation withdrawals are not strictly
  sorted by market id.

## Example

```ts
import { blueWithdraw } from "@morpho-org/morpho-sdk";

const tx = blueWithdraw({
  market: { chainId: 1, marketParams },
  args: {
    assets: 1_000_000_000n,
    shares: 0n,
    receiver: supplier,
    minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinWithdrawSharePrice` from market state + slippage tolerance
  },
});
// tx satisfies Readonly<Transaction<BlueWithdrawAction>>
```
