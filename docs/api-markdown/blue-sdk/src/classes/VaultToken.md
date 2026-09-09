[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultToken

# Class: VaultToken

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L14)

Represents an ERC-4626-like vault token with share and asset conversion math.

## Extends

- [`WrappedToken`](WrappedToken.md)

## Extended by

- [`Vault`](Vault.md)

## Implements

- [`IVaultToken`](../interfaces/IVaultToken.md)

## Constructors

### Constructor

> **new VaultToken**(`config`, `__namedParameters`): `VaultToken`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L28)

#### Parameters

##### config

[`IVaultConfig`](../interfaces/IVaultConfig.md)

##### \_\_namedParameters

[`IVaultToken`](../interfaces/IVaultToken.md)

#### Returns

`VaultToken`

#### Overrides

[`WrappedToken`](WrappedToken.md).[`constructor`](WrappedToken.md#constructor)

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`address`](WrappedToken.md#address)

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L15)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`decimals`](WrappedToken.md#decimals)

***

### decimalsOffset

> `readonly` **decimalsOffset**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L16)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`eip5267Domain`](WrappedToken.md#eip5267domain)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`name`](WrappedToken.md#name)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`price`](WrappedToken.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`symbol`](WrappedToken.md#symbol)

***

### totalAssets

> **totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L26)

The ERC4626 vault's total assets.

#### Implementation of

[`IVaultToken`](../interfaces/IVaultToken.md).[`totalAssets`](../interfaces/IVaultToken.md#totalassets)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L21)

The ERC4626 vault's total supply of shares.

#### Implementation of

[`IVaultToken`](../interfaces/IVaultToken.md).[`totalSupply`](../interfaces/IVaultToken.md#totalsupply)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`underlying`](WrappedToken.md#underlying)

## Methods

### \_unwrap()

> `protected` **\_unwrap**(`amount`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L42)

#### Parameters

##### amount

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

##### rounding

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

#### Returns

`bigint`

#### Overrides

[`WrappedToken`](WrappedToken.md).[`_unwrap`](WrappedToken.md#_unwrap)

***

### \_wrap()

> `protected` **\_wrap**(`amount`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L38)

#### Parameters

##### amount

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

##### rounding

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

#### Returns

`bigint`

#### Overrides

[`WrappedToken`](WrappedToken.md).[`_wrap`](WrappedToken.md#_wrap)

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

[`WrappedToken`](WrappedToken.md).[`fromUsd`](WrappedToken.md#fromusd)

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

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`toUnwrappedExactAmountIn`](WrappedToken.md#tounwrappedexactamountin)

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

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`toUnwrappedExactAmountOut`](WrappedToken.md#tounwrappedexactamountout)

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

[`WrappedToken`](WrappedToken.md).[`toUsd`](WrappedToken.md#tousd)

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

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`toWrappedExactAmountIn`](WrappedToken.md#towrappedexactamountin)

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

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`toWrappedExactAmountOut`](WrappedToken.md#towrappedexactamountout)

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

[`WrappedToken`](WrappedToken.md).[`native`](WrappedToken.md#native)
