[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulationResult

# Interface: SimulationResult

Defined in: [packages/evm-simulation/src/types.ts:140](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L140)

Happy-path return of `simulate`. All failures throw typed errors.

- `simulationTxs` is the full resolved transaction list (including
  prepended authorization txs).
- `calls[i]` corresponds 1:1 with `simulationTxs[i]` — read raw logs,
  status, returnData/gasUsed.
- `assetChanges` is the net per-asset balance change over the whole bundle,
  grouped by account (sender and counterparties), normalized to the same
  shape across backends — see `AccountAssetChanges`.
- `transfers[k].txIdx` indexes into `simulationTxs` to attribute each
  transfer to its emitting transaction.

## Properties

### assetChanges

> `readonly` **assetChanges**: readonly [`AccountAssetChanges`](AccountAssetChanges.md)[]

Defined in: [packages/evm-simulation/src/types.ts:151](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L151)

Net per-asset balance changes, grouped by account, over the whole bundle.

***

### calls

> `readonly` **calls**: readonly [`SimulationCall`](SimulationCall.md)[]

Defined in: [packages/evm-simulation/src/types.ts:147](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L147)

Per-transaction normalized output. `calls[i]` corresponds 1:1 with
`simulationTxs[i]`. Use this to read raw logs, status, return data, gas used.

***

### simulationTxs

> `readonly` **simulationTxs**: readonly [`SimulationTransaction`](SimulationTransaction.md)[]

Defined in: [packages/evm-simulation/src/types.ts:142](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L142)

The full resolved transaction list (including prepended authorization txs).

***

### transfers

> `readonly` **transfers**: readonly [`Transfer`](Transfer.md)[]

Defined in: [packages/evm-simulation/src/types.ts:149](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L149)

Parsed ERC-20 / WETH9 transfers from the simulation.
