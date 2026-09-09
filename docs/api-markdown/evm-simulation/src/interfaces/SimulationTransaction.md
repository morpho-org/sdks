[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulationTransaction

# Interface: SimulationTransaction

Defined in: [packages/evm-simulation/src/types.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L57)

A single EVM call to simulate. `from` must be identical across all transactions
in a bundle — the orchestrator rejects mixed senders with `SimulationValidationError`.

## Properties

### data

> **data**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L60)

***

### from

> **from**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L58)

***

### to

> **to**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L59)

***

### value?

> `optional` **value?**: `bigint`

Defined in: [packages/evm-simulation/src/types.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L61)
