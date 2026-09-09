[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / AuthorizationAction

# Interface: AuthorizationAction

Defined in: [packages/morpho-sdk/src/types/action.ts:600](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L600)

Signable Morpho authorization requirement. Emitted by the entity layer when a bundled path
needs GeneralAdapter1 authorized and the client opts into offchain signatures.

## Extends

- [`BaseAction`](BaseAction.md)\<`"authorization"`, \{ `authorized`: `Address`; `deadline`: `bigint`; `isAuthorized`: `boolean`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### authorized

> **authorized**: `` `0x${string}` ``

#### deadline

> **deadline**: `bigint`

#### isAuthorized

> **isAuthorized**: `boolean`

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"authorization"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
