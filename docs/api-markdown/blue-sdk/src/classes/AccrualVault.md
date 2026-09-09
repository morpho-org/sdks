[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualVault

# Class: AccrualVault

Defined in: [packages/blue-sdk/src/vault/Vault.ts:209](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L209)

Represents a MetaMorpho vault with accrued market allocation state.

## Extends

- [`Vault`](Vault.md)

## Implements

- [`IAccrualVault`](../interfaces/IAccrualVault.md)

## Constructors

### Constructor

> **new AccrualVault**(`vault`, `allocations`): `AccrualVault`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:227](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L227)

#### Parameters

##### vault

[`IAccrualVault`](../interfaces/IAccrualVault.md)

##### allocations

`Omit`\<[`IVaultMarketAllocation`](../interfaces/IVaultMarketAllocation.md), `"proportion"`\>[]

The allocation of the vault on each market of the withdraw queue,
in the same order as the withdraw queue.

#### Returns

`AccrualVault`

#### Overrides

[`Vault`](Vault.md).[`constructor`](Vault.md#constructor)

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`address`](../interfaces/IAccrualVault.md#address)

#### Inherited from

[`Vault`](Vault.md).[`address`](Vault.md#address)

***

### allocations

> `readonly` **allocations**: `Map`\<[`MarketId`](../type-aliases/MarketId.md), [`VaultMarketAllocation`](VaultMarketAllocation.md)\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:220](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L220)

The allocation of the vault on each market enabled.

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L15)

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`asset`](../interfaces/IAccrualVault.md#asset)

#### Inherited from

[`Vault`](Vault.md).[`asset`](Vault.md#asset)

***

### collateralAllocations

> `readonly` **collateralAllocations**: `Map`\<`` `0x${string}` ``, [`CollateralAllocation`](../interfaces/CollateralAllocation.md)\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:225](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L225)

The proportion of assets of the vault supplied to markets collateralized by each collateral asset.

***

### curator

> **curator**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L76)

The MetaMorpho vault's curator address.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`curator`](../interfaces/IAccrualVault.md#curator)

#### Inherited from

[`Vault`](Vault.md).[`curator`](Vault.md#curator)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Inherited from

[`Vault`](Vault.md).[`decimals`](Vault.md#decimals)

***

### decimalsOffset

> `readonly` **decimalsOffset**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L16)

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`decimalsOffset`](../interfaces/IAccrualVault.md#decimalsoffset)

#### Inherited from

[`Vault`](Vault.md).[`decimalsOffset`](Vault.md#decimalsoffset)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`eip5267Domain`](../interfaces/IAccrualVault.md#eip5267domain)

#### Inherited from

[`Vault`](Vault.md).[`eip5267Domain`](Vault.md#eip5267domain)

***

### fee

> **fee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:97](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L97)

The MetaMorpho vault's fee.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`fee`](../interfaces/IAccrualVault.md#fee)

#### Inherited from

[`Vault`](Vault.md).[`fee`](Vault.md#fee)

***

### feeRecipient

> **feeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L88)

The MetaMorpho vault's fee recipient address.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`feeRecipient`](../interfaces/IAccrualVault.md#feerecipient)

#### Inherited from

[`Vault`](Vault.md).[`feeRecipient`](Vault.md#feerecipient)

***

### guardian

> **guardian**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L80)

The MetaMorpho vault's guardian address.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`guardian`](../interfaces/IAccrualVault.md#guardian)

#### Inherited from

[`Vault`](Vault.md).[`guardian`](Vault.md#guardian)

***

### lastTotalAssets

> **lastTotalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:124](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L124)

The MetaMorpho vault's last total assets used to calculate performance fees.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`lastTotalAssets`](../interfaces/IAccrualVault.md#lasttotalassets)

#### Inherited from

[`Vault`](Vault.md).[`lastTotalAssets`](Vault.md#lasttotalassets)

***

### lostAssets?

> `optional` **lostAssets?**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L130)

The MetaMorpho vault's lost assets due to realized bad debt.
Only defined for MetaMorpho V1.1 vaults.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`lostAssets`](../interfaces/IAccrualVault.md#lostassets)

#### Inherited from

[`Vault`](Vault.md).[`lostAssets`](Vault.md#lostassets)

***

### name

> `readonly` **name**: `string`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L62)

The vault's share token's name.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`name`](../interfaces/IAccrualVault.md#name)

#### Inherited from

[`Vault`](Vault.md).[`name`](Vault.md#name)

***

### owner

> **owner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:72](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L72)

The MetaMorpho vault's owner address.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`owner`](../interfaces/IAccrualVault.md#owner)

#### Inherited from

[`Vault`](Vault.md).[`owner`](Vault.md#owner)

***

### pendingGuardian

> **pendingGuardian**: [`Pending`](../interfaces/Pending.md)\<`` `0x${string}` ``\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:106](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L106)

The MetaMorpho vault's pending guardian address and activation timestamp.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`pendingGuardian`](../interfaces/IAccrualVault.md#pendingguardian)

#### Inherited from

[`Vault`](Vault.md).[`pendingGuardian`](Vault.md#pendingguardian)

***

### pendingOwner

> **pendingOwner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:102](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L102)

The MetaMorpho vault's pending owner address and activation timestamp.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`pendingOwner`](../interfaces/IAccrualVault.md#pendingowner)

#### Inherited from

[`Vault`](Vault.md).[`pendingOwner`](Vault.md#pendingowner)

***

### pendingTimelock

> **pendingTimelock**: [`Pending`](../interfaces/Pending.md)\<`bigint`\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:110](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L110)

The MetaMorpho vault's pending timelock (in seconds) and activation timestamp.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`pendingTimelock`](../interfaces/IAccrualVault.md#pendingtimelock)

#### Inherited from

[`Vault`](Vault.md).[`pendingTimelock`](Vault.md#pendingtimelock)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`price`](../interfaces/IAccrualVault.md#price)

#### Inherited from

[`Vault`](Vault.md).[`price`](Vault.md#price)

***

### publicAllocatorConfig?

> `optional` **publicAllocatorConfig?**: [`VaultPublicAllocatorConfig`](../interfaces/VaultPublicAllocatorConfig.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:135](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L135)

The MetaMorpho vault's public allocator configuration.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`publicAllocatorConfig`](../interfaces/IAccrualVault.md#publicallocatorconfig)

#### Inherited from

[`Vault`](Vault.md).[`publicAllocatorConfig`](Vault.md#publicallocatorconfig)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L84)

The MetaMorpho vault's skim recipient address (mostly used to skim reward tokens claimed to the vault).

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`skimRecipient`](../interfaces/IAccrualVault.md#skimrecipient)

#### Inherited from

[`Vault`](Vault.md).[`skimRecipient`](Vault.md#skimrecipient)

***

### supplyQueue

> **supplyQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L115)

The MetaMorpho vault's ordered supply queue.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`supplyQueue`](../interfaces/IAccrualVault.md#supplyqueue)

#### Inherited from

[`Vault`](Vault.md).[`supplyQueue`](Vault.md#supplyqueue)

***

### symbol

> `readonly` **symbol**: `string`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L67)

The vault's share token's symbol.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`symbol`](../interfaces/IAccrualVault.md#symbol)

#### Inherited from

[`Vault`](Vault.md).[`symbol`](Vault.md#symbol)

***

### timelock

> **timelock**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L93)

The MetaMorpho vault's timelock (in seconds).

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`timelock`](../interfaces/IAccrualVault.md#timelock)

#### Inherited from

[`Vault`](Vault.md).[`timelock`](Vault.md#timelock)

***

### totalAssets

> **totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:215](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L215)

#### Inherit Doc

**Reflects**

the sum of assets of the vault's allocations.
Only includes virtually accrued interest if the vault's allocations include virtually accrued interest.

#### Overrides

[`Vault`](Vault.md).[`totalAssets`](Vault.md#totalassets)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L21)

The ERC4626 vault's total supply of shares.

#### Implementation of

[`IAccrualVault`](../interfaces/IAccrualVault.md).[`totalSupply`](../interfaces/IAccrualVault.md#totalsupply)

#### Inherited from

[`Vault`](Vault.md).[`totalSupply`](Vault.md#totalsupply)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

#### Inherited from

[`Vault`](Vault.md).[`underlying`](Vault.md#underlying)

***

### withdrawQueue

> **withdrawQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:119](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L119)

The MetaMorpho vault's ordered withdraw queue.

#### Inherited from

[`Vault`](Vault.md).[`withdrawQueue`](Vault.md#withdrawqueue)

## Accessors

### apy

#### Get Signature

> **get** **apy**(): `number`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:293](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L293)

The MetaMorpho vault's current instantaneous Annual Percentage Yield (APY)
weighted-averaged over its market deposits, before deducting the performance fee.
If interested in the APY at a specific timestamp, use `getApy(timestamp)` instead.

##### Returns

`number`

***

### liquidity

#### Get Signature

> **get** **liquidity**(): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:279](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L279)

The vault's liquidity directly available from allocated markets.

##### Returns

`bigint`

***

### netApy

#### Get Signature

> **get** **netApy**(): `number`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:302](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L302)

The MetaMorpho vault's current instantaneous Annual Percentage Yield (APY)
weighted-averaged over its market deposits, after deducting the performance fee.
If interested in the APY at a specific timestamp, use `getNetApy(timestamp)` instead.

##### Returns

`number`

***

### totalInterest

#### Get Signature

> **get** **totalInterest**(): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:182](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L182)

The amount of interest in assets accrued since the last interaction with the vault.

##### Returns

`bigint`

#### Inherited from

[`Vault`](Vault.md).[`totalInterest`](Vault.md#totalinterest)

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

#### Inherited from

[`Vault`](Vault.md).[`_unwrap`](Vault.md#_unwrap)

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

#### Inherited from

[`Vault`](Vault.md).[`_wrap`](Vault.md#_wrap)

***

### accrueInterest()

> **accrueInterest**(`timestamp?`): `AccrualVault`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:435](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L435)

Returns a new vault derived from this vault, whose interest has been accrued up to the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The timestamp at which to accrue interest. Must be greater than or equal to each of the vault's market's `lastUpdate`.

#### Returns

`AccrualVault`

A new vault whose market positions and fee accounting reflect accrued interest.

#### Throws

when the withdraw queue references a market without an allocation.

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

[`Vault`](Vault.md).[`fromUsd`](Vault.md#fromusd)

***

### getAllocationProportion()

> **getAllocationProportion**(`marketId`): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:348](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L348)

#### Parameters

##### marketId

[`MarketId`](../type-aliases/MarketId.md)

#### Returns

`bigint`

***

### getApy()

> **getApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:331](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L331)

The MetaMorpho vault's experienced Annual Percentage Yield (APY)
weighted-averaged over its market deposits, before deducting the performance fee,
if interest was to be accrued on each market at the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

#### Returns

`number`

***

### ~~getDepositCapacityLimit()~~

> **getDepositCapacityLimit**(`assets`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:362](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L362)

Returns the deposit capacity limit of a given amount of assets on the vault.

#### Parameters

##### assets

`bigint`

The maximum amount of assets to deposit.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Deprecated

Use `maxDeposit` instead.

***

### getNetApy()

> **getNetApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:342](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L342)

The MetaMorpho vault's experienced Annual Percentage Yield (APY)
weighted-averaged over its market deposits, after deducting the performance fee,
if interest was to be accrued on each market at the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

#### Returns

`number`

***

### ~~getWithdrawCapacityLimit()~~

> **getWithdrawCapacityLimit**(`shares`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:371](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L371)

Returns the withdraw capacity limit corresponding to a given amount of shares of the vault.

#### Parameters

##### shares

`bigint`

The maximum amount of shares to redeem.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Deprecated

Use `maxWithdraw` instead.

***

### maxDeposit()

> **maxDeposit**(`assets`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:379](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L379)

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

Defined in: [packages/blue-sdk/src/vault/Vault.ts:413](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L413)

Returns the maximum amount of assets that can be withdrawn from the vault.

#### Parameters

##### shares

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of shares to redeem.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### toAssets()

> **toAssets**(`shares`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:186](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L186)

#### Parameters

##### shares

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint`

#### Inherited from

[`Vault`](Vault.md).[`toAssets`](Vault.md#toassets)

***

### toShares()

> **toShares**(`assets`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:190](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L190)

#### Parameters

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

#### Returns

`bigint`

#### Inherited from

[`Vault`](Vault.md).[`toShares`](Vault.md#toshares)

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

[`Vault`](Vault.md).[`toUnwrappedExactAmountIn`](Vault.md#tounwrappedexactamountin)

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

[`Vault`](Vault.md).[`toUnwrappedExactAmountOut`](Vault.md#tounwrappedexactamountout)

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

[`Vault`](Vault.md).[`toUsd`](Vault.md#tousd)

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

[`Vault`](Vault.md).[`toWrappedExactAmountIn`](Vault.md#towrappedexactamountin)

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

[`Vault`](Vault.md).[`toWrappedExactAmountOut`](Vault.md#towrappedexactamountout)

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

[`Vault`](Vault.md).[`native`](Vault.md#native)
