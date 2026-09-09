[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Eip5267Domain

# Class: Eip5267Domain

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L27)

Represents an EIP-5267 signing domain and derived EIP-712 domain object.

## Implements

- [`IEip5267Domain`](../interfaces/IEip5267Domain.md)

## Constructors

### Constructor

> **new Eip5267Domain**(`__namedParameters`): `Eip5267Domain`

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L69)

#### Parameters

##### \_\_namedParameters

[`IEip5267Domain`](../interfaces/IEip5267Domain.md)

#### Returns

`Eip5267Domain`

## Properties

### chainId

> `readonly` **chainId**: `bigint`

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L48)

The EIP-155 chain id.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`chainId`](../interfaces/IEip5267Domain.md#chainid)

***

### eip712Domain

> `readonly` **eip712Domain**: `object`

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L67)

#### chainId?

> `optional` **chainId?**: `number`

#### name?

> `optional` **name?**: `string`

#### salt?

> `optional` **salt?**: `` `0x${string}` ``

#### verifyingContract?

> `optional` **verifyingContract?**: `` `0x${string}` ``

#### version?

> `optional` **version?**: `string`

***

### extensions

> `readonly` **extensions**: readonly `bigint`[]

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L65)

A list of EIP numbers, each of which MUST refer to an EIP that extends EIP-712 with new domain fields, along with a method to obtain the value for those fields, and potentially conditions for inclusion.
The value of fields does not affect their inclusion.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`extensions`](../interfaces/IEip5267Domain.md#extensions)

***

### fields

> `readonly` **fields**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L32)

A bit map where bit i is set to 1 if and only if domain field i is present (0 ≤ i ≤ 4).
Bits are read from least significant to most significant, and fields are indexed in the order that is specified by EIP-712, identical to the order in which they are listed in the function type.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`fields`](../interfaces/IEip5267Domain.md#fields)

***

### name

> `readonly` **name**: `string`

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L37)

The user readable name of signing domain, i.e. the name of the DApp or the protocol.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`name`](../interfaces/IEip5267Domain.md#name)

***

### salt

> `readonly` **salt**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L59)

A disambiguating salt for the protocol.
This can be used as a domain separator of last resort.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`salt`](../interfaces/IEip5267Domain.md#salt)

***

### verifyingContract

> `readonly` **verifyingContract**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L53)

The address of the contract that will verify the EIP-712 signature.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`verifyingContract`](../interfaces/IEip5267Domain.md#verifyingcontract)

***

### version

> `readonly` **version**: `string`

Defined in: [packages/blue-sdk/src/token/Eip5267Domain.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Eip5267Domain.ts#L43)

The current major version of the signing domain.
Signatures from different versions are not compatible.

#### Implementation of

[`IEip5267Domain`](../interfaces/IEip5267Domain.md).[`version`](../interfaces/IEip5267Domain.md#version)
