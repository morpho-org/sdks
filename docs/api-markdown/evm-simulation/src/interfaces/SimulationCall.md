[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulationCall

# Interface: SimulationCall

Defined in: [packages/evm-simulation/src/types.ts:217](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L217)

Per-transaction normalized output from the simulation backend.

`SimulationResult.calls[i]` corresponds 1:1 with
`SimulationResult.simulationTxs[i]`. Use this to read raw logs, status,
return data, and gas used. Net asset changes are reported at the bundle
level — see `SimulationResult.assetChanges`.

## Properties

### gasUsed

> `readonly` **gasUsed**: `bigint`

Defined in: [packages/evm-simulation/src/types.ts:234](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L234)

Gas consumed by this call's root frame, not a safe gas limit. This is
post-refund consumption and does not account for EIP-150's 63/64 rule in
nested calls, so consumers deriving a limit must add their own headroom,
larger than headroom derived from `eth_estimateGas`.

***

### logs

> `readonly` **logs**: readonly [`RawLog`](RawLog.md)[]

Defined in: [packages/evm-simulation/src/types.ts:218](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L218)

***

### returnData

> `readonly` **returnData**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:227](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L227)

Return data from the top-level call.

***

### status

> `readonly` **status**: `boolean`

Defined in: [packages/evm-simulation/src/types.ts:225](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L225)

True iff the call succeeded. The bundle as a whole reverts via
`SimulationRevertedError` before the result is returned, so on a
successful `simulate()` every entry is `true` today. Field kept for
forward-compatibility with backends that may surface per-call status.
