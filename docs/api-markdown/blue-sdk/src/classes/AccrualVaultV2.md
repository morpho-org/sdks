[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualVaultV2

# Class: AccrualVaultV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:156](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L156)

Represents a Morpho Vault V2 with accrued adapter and liquidity state.

## Extends

- [`VaultV2`](VaultV2.md)

## Implements

- [`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md)

## Constructors

### Constructor

> **new AccrualVaultV2**(`vault`, `accrualLiquidityAdapter`, `accrualAdapters`, `assetBalance`, `forceDeallocatePenalties`): `AccrualVaultV2`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:158](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L158)

#### Parameters

##### vault

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md)

##### accrualLiquidityAdapter

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md) \| `undefined`

##### accrualAdapters

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md)[]

##### assetBalance

`bigint`

##### forceDeallocatePenalties

`Record`\<`Address`, `bigint`\>

The force deallocate penalty for each adapter, keyed by adapter address.

#### Returns

`AccrualVaultV2`

#### Overrides

[`VaultV2`](VaultV2.md).[`constructor`](VaultV2.md#constructor)

## Properties

### \_totalAssets

> **\_totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L50)

Stored total assets at `lastUpdate`, excluding virtually accrued interest.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`_totalAssets`](../interfaces/IAccrualVaultV2.md#_totalassets)

#### Inherited from

[`VaultV2`](VaultV2.md).[`_totalAssets`](VaultV2.md#_totalassets)

***

### accrualAdapters

> **accrualAdapters**: [`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:161](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L161)

***

### accrualLiquidityAdapter

> **accrualLiquidityAdapter**: [`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md) \| `undefined`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:160](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L160)

***

### adapters

> **adapters**: `` `0x${string}` ``[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L57)

#### Inherited from

[`VaultV2`](VaultV2.md).[`adapters`](VaultV2.md#adapters)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`address`](../interfaces/IAccrualVaultV2.md#address)

#### Inherited from

[`VaultV2`](VaultV2.md).[`address`](VaultV2.md#address)

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L48)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`asset`](../interfaces/IAccrualVaultV2.md#asset)

#### Inherited from

[`VaultV2`](VaultV2.md).[`asset`](VaultV2.md#asset)

***

### assetBalance

> **assetBalance**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:162](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L162)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`decimals`](../interfaces/IAccrualVaultV2.md#decimals)

#### Inherited from

[`VaultV2`](VaultV2.md).[`decimals`](VaultV2.md#decimals)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`eip5267Domain`](../interfaces/IAccrualVaultV2.md#eip5267domain)

#### Inherited from

[`VaultV2`](VaultV2.md).[`eip5267Domain`](VaultV2.md#eip5267domain)

***

### forceDeallocatePenalties

> **forceDeallocatePenalties**: `Record`\<`Address`, `bigint`\>

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:166](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L166)

The force deallocate penalty for each adapter, keyed by adapter address.

***

### lastUpdate

> **lastUpdate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L55)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`lastUpdate`](../interfaces/IAccrualVaultV2.md#lastupdate)

#### Inherited from

[`VaultV2`](VaultV2.md).[`lastUpdate`](VaultV2.md#lastupdate)

***

### liquidityAdapter

> **liquidityAdapter**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L58)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`liquidityAdapter`](../interfaces/IAccrualVaultV2.md#liquidityadapter)

#### Inherited from

[`VaultV2`](VaultV2.md).[`liquidityAdapter`](VaultV2.md#liquidityadapter)

***

### liquidityAllocations

> **liquidityAllocations**: [`IVaultV2Allocation`](../interfaces/IVaultV2Allocation.md)[] \| `undefined`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L60)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`liquidityAllocations`](../interfaces/IAccrualVaultV2.md#liquidityallocations)

#### Inherited from

[`VaultV2`](VaultV2.md).[`liquidityAllocations`](VaultV2.md#liquidityallocations)

***

### liquidityData

> **liquidityData**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L59)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`liquidityData`](../interfaces/IAccrualVaultV2.md#liquiditydata)

#### Inherited from

[`VaultV2`](VaultV2.md).[`liquidityData`](VaultV2.md#liquiditydata)

***

### managementFee

> **managementFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L63)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`managementFee`](../interfaces/IAccrualVaultV2.md#managementfee)

#### Inherited from

[`VaultV2`](VaultV2.md).[`managementFee`](VaultV2.md#managementfee)

***

### managementFeeRecipient

> **managementFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L65)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`managementFeeRecipient`](../interfaces/IAccrualVaultV2.md#managementfeerecipient)

#### Inherited from

[`VaultV2`](VaultV2.md).[`managementFeeRecipient`](VaultV2.md#managementfeerecipient)

***

### managementFeeRecipientCanReceiveShares

> **managementFeeRecipientCanReceiveShares**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L69)

Whether the management fee recipient can receive vault shares.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`managementFeeRecipientCanReceiveShares`](../interfaces/IAccrualVaultV2.md#managementfeerecipientcanreceiveshares)

#### Inherited from

[`VaultV2`](VaultV2.md).[`managementFeeRecipientCanReceiveShares`](VaultV2.md#managementfeerecipientcanreceiveshares)

***

### maxRate

> **maxRate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L54)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`maxRate`](../interfaces/IAccrualVaultV2.md#maxrate)

#### Inherited from

[`VaultV2`](VaultV2.md).[`maxRate`](VaultV2.md#maxrate)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`name`](../interfaces/IAccrualVaultV2.md#name)

#### Inherited from

[`VaultV2`](VaultV2.md).[`name`](VaultV2.md#name)

***

### performanceFee

> **performanceFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L62)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`performanceFee`](../interfaces/IAccrualVaultV2.md#performancefee)

#### Inherited from

[`VaultV2`](VaultV2.md).[`performanceFee`](VaultV2.md#performancefee)

***

### performanceFeeRecipient

> **performanceFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L64)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`performanceFeeRecipient`](../interfaces/IAccrualVaultV2.md#performancefeerecipient)

#### Inherited from

[`VaultV2`](VaultV2.md).[`performanceFeeRecipient`](VaultV2.md#performancefeerecipient)

***

### performanceFeeRecipientCanReceiveShares

> **performanceFeeRecipientCanReceiveShares**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L67)

Whether the performance fee recipient can receive vault shares.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`performanceFeeRecipientCanReceiveShares`](../interfaces/IAccrualVaultV2.md#performancefeerecipientcanreceiveshares)

#### Inherited from

[`VaultV2`](VaultV2.md).[`performanceFeeRecipientCanReceiveShares`](VaultV2.md#performancefeerecipientcanreceiveshares)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`price`](../interfaces/IAccrualVaultV2.md#price)

#### Inherited from

[`VaultV2`](VaultV2.md).[`price`](VaultV2.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`symbol`](../interfaces/IAccrualVaultV2.md#symbol)

#### Inherited from

[`VaultV2`](VaultV2.md).[`symbol`](VaultV2.md#symbol)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L51)

The total supply of shares.

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`totalSupply`](../interfaces/IAccrualVaultV2.md#totalsupply)

#### Inherited from

[`VaultV2`](VaultV2.md).[`totalSupply`](VaultV2.md#totalsupply)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

#### Inherited from

[`VaultV2`](VaultV2.md).[`underlying`](VaultV2.md#underlying)

***

### virtualShares

> **virtualShares**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L52)

#### Implementation of

[`IAccrualVaultV2`](../interfaces/IAccrualVaultV2.md).[`virtualShares`](../interfaces/IAccrualVaultV2.md#virtualshares)

#### Inherited from

[`VaultV2`](VaultV2.md).[`virtualShares`](VaultV2.md#virtualshares)

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

#### Inherited from

[`VaultV2`](VaultV2.md).[`_unwrap`](VaultV2.md#_unwrap)

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

#### Inherited from

[`VaultV2`](VaultV2.md).[`_wrap`](VaultV2.md#_wrap)

***

### accrueInterest()

> **accrueInterest**(`timestamp`): `object`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:238](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L238)

Returns a new vault derived from this vault, whose interest has been accrued up to the given timestamp.
Performance and management fee shares are zero when the corresponding fee recipient cannot receive vault shares.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The timestamp at which to accrue interest. Must be greater than or equal to the vault's `lastUpdate`.

#### Returns

`object`

##### managementFeeShares

> **managementFeeShares**: `bigint` = `0n`

##### performanceFeeShares

> **performanceFeeShares**: `bigint` = `0n`

##### vault

> **vault**: `AccrualVaultV2`

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

[`VaultV2`](VaultV2.md).[`fromUsd`](VaultV2.md#fromusd)

***

### maxDeposit()

> **maxDeposit**(`assets`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:175](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L175)

Returns the maximum amount of assets that can be deposited to the vault.

#### Parameters

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of assets to deposit.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### maxWithdraw()

> **maxWithdraw**(`shares`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:209](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L209)

Returns the maximum amount of assets that can be withdrawn from the vault.

#### Parameters

##### shares

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of shares to redeem.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### toAssets()

> **toAssets**(`shares`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:112](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L112)

#### Parameters

##### shares

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`

#### Inherited from

[`VaultV2`](VaultV2.md).[`toAssets`](VaultV2.md#toassets)

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

#### Inherited from

[`VaultV2`](VaultV2.md).[`toShares`](VaultV2.md#toshares)

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

[`VaultV2`](VaultV2.md).[`toUnwrappedExactAmountIn`](VaultV2.md#tounwrappedexactamountin)

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

[`VaultV2`](VaultV2.md).[`toUnwrappedExactAmountOut`](VaultV2.md#tounwrappedexactamountout)

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

[`VaultV2`](VaultV2.md).[`toUsd`](VaultV2.md#tousd)

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

[`VaultV2`](VaultV2.md).[`toWrappedExactAmountIn`](VaultV2.md#towrappedexactamountin)

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

[`VaultV2`](VaultV2.md).[`toWrappedExactAmountOut`](VaultV2.md#towrappedexactamountout)

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

[`VaultV2`](VaultV2.md).[`native`](VaultV2.md#native)
