[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / blueRepayWithdrawCollateral

# Function: blueRepayWithdrawCollateral()

> **blueRepayWithdrawCollateral**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRepayWithdrawCollateralAction`](../interfaces/BlueRepayWithdrawCollateralAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts#L127)

Prepares an atomic repay-and-withdraw-collateral transaction for a Morpho Blue market.

Routed through bundler3. The bundle order is critical:

1. ERC-20 transfer of the loan token to `GeneralAdapter1`.
2. `morphoRepay` — reduces debt **first**.
3. `morphoWithdrawCollateral` — then withdraws collateral.

If the order were reversed, Morpho would revert because the position would be insolvent at the
time of the withdraw. All amount arithmetic is done upstream (see
`MorphoBlue.repayWithdrawCollateral`); this builder just assembles the bundle from the
pre-resolved [RepayActionAmountArgs](../interfaces/RepayActionAmountArgs.md). The mode is discriminated on `shares`, plus optional
native wrapping (when `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()`
before the repay; the loan token must be the chain's wNative):

- **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets (`= amount + nativeAmount`,
  additive like `blueSupply`), pulling `amount` ERC-20.
- **shares mode** (`shares > 0n`): repays exact shares (full repay), pulling `transferAmount`
  ERC-20 (already net of native); residual loan tokens are skimmed back to `receiver`.

Prerequisites: ERC-20 approval for the loan token to `GeneralAdapter1` (for the repay) **and**
`GeneralAdapter1` must be authorized on Morpho (for the withdraw). Passing an
`authorizationSignature` prepends the authorization in-bundle instead.

## Parameters

### \_\_namedParameters

[`BlueRepayWithdrawCollateralParams`](../interfaces/BlueRepayWithdrawCollateralParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`BlueRepayWithdrawCollateralAction`](../interfaces/BlueRepayWithdrawCollateralAction.md)\>\>

A deep-frozen `Transaction<BlueRepayWithdrawCollateralAction>` with `to`,
  `value` (= `nativeAmount`), `data`, and the typed `action` discriminator the simulation layer consumes.

## Throws

when `maxSharePrice <= 0n`, the total funding is zero, or
  `withdrawAmount <= 0n`.

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
import { blueRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";

const tx = blueRepayWithdrawCollateral({
  market: { chainId: 1, marketParams }, // marketParams.loanToken === wNative
  args: {
    shares: 500_000_000_000_000_000_000_000n,
    transferAmount: 310_000_000_000_000_000n, // ERC-20 pulled (net of native)
    nativeAmount: 200_000_000_000_000_000n, // 0.2 funded by wrapping native ETH
    withdrawAmount: 1_000_000_000_000_000_000n,
    onBehalf: borrower,
    receiver: borrower,
    maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
  },
});
// tx.value === 200_000_000_000_000_000n
```
