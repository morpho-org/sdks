[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BaseAction

# Interface: BaseAction\<TType, TArgs\>

Defined in: [packages/morpho-sdk/src/types/action.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L9)

## Extended by

- [`ERC20ApprovalAction`](ERC20ApprovalAction.md)
- [`VaultV2DepositAction`](VaultV2DepositAction.md)
- [`VaultV2WithdrawAction`](VaultV2WithdrawAction.md)
- [`VaultV2RedeemAction`](VaultV2RedeemAction.md)
- [`VaultV2InKindRedeemAction`](VaultV2InKindRedeemAction.md)
- [`VaultV2ForceWithdrawAction`](VaultV2ForceWithdrawAction.md)
- [`VaultV2ForceRedeemAction`](VaultV2ForceRedeemAction.md)
- [`VaultV1DepositAction`](VaultV1DepositAction.md)
- [`VaultV1WithdrawAction`](VaultV1WithdrawAction.md)
- [`VaultV1RedeemAction`](VaultV1RedeemAction.md)
- [`VaultV1InKindRedeemAction`](VaultV1InKindRedeemAction.md)
- [`VaultV1MigrateToV2Action`](VaultV1MigrateToV2Action.md)
- [`BlueSupplyAction`](BlueSupplyAction.md)
- [`BlueWithdrawAction`](BlueWithdrawAction.md)
- [`BlueSupplyCollateralAction`](BlueSupplyCollateralAction.md)
- [`BlueBorrowAction`](BlueBorrowAction.md)
- [`BlueSupplyCollateralBorrowAction`](BlueSupplyCollateralBorrowAction.md)
- [`BlueRepayAction`](BlueRepayAction.md)
- [`BlueWithdrawCollateralAction`](BlueWithdrawCollateralAction.md)
- [`BlueRepayWithdrawCollateralAction`](BlueRepayWithdrawCollateralAction.md)
- [`BlueRefinanceAction`](BlueRefinanceAction.md)
- [`BlueAuthorizationAction`](BlueAuthorizationAction.md)
- [`MidnightAuthorizationAction`](MidnightAuthorizationAction.md)
- [`SetterRatifierRatifyRootAction`](SetterRatifierRatifyRootAction.md)
- [`MidnightTakeLendAction`](MidnightTakeLendAction.md)
- [`MidnightTakeBorrowAction`](MidnightTakeBorrowAction.md)
- [`MidnightSupplyCollateralTakeBorrowAction`](MidnightSupplyCollateralTakeBorrowAction.md)
- [`MidnightSupplyCollateralAction`](MidnightSupplyCollateralAction.md)
- [`MempoolSubmitOffersAction`](MempoolSubmitOffersAction.md)
- [`MidnightRedeemAction`](MidnightRedeemAction.md)
- [`MidnightRepayWithdrawCollateralAction`](MidnightRepayWithdrawCollateralAction.md)
- [`MidnightCancelOfferAction`](MidnightCancelOfferAction.md)
- [`PermitAction`](PermitAction.md)
- [`Permit2Action`](Permit2Action.md)
- [`AuthorizationAction`](AuthorizationAction.md)
- [`MidnightOfferRootSignatureAction`](MidnightOfferRootSignatureAction.md)

## Type Parameters

### TType

`TType` *extends* `string` = `string`

### TArgs

`TArgs` *extends* `Record`\<`string`, `unknown`\> = `Record`\<`string`, `unknown`\>

## Properties

### args

> `readonly` **args**: `TArgs`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

***

### type

> `readonly` **type**: `TType`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)
