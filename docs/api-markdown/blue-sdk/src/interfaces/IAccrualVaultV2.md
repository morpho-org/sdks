[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IAccrualVaultV2

# Interface: IAccrualVaultV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:153](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L153)

Plain input shape for a Morpho Vault V2 paired with accrued adapter state.

## Extends

- `Omit`\<[`IVaultV2`](IVaultV2.md), `"adapters"`\>

## Properties

### \_totalAssets

> **\_totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L24)

Stored total assets at `lastUpdate`, excluding virtually accrued interest.

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`_totalAssets`](IVaultV2.md#_totalassets)

***

### address

> **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L9)

#### Inherited from

[`IToken`](IToken.md).[`address`](IToken.md#address)

***

### asset

> **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L20)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`asset`](IVaultV2.md#asset)

***

### decimals?

> `optional` **decimals?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L12)

#### Inherited from

[`IToken`](IToken.md).[`decimals`](IToken.md#decimals)

***

### eip5267Domain?

> `optional` **eip5267Domain?**: [`Eip5267Domain`](../classes/Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L14)

#### Inherited from

[`IToken`](IToken.md).[`eip5267Domain`](IToken.md#eip5267domain)

***

### lastUpdate

> **lastUpdate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L31)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`lastUpdate`](IVaultV2.md#lastupdate)

***

### liquidityAdapter

> **liquidityAdapter**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L33)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`liquidityAdapter`](IVaultV2.md#liquidityadapter)

***

### liquidityAllocations

> **liquidityAllocations**: [`IVaultV2Allocation`](IVaultV2Allocation.md)[] \| `undefined`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L35)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`liquidityAllocations`](IVaultV2.md#liquidityallocations)

***

### liquidityData

> **liquidityData**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L34)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`liquidityData`](IVaultV2.md#liquiditydata)

***

### managementFee

> **managementFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L37)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`managementFee`](IVaultV2.md#managementfee)

***

### managementFeeRecipient

> **managementFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L39)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`managementFeeRecipient`](IVaultV2.md#managementfeerecipient)

***

### managementFeeRecipientCanReceiveShares?

> `optional` **managementFeeRecipientCanReceiveShares?**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L43)

Whether the management fee recipient can receive vault shares. Defaults to `true`.

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`managementFeeRecipientCanReceiveShares`](IVaultV2.md#managementfeerecipientcanreceiveshares)

***

### maxRate

> **maxRate**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L30)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`maxRate`](IVaultV2.md#maxrate)

***

### name?

> `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L10)

#### Inherited from

[`IToken`](IToken.md).[`name`](IToken.md#name)

***

### performanceFee

> **performanceFee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L36)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`performanceFee`](IVaultV2.md#performancefee)

***

### performanceFeeRecipient

> **performanceFeeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L38)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`performanceFeeRecipient`](IVaultV2.md#performancefeerecipient)

***

### performanceFeeRecipientCanReceiveShares?

> `optional` **performanceFeeRecipientCanReceiveShares?**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L41)

Whether the performance fee recipient can receive vault shares. Defaults to `true`.

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`performanceFeeRecipientCanReceiveShares`](IVaultV2.md#performancefeerecipientcanreceiveshares)

***

### price?

> `optional` **price?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L13)

#### Inherited from

[`IToken`](IToken.md).[`price`](IToken.md#price)

***

### symbol?

> `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L11)

#### Inherited from

[`IToken`](IToken.md).[`symbol`](IToken.md#symbol)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L28)

The total supply of shares.

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`totalSupply`](IVaultV2.md#totalsupply)

***

### virtualShares

> **virtualShares**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2.ts#L29)

#### Inherited from

[`IVaultV2`](IVaultV2.md).[`virtualShares`](IVaultV2.md#virtualshares)
