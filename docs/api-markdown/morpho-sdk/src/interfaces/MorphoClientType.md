[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MorphoClientType

# Interface: MorphoClientType

Defined in: [packages/morpho-sdk/src/types/client.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L16)

Structural contract the `morpho` namespace satisfies — the object exposed under `client.morpho`
once a viem client is extended with [morphoViemExtension](../functions/morphoViemExtension.md). Carries the viem client, the
resolved options bag, and the four entity-factory methods the SDK exposes.

## Properties

### blue

> **blue**: (`marketParams`, `chainId`) => [`BlueActions`](BlueActions.md)

Defined in: [packages/morpho-sdk/src/types/client.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L26)

#### Parameters

##### marketParams

[`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

##### chainId

`number`

#### Returns

[`BlueActions`](BlueActions.md)

***

### midnight

> **midnight**: (`chainId`) => [`MidnightActions`](../type-aliases/MidnightActions.md)

Defined in: [packages/morpho-sdk/src/types/client.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L27)

#### Parameters

##### chainId

`number`

#### Returns

[`MidnightActions`](../type-aliases/MidnightActions.md)

***

### options

> `readonly` **options**: `object`

Defined in: [packages/morpho-sdk/src/types/client.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L18)

#### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

#### supportDeployless?

> `readonly` `optional` **supportDeployless?**: `boolean`

#### supportSignature

> `readonly` **supportSignature**: `boolean`

***

### vaultV1

> **vaultV1**: (`vault`, `chainId`) => [`VaultV1Actions`](VaultV1Actions.md)

Defined in: [packages/morpho-sdk/src/types/client.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L24)

#### Parameters

##### vault

`` `0x${string}` ``

##### chainId

`number`

#### Returns

[`VaultV1Actions`](VaultV1Actions.md)

***

### vaultV2

> **vaultV2**: (`vault`, `chainId`) => [`VaultV2Actions`](VaultV2Actions.md)

Defined in: [packages/morpho-sdk/src/types/client.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L25)

#### Parameters

##### vault

`` `0x${string}` ``

##### chainId

`number`

#### Returns

[`VaultV2Actions`](VaultV2Actions.md)

***

### viemClient

> `readonly` **viemClient**: `Client`

Defined in: [packages/morpho-sdk/src/types/client.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/client.ts#L17)
