[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Holding

# Class: Holding

Defined in: [packages/blue-sdk/src/holding/Holding.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L45)

Represents a user's balance and allowance state for one token.

## Implements

- [`IHolding`](../interfaces/IHolding.md)

## Constructors

### Constructor

> **new Holding**(`__namedParameters`): `Holding`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L84)

#### Parameters

##### \_\_namedParameters

[`IHolding`](../interfaces/IHolding.md)

#### Returns

`Holding`

## Properties

### \_balance

> `protected` **\_balance**: `bigint`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:82](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L82)

Allows to customize the setter behavior in child classes.

***

### canTransfer?

> `optional` **canTransfer?**: `boolean`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L59)

Whether the user is allowed to transfer this holding's balance.

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`canTransfer`](../interfaces/IHolding.md#cantransfer)

***

### erc20Allowances

> `readonly` **erc20Allowances**: `object`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L64)

ERC20 allowance for this token from the user to the allowance recipient.

##### bundler3.generalAdapter1

> **bundler3.generalAdapter1**: `bigint`

#### morpho

> **morpho**: `bigint`

#### permit2

> **permit2**: `bigint`

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`erc20Allowances`](../interfaces/IHolding.md#erc20allowances)

***

### erc2612Nonce?

> `optional` **erc2612Nonce?**: `bigint`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L77)

ERC-2612 Permit nonce of the user for this token.
`undefined` if the token does not support ERC-2612.

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`erc2612Nonce`](../interfaces/IHolding.md#erc2612nonce)

***

### permit2BundlerAllowance

> `readonly` **permit2BundlerAllowance**: [`Permit2Allowance`](../interfaces/Permit2Allowance.md)

Defined in: [packages/blue-sdk/src/holding/Holding.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L71)

Permit2 allowance for this token from the user to the allowance recipient.

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`permit2BundlerAllowance`](../interfaces/IHolding.md#permit2bundlerallowance)

***

### token

> `readonly` **token**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/holding/Holding.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L54)

The token in which this holding is denominated.

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`token`](../interfaces/IHolding.md#token)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/holding/Holding.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L49)

The user of this holding.

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`user`](../interfaces/IHolding.md#user)

## Accessors

### balance

#### Get Signature

> **get** **balance**(): `bigint`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L115)

The balance of the user for this token.

##### Returns

`bigint`

#### Set Signature

> **set** **balance**(`value`): `void`

Defined in: [packages/blue-sdk/src/holding/Holding.ts:118](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/Holding.ts#L118)

##### Parameters

###### value

`bigint`

##### Returns

`void`

#### Implementation of

[`IHolding`](../interfaces/IHolding.md).[`balance`](../interfaces/IHolding.md#balance)
