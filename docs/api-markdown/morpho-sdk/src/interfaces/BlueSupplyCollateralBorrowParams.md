[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueSupplyCollateralBorrowParams

# Interface: BlueSupplyCollateralBorrowParams

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts#L22)

Parameters for [blueSupplyCollateralBorrow](../functions/blueSupplyCollateralBorrow.md).

## Properties

### args

> **args**: [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md) & `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts#L27)

#### Type Declaration

##### authorizationSignature?

> `optional` **authorizationSignature?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
standalone `setAuthorization` transaction.

##### borrowAmount

> **borrowAmount**: `bigint`

Amount of loan asset to borrow after the collateral is supplied.

##### minSharePrice

> **minSharePrice**: `bigint`

Minimum borrow share price (in ray). Protects against share price manipulation.

##### onBehalf

> **onBehalf**: `` `0x${string}` ``

Address whose Morpho collateral and borrow positions are credited.

##### reallocations?

> `optional` **reallocations?**: BlueReallocationPlan \| undefined

Homogeneous Vault V1 or Vault V2 reallocations to execute before borrowing.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2 for new integrations.

##### receiver

> **receiver**: `` `0x${string}` ``

Address that receives the borrowed assets.

##### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Optional pre-signed permit/permit2 approval for the collateral transfer.

***

### market

> **market**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts#L23)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/supplyCollateralBorrow.ts#L50)
