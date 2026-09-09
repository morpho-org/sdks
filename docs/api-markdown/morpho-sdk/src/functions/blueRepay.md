[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueRepay

# Function: blueRepay()

> **blueRepay**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRepayAction`](../interfaces/BlueRepayAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/repay.ts:102](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repay.ts#L102)

Prepares a repay transaction for a Morpho Blue market.

Routed through bundler3 via `GeneralAdapter1`. All amount arithmetic is done upstream (see
`MorphoBlue.repay`); this builder just assembles the bundle from the pre-resolved
[RepayActionAmountArgs](../interfaces/RepayActionAmountArgs.md). The mode is discriminated on `shares`, plus optional native wrapping
(when `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()` before the
repay; the loan token must be the chain's wNative):

- **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets (`= amount + nativeAmount`,
  additive like `blueSupply`), pulling `amount` ERC-20 and wrapping `nativeAmount`. No residual.
- **shares mode** (`shares > 0n`): repays exact shares (full repay), pulling `transferAmount`
  ERC-20 (already net of native) and wrapping `nativeAmount`. Residual loan tokens are skimmed
  back to `receiver` after the call.

Uses `maxSharePrice` to protect against share price manipulation between construction and execution.

## Parameters

### \_\_namedParameters

[`BlueRepayParams`](../interfaces/BlueRepayParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRepayAction`](../interfaces/BlueRepayAction.md)\>\>

A deep-frozen `Transaction<BlueRepayAction>` with `to`, `value` (= `nativeAmount`),
  `data`, and the typed `action` discriminator the simulation layer consumes.

## Throws

when `maxSharePrice <= 0n` or the total funding is zero.

## Throws

when `amount`, `shares`, `nativeAmount`, or `transferAmount` is negative.

## Throws

when both `amount` and `shares` are `> 0n`.

## Throws

when in assets mode and
  `transferAmount !== amount + nativeAmount`.

## Throws

when `nativeAmount > 0n` but the chain has no configured wNative.

## Throws

when `nativeAmount > 0n` but the loan token is not
  the chain's wNative.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed asset differs from `marketParams.loanToken`.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed amount differs from the ERC-20 amount pulled.

## Throws

from `getTokenRequirementActions` when a Permit2 requirement
  signature is missing its expiration.

## Example

```ts
import { blueRepay } from "@morpho-org/morpho-sdk";

// Repay 0.5 loan-asset units, 0.2 of them funded by wrapping native ETH.
const tx = blueRepay({
  market: { chainId: 1, marketParams }, // marketParams.loanToken === wNative
  args: {
    amount: 300_000_000_000_000_000n, // ERC-20 part
    nativeAmount: 200_000_000_000_000_000n, // wrapped ETH part
    transferAmount: 500_000_000_000_000_000n, // total repaid = amount + nativeAmount
    onBehalf: borrower,
    receiver: borrower,
    maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
  },
});
// tx.value === 200_000_000_000_000_000n
```
