[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulateParams

# Interface: SimulateParams

Defined in: [packages/evm-simulation/src/types.ts:165](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L165)

Input to `simulate`. Pin a `blockNumber` for deterministic / historical
simulation; omit to simulate against `latest`.

## Properties

### authorizations?

> `optional` **authorizations?**: [`SimulationAuthorization`](../type-aliases/SimulationAuthorization.md)[]

Defined in: [packages/evm-simulation/src/types.ts:168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L168)

***

### blockNumber?

> `optional` **blockNumber?**: `bigint` \| `BlockTag`

Defined in: [packages/evm-simulation/src/types.ts:169](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L169)

***

### chainId

> **chainId**: `number`

Defined in: [packages/evm-simulation/src/types.ts:166](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L166)

***

### transactions

> **transactions**: [`SimulationTransaction`](SimulationTransaction.md)[]

Defined in: [packages/evm-simulation/src/types.ts:167](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L167)
