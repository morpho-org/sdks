[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / RawLog

# Interface: RawLog

Defined in: [packages/evm-simulation/src/types.ts:190](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L190)

Normalized EVM log emitted by a single simulated call. The shape is the
common subset both backends (`eth_simulateV1` via viem and Tenderly RPC)
produce after schema validation. Returned indirectly via
`SimulationCall.logs` and consumed by the SDK's transfer parser.

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:191](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L191)

***

### data

> `readonly` **data**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:193](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L193)

***

### topics

> `readonly` **topics**: readonly `` `0x${string}` ``[]

Defined in: [packages/evm-simulation/src/types.ts:192](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L192)
