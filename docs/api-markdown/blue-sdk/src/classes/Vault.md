[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Vault

# Class: Vault

Defined in: [packages/blue-sdk/src/vault/Vault.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L58)

Represents a MetaMorpho vault and its governance, queue, and accounting state.

## Extends

- [`VaultToken`](VaultToken.md)

## Extended by

- [`AccrualVault`](AccrualVault.md)

## Implements

- [`IVault`](../interfaces/IVault.md)

## Constructors

### Constructor

> **new Vault**(`__namedParameters`): `Vault`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:137](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L137)

#### Parameters

##### \_\_namedParameters

[`IVault`](../interfaces/IVault.md)

#### Returns

`Vault`

#### Overrides

[`VaultToken`](VaultToken.md).[`constructor`](VaultToken.md#constructor)

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`address`](../interfaces/IVault.md#address)

#### Inherited from

[`VaultToken`](VaultToken.md).[`address`](VaultToken.md#address)

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L15)

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`asset`](../interfaces/IVault.md#asset)

#### Inherited from

[`VaultToken`](VaultToken.md).[`asset`](VaultToken.md#asset)

***

### curator

> **curator**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L76)

The MetaMorpho vault's curator address.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`curator`](../interfaces/IVault.md#curator)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Inherited from

[`VaultToken`](VaultToken.md).[`decimals`](VaultToken.md#decimals)

***

### decimalsOffset

> `readonly` **decimalsOffset**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L16)

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`decimalsOffset`](../interfaces/IVault.md#decimalsoffset)

#### Inherited from

[`VaultToken`](VaultToken.md).[`decimalsOffset`](VaultToken.md#decimalsoffset)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`eip5267Domain`](../interfaces/IVault.md#eip5267domain)

#### Inherited from

[`VaultToken`](VaultToken.md).[`eip5267Domain`](VaultToken.md#eip5267domain)

***

### fee

> **fee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:97](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L97)

The MetaMorpho vault's fee.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`fee`](../interfaces/IVault.md#fee)

***

### feeRecipient

> **feeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L88)

The MetaMorpho vault's fee recipient address.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`feeRecipient`](../interfaces/IVault.md#feerecipient)

***

### guardian

> **guardian**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L80)

The MetaMorpho vault's guardian address.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`guardian`](../interfaces/IVault.md#guardian)

***

### lastTotalAssets

> **lastTotalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:124](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L124)

The MetaMorpho vault's last total assets used to calculate performance fees.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`lastTotalAssets`](../interfaces/IVault.md#lasttotalassets)

***

### lostAssets?

> `optional` **lostAssets?**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L130)

The MetaMorpho vault's lost assets due to realized bad debt.
Only defined for MetaMorpho V1.1 vaults.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`lostAssets`](../interfaces/IVault.md#lostassets)

***

### name

> `readonly` **name**: `string`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L62)

The vault's share token's name.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`name`](../interfaces/IVault.md#name)

#### Overrides

[`VaultToken`](VaultToken.md).[`name`](VaultToken.md#name)

***

### owner

> **owner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:72](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L72)

The MetaMorpho vault's owner address.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`owner`](../interfaces/IVault.md#owner)

***

### pendingGuardian

> **pendingGuardian**: [`Pending`](../interfaces/Pending.md)\<`` `0x${string}` ``\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:106](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L106)

The MetaMorpho vault's pending guardian address and activation timestamp.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`pendingGuardian`](../interfaces/IVault.md#pendingguardian)

***

### pendingOwner

> **pendingOwner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:102](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L102)

The MetaMorpho vault's pending owner address and activation timestamp.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`pendingOwner`](../interfaces/IVault.md#pendingowner)

***

### pendingTimelock

> **pendingTimelock**: [`Pending`](../interfaces/Pending.md)\<`bigint`\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:110](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L110)

The MetaMorpho vault's pending timelock (in seconds) and activation timestamp.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`pendingTimelock`](../interfaces/IVault.md#pendingtimelock)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`price`](../interfaces/IVault.md#price)

#### Inherited from

[`VaultToken`](VaultToken.md).[`price`](VaultToken.md#price)

***

### publicAllocatorConfig?

> `optional` **publicAllocatorConfig?**: [`VaultPublicAllocatorConfig`](../interfaces/VaultPublicAllocatorConfig.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:135](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L135)

The MetaMorpho vault's public allocator configuration.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`publicAllocatorConfig`](../interfaces/IVault.md#publicallocatorconfig)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L84)

The MetaMorpho vault's skim recipient address (mostly used to skim reward tokens claimed to the vault).

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`skimRecipient`](../interfaces/IVault.md#skimrecipient)

***

### supplyQueue

> **supplyQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L115)

The MetaMorpho vault's ordered supply queue.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`supplyQueue`](../interfaces/IVault.md#supplyqueue)

***

### symbol

> `readonly` **symbol**: `string`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L67)

The vault's share token's symbol.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`symbol`](../interfaces/IVault.md#symbol)

#### Overrides

[`VaultToken`](VaultToken.md).[`symbol`](VaultToken.md#symbol)

***

### timelock

> **timelock**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L93)

The MetaMorpho vault's timelock (in seconds).

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`timelock`](../interfaces/IVault.md#timelock)

***

### totalAssets

> **totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L26)

The ERC4626 vault's total assets.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`totalAssets`](../interfaces/IVault.md#totalassets)

#### Inherited from

[`VaultToken`](VaultToken.md).[`totalAssets`](VaultToken.md#totalassets)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/token/VaultToken.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/VaultToken.ts#L21)

The ERC4626 vault's total supply of shares.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`totalSupply`](../interfaces/IVault.md#totalsupply)

#### Inherited from

[`VaultToken`](VaultToken.md).[`totalSupply`](VaultToken.md#totalsupply)

***

### underlying

> `readonly` **underlying**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/WrappedToken.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/WrappedToken.ts#L10)

#### Inherited from

[`VaultToken`](VaultToken.md).[`underlying`](VaultToken.md#underlying)

***

### withdrawQueue

> **withdrawQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:119](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L119)

The MetaMorpho vault's ordered withdraw queue.

#### Implementation of

[`IVault`](../interfaces/IVault.md).[`withdrawQueue`](../interfaces/IVault.md#withdrawqueue)

## Accessors

### totalInterest

#### Get Signature

> **get** **totalInterest**(): `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:182](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L182)

The amount of interest in assets accrued since the last interaction with the vault.

##### Returns

`bigint`

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

[`VaultToken`](VaultToken.md).[`_unwrap`](VaultToken.md#_unwrap)

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

[`VaultToken`](VaultToken.md).[`_wrap`](VaultToken.md#_wrap)

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

[`VaultToken`](VaultToken.md).[`fromUsd`](VaultToken.md#fromusd)

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

[`VaultToken`](VaultToken.md).[`toUnwrappedExactAmountIn`](VaultToken.md#tounwrappedexactamountin)

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

[`VaultToken`](VaultToken.md).[`toUnwrappedExactAmountOut`](VaultToken.md#tounwrappedexactamountout)

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

[`VaultToken`](VaultToken.md).[`toUsd`](VaultToken.md#tousd)

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

[`VaultToken`](VaultToken.md).[`toWrappedExactAmountIn`](VaultToken.md#towrappedexactamountin)

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

[`VaultToken`](VaultToken.md).[`toWrappedExactAmountOut`](VaultToken.md#towrappedexactamountout)

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

[`VaultToken`](VaultToken.md).[`native`](VaultToken.md#native)
