[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / ChainSimulationConfig

# Type Alias: ChainSimulationConfig

> **ChainSimulationConfig** = \{ `simulateV1Url?`: `string`; `tenderlyRpc`: [`TenderlyRpcConfig`](../interfaces/TenderlyRpcConfig.md); \} \| \{ `simulateV1Url`: `string`; `tenderlyRpc?`: [`TenderlyRpcConfig`](../interfaces/TenderlyRpcConfig.md); \}

Defined in: [packages/evm-simulation/src/types.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L20)

Per-chain backend capabilities. Exactly one configuration shape per chain;
the discriminated union enforces that **at least one** of `tenderlyRpc`
(primary) or `simulateV1Url` (fallback) is supplied.

## Union Members

### Type Literal

\{ `simulateV1Url?`: `string`; `tenderlyRpc`: [`TenderlyRpcConfig`](../interfaces/TenderlyRpcConfig.md); \}

#### simulateV1Url?

> `optional` **simulateV1Url?**: `string`

JSON-RPC URL supporting `eth_simulateV1`. Optional when Tenderly is set.

#### tenderlyRpc

> **tenderlyRpc**: [`TenderlyRpcConfig`](../interfaces/TenderlyRpcConfig.md)

Tenderly RPC config — `tenderly_simulateTransaction` / `tenderly_simulateBundle`.

***

### Type Literal

\{ `simulateV1Url`: `string`; `tenderlyRpc?`: [`TenderlyRpcConfig`](../interfaces/TenderlyRpcConfig.md); \}
