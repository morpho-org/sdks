[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Token

# Class: Token

Defined in: [packages/blue-sdk/src/token/Token.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L18)

Represents an ERC-20-like token and optional price/signing metadata.

## Extended by

- [`WrappedToken`](WrappedToken.md)
- [`VaultConfig`](VaultConfig.md)

## Implements

- [`IToken`](../interfaces/IToken.md)

## Constructors

### Constructor

> **new Token**(`__namedParameters`): `Token`

Defined in: [packages/blue-sdk/src/token/Token.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L55)

#### Parameters

##### \_\_namedParameters

[`IToken`](../interfaces/IToken.md)

#### Returns

`Token`

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`address`](../interfaces/IToken.md#address)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`decimals`](../interfaces/IToken.md#decimals)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`eip5267Domain`](../interfaces/IToken.md#eip5267domain)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`name`](../interfaces/IToken.md#name)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`price`](../interfaces/IToken.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Implementation of

[`IToken`](../interfaces/IToken.md).[`symbol`](../interfaces/IToken.md#symbol)

## Methods

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

***

### native()

> `static` **native**(`chainId`): `Token`

Defined in: [packages/blue-sdk/src/token/Token.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L19)

#### Parameters

##### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

#### Returns

`Token`
