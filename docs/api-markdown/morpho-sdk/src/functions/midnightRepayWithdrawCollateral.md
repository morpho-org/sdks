[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightRepayWithdrawCollateral

# Function: midnightRepayWithdrawCollateral()

> **midnightRepayWithdrawCollateral**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightRepayWithdrawCollateralAction`](../interfaces/MidnightRepayWithdrawCollateralAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/repayWithdrawCollateral.ts#L69)

Encodes a Midnight bundle that repays debt, withdraws collateral, or both.

Prefer `client.morpho.midnight(chainId).repayWithdrawCollateral(...)` in app
flows so loan-token approval and Midnight authorization requirements are
resolved first. Use this low-level builder only when those requirements and
collateral-index checks are already handled by the caller.

## Parameters

### params

[`MidnightRepayWithdrawCollateralParams`](../interfaces/MidnightRepayWithdrawCollateralParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightRepayWithdrawCollateralAction`](../interfaces/MidnightRepayWithdrawCollateralAction.md)\>\>

A deep-frozen `Transaction<MidnightRepayWithdrawCollateralAction>` targeting `MidnightBundles`.

## Throws

when any amount, collateral index, or deadline is negative.

## Throws

when both repay and withdrawal amounts are zero.

## Throws

when the market targets another chain.

## Throws

when the market targets another Midnight deployment.

## Throws

when a positive withdrawal targets an unconfigured collateral index.

## Example

```ts
import { maxUint256 } from "viem";
import { midnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";

const tx = midnightRepayWithdrawCollateral({
  chainId: 8453,
  market: marketData.params,
  repayAssets: 1_000_000n,
  withdrawCollateralAssets: 0n,
  onBehalf: user,
  deadline: maxUint256,
});
```
