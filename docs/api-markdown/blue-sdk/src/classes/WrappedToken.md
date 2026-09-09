[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / WrappedToken

# Abstract Class: WrappedToken

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:7](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L7)

Base class for tokens that wrap and unwrap another token.

## Extends

- [`Token`](Token.md)

## Extended by

- [`ConstantWrappedToken`](ConstantWrappedToken.md)
- [`ExchangeRateWrappedToken`](ExchangeRateWrappedToken.md)
- [`VaultToken`](VaultToken.md)
- [`VaultV2`](VaultV2.md)

## Constructors

### Constructor

> **new WrappedToken**(`token`, `underlying`): `WrappedToken`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:8](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L8)

#### Parameters

##### token

[`IToken`](../interfaces/IToken.md)

##### underlying

`` `0x${string}` ``

#### Returns

`WrappedToken`

#### Overrides

[`Token`](Token.md).[`constructor`](Token.md#constructor)

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Inherited from

[`Token`](Token.md).[`address`](Token.md#address)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Inherited from

[`Token`](Token.md).[`decimals`](Token.md#decimals)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Inherited from

[`Token`](Token.md).[`eip5267Domain`](Token.md#eip5267domain)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Inherited from

[`Token`](Token.md).[`name`](Token.md#name)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Inherited from

[`Token`](Token.md).[`price`](Token.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Inherited from

[`Token`](Token.md).[`symbol`](Token.md#symbol)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

## Methods

### \_unwrap()

> `abstract` `protected` **\_unwrap**(`amount`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:72](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L72)

#### Parameters

##### amount

`bigint`

##### rounding

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

#### Returns

`bigint`

***

### \_wrap()

> `abstract` `protected` **\_wrap**(`amount`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L71)

#### Parameters

##### amount

`bigint`

##### rounding

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

#### Returns

`bigint`

***

### fromUsd()

> **fromUsd**(`amount`, `rounding?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/token/Token.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L77)

Quotes an amount in USD (scaled by WAD) in this token.
Returns `undefined` iff the token's price is undefined.

#### Parameters

##### amount

`bigint`

The amount of USD to quote.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint` \| `undefined`

#### Inherited from

[`Token`](Token.md).[`fromUsd`](Token.md#fromusd)

***

### toUnwrappedExactAmountIn()

> **toUnwrappedExactAmountIn**(`wrappedAmount`, `slippage?`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L45)

The expected amount when unwrapping `wrappedAmount`

#### Parameters

##### wrappedAmount

`bigint`

##### slippage?

`bigint` = `0n`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint`

***

### toUnwrappedExactAmountOut()

> **toUnwrappedExactAmountOut**(`unwrappedAmount`, `slippage?`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L57)

The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount`

#### Parameters

##### unwrappedAmount

`bigint`

##### slippage?

`bigint` = `0n`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

#### Returns

`bigint`

***

### toUsd()

> **toUsd**(`amount`, `rounding?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/token/Token.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L93)

Quotes an amount of tokens in USD (scaled by WAD).
Returns `undefined` iff the token's price is undefined.

#### Parameters

##### amount

`bigint`

The amount of tokens to quote.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint` \| `undefined`

#### Inherited from

[`Token`](Token.md).[`toUsd`](Token.md#tousd)

***

### toWrappedExactAmountIn()

> **toWrappedExactAmountIn**(`unwrappedAmount`, `slippage?`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L17)

The expected amount when wrapping `unwrappedAmount`

#### Parameters

##### unwrappedAmount

`bigint`

##### slippage?

`bigint` = `0n`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint`

***

### toWrappedExactAmountOut()

> **toWrappedExactAmountOut**(`wrappedAmount`, `slippage?`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L29)

The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount`

#### Parameters

##### wrappedAmount

`bigint`

##### slippage?

`bigint` = `0n`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

#### Returns

`bigint`

***

### native()

> `static` **native**(`chainId`): [`Token`](Token.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L19)

#### Parameters

##### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

#### Returns

[`Token`](Token.md)

#### Inherited from

[`Token`](Token.md).[`native`](Token.md#native)
