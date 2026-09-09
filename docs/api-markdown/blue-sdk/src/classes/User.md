[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / User

# Class: User

Defined in: [packages/blue-sdk/src/user/User.ts:4](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/user/User.ts#L4)

Represents a Morpho Blue user authorization and nonce state.

## Constructors

### Constructor

> **new User**(`__namedParameters`): `User`

Defined in: [packages/blue-sdk/src/user/User.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/user/User.ts#L20)

#### Parameters

##### \_\_namedParameters

###### address

`` `0x${string}` ``

###### isBundlerAuthorized

`boolean`

###### morphoNonce

`bigint`

#### Returns

`User`

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/user/User.ts:8](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/user/User.ts#L8)

The user's address.

***

### isBundlerAuthorized

> **isBundlerAuthorized**: `boolean`

Defined in: [packages/blue-sdk/src/user/User.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/user/User.ts#L13)

Whether the bundler is authorized to manage the user's position on Morpho Blue.

***

### morphoNonce

> **morphoNonce**: `bigint`

Defined in: [packages/blue-sdk/src/user/User.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/user/User.ts#L18)

The user's nonce on Morpho Blue.
