[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2

# Class: VaultV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L47)

Represents a Morpho Vault V2 and its fee, adapter, and accounting state.

## Extends

- [`WrappedToken`](WrappedToken.md)

## Extended by

- [`AccrualVaultV2`](AccrualVaultV2.md)

## Implements

- [`IVaultV2`](../interfaces/IVaultV2.md)

## Constructors

### Constructor

> **new VaultV2**(`__namedParameters`): `VaultV2`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L71)

#### Parameters

##### \_\_namedParameters

[`IVaultV2`](../interfaces/IVaultV2.md)

#### Returns

`VaultV2`

#### Overrides

[`WrappedToken`](WrappedToken.md).[`constructor`](WrappedToken.md#constructor)

## Properties

### \_totalAssets

> **\_totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L50)

Stored total assets at `lastUpdate`, excluding virtually accrued interest.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`_totalAssets`](../interfaces/IVaultV2.md#_totalassets)

***

### adapters

> **adapters**: `` `0x${string}` ``[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L57)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`adapters`](../interfaces/IVaultV2.md#adapters)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`address`](../interfaces/IVaultV2.md#address)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`address`](WrappedToken.md#address)

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L48)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`asset`](../interfaces/IVaultV2.md#asset)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`decimals`](../interfaces/IVaultV2.md#decimals)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`decimals`](WrappedToken.md#decimals)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`eip5267Domain`](../interfaces/IVaultV2.md#eip5267domain)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`eip5267Domain`](WrappedToken.md#eip5267domain)

***

### lastUpdate

> **lastUpdate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L55)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`lastUpdate`](../interfaces/IVaultV2.md#lastupdate)

***

### liquidityAdapter

> **liquidityAdapter**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L58)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`liquidityAdapter`](../interfaces/IVaultV2.md#liquidityadapter)

***

### liquidityAllocations

> **liquidityAllocations**: [`IVaultV2Allocation`](../interfaces/IVaultV2Allocation.md)[] \| `undefined`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L60)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`liquidityAllocations`](../interfaces/IVaultV2.md#liquidityallocations)

***

### liquidityData

> **liquidityData**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L59)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`liquidityData`](../interfaces/IVaultV2.md#liquiditydata)

***

### managementFee

> **managementFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L63)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`managementFee`](../interfaces/IVaultV2.md#managementfee)

***

### managementFeeRecipient

> **managementFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L65)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`managementFeeRecipient`](../interfaces/IVaultV2.md#managementfeerecipient)

***

### managementFeeRecipientCanReceiveShares

> **managementFeeRecipientCanReceiveShares**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L69)

Whether the management fee recipient can receive vault shares.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`managementFeeRecipientCanReceiveShares`](../interfaces/IVaultV2.md#managementfeerecipientcanreceiveshares)

***

### maxRate

> **maxRate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L54)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`maxRate`](../interfaces/IVaultV2.md#maxrate)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`name`](../interfaces/IVaultV2.md#name)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`name`](WrappedToken.md#name)

***

### performanceFee

> **performanceFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L62)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`performanceFee`](../interfaces/IVaultV2.md#performancefee)

***

### performanceFeeRecipient

> **performanceFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L64)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`performanceFeeRecipient`](../interfaces/IVaultV2.md#performancefeerecipient)

***

### performanceFeeRecipientCanReceiveShares

> **performanceFeeRecipientCanReceiveShares**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L67)

Whether the performance fee recipient can receive vault shares.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`performanceFeeRecipientCanReceiveShares`](../interfaces/IVaultV2.md#performancefeerecipientcanreceiveshares)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`price`](../interfaces/IVaultV2.md#price)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`price`](WrappedToken.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`symbol`](../interfaces/IVaultV2.md#symbol)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`symbol`](WrappedToken.md#symbol)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L51)

The total supply of shares.

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`totalSupply`](../interfaces/IVaultV2.md#totalsupply)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

#### Inherited from

[`WrappedToken`](WrappedToken.md).[`underlying`](WrappedToken.md#underlying)

***

### virtualShares

> **virtualShares**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L52)

#### Implementation of

[`IVaultV2`](../interfaces/IVaultV2.md).[`virtualShares`](../interfaces/IVaultV2.md#virtualshares)

## Methods

### \_unwrap()

> `protected` **\_unwrap**(`amount`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:142](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L142)

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

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:132](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L132)

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

### toAssets()

> **toAssets**(`shares`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:112](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L112)

#### Parameters

##### shares

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`

***

### toShares()

> **toShares**(`assets`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L128)

Converts assets to shares using the stored pre-accrual totals.

#### Parameters

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Amount of underlying assets.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

Optional rounding direction. Defaults to `"Down"`.

#### Returns

`bigint`

The corresponding vault shares.

#### Example

```ts
const shares = vault.toShares(100n, "Up");
// shares satisfies bigint
```

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
