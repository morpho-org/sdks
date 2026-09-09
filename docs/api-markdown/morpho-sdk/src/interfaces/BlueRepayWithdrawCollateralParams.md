[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRepayWithdrawCollateralParams

# Interface: BlueRepayWithdrawCollateralParams

Defined in: [packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts#L20)

Parameters for [blueRepayWithdrawCollateral](../functions/blueRepayWithdrawCollateral.md).

## Properties

### args

> **args**: [`RepayActionAmountArgs`](RepayActionAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts#L25)

#### Type Declaration

##### authorizationSignature?

> `optional` **authorizationSignature?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
standalone `setAuthorization` transaction.

##### maxSharePrice

> **maxSharePrice**: `bigint`

Maximum repay share price (in ray). Protects against share price manipulation.

##### onBehalf

> **onBehalf**: `` `0x${string}` ``

Address whose debt is being repaid.

##### receiver

> **receiver**: `` `0x${string}` ``

Receives withdrawn collateral and residual loan tokens in shares mode.

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Optional pre-signed permit/permit2 approval for the loan-token transfer.

##### withdrawAmount

> **withdrawAmount**: `bigint`

Amount of collateral to withdraw.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts#L21)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/repayWithdrawCollateral.ts#L43)
