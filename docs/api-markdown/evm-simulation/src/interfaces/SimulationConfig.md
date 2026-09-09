[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulationConfig

# Interface: SimulationConfig

Defined in: [packages/evm-simulation/src/types.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L39)

Top-level configuration for `simulate`.

Every chain entry must declare at least one backend (Tenderly RPC primary,
`eth_simulateV1` fallback, or both). Calling `simulate` for a `chainId`
missing from `chains` throws `UnsupportedChainError`.

## Properties

### chains

> **chains**: `Map`\<`number`, [`ChainSimulationConfig`](../type-aliases/ChainSimulationConfig.md)\>

Defined in: [packages/evm-simulation/src/types.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L41)

Per-chain simulation capabilities.

***

### logger?

> `optional` **logger?**: [`SimulationLogger`](SimulationLogger.md)

Defined in: [packages/evm-simulation/src/types.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L42)

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [packages/evm-simulation/src/types.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L47)

Overall timeout budget in ms (default 5000). Tenderly gets ~60% of budget.
On timeout/failure, fallback gets remaining time (deadline - now).
