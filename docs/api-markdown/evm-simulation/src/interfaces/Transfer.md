[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / Transfer

# Interface: Transfer

Defined in: [packages/evm-simulation/src/types.ts:113](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L113)

A parsed ERC20 / WETH9 transfer extracted from simulation logs. Returned in
`SimulationResult.transfers`.

## Properties

### amount

> `readonly` **amount**: `bigint`

Defined in: [packages/evm-simulation/src/types.ts:117](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L117)

***

### from

> `readonly` **from**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L115)

***

### to

> `readonly` **to**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:116](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L116)

***

### token

> `readonly` **token**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:114](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L114)

***

### txIdx

> `readonly` **txIdx**: `number`

Defined in: [packages/evm-simulation/src/types.ts:124](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L124)

Index into `SimulationResult.simulationTxs` of the transaction that
emitted the underlying log. For bundles with prepended authorization
approvals, indices `[0, simulationTxs.length - params.transactions.length)`
are authorization txs; the remainder are caller-supplied.
