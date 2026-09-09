[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / simulate

# Function: simulate()

> **simulate**(`config`, `params`): `Promise`\<[`SimulationResult`](../interfaces/SimulationResult.md)\>

Defined in: [packages/evm-simulation/src/simulate/simulate.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/simulate/simulate.ts#L79)

Simulate a bundle of EVM transactions.

Validates input → resolves authorizations into prepended approve txs → runs the bundle
through Tenderly RPC (primary) or `eth_simulateV1` (fallback) with a shared timeout
budget → parses ERC20/WETH transfers from per-tx logs → asserts no funds are retained
by `bundler3` or the standalone `bundles` periphery contracts → returns the full result
set. The caller reads whichever fields they need:

- `transfers` → user-facing preview / server-side verification.
- `simulationTxs` + `transfers` → server-side verification before broadcast.
- `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`, `gasUsed`).
  Aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe gas limit; consumers
  deriving one must add their own headroom.
- `assetChanges` → net per-asset balance changes grouped by account (sender and
  counterparties) over the whole bundle, normalized to the same shape across backends.
- `transfers[k].txIdx` → index into `simulationTxs` of the tx that emitted the
  underlying log; consumers map back via `simulationTxs[transfer.txIdx]`.

## Parameters

### config

[`SimulationConfig`](../interfaces/SimulationConfig.md)

Backend configuration: per-chain Tenderly RPC and/or `eth_simulateV1`
  URL, optional logger, and the overall timeout budget.

### params

[`SimulateParams`](../interfaces/SimulateParams.md)

Per-call simulation input.

## Returns

`Promise`\<[`SimulationResult`](../interfaces/SimulationResult.md)\>

A [SimulationResult](../interfaces/SimulationResult.md) carrying the resolved `simulationTxs`, per-tx
  `calls` (aligned 1:1 with `simulationTxs`), parsed `transfers` (each stamped
  with `txIdx`), and per-account net `assetChanges`.

## Throws

for invalid input (mixed senders, bad addresses,
  empty transactions, malformed authorizations).

## Throws

when the chain is not configured for any backend.

## Throws

when the bundle reverts on either backend.

## Throws

when the simulation leaves value retained beyond
  the dust threshold by a restricted `bundler3` address or a `bundles` periphery
  contract (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1). Never bypassable.

## Throws

(a) when both backends are unavailable within the
  timeout budget, or (b) when a backend returns a `calls` array whose length does
  not match the resolved `simulationTxs` — refusing to map transfers with mismatched
  per-tx output.

## Example

```ts
import { simulate } from "@morpho-org/evm-simulation";

const result = await simulate(
  {
    chains: new Map([
      [1, {
        tenderlyRpc: { rpcUrl: process.env.TENDERLY_RPC_URL! },
        simulateV1Url: process.env.MAINNET_RPC_URL,
      }],
    ]),
  },
  {
    chainId: 1,
    transactions: [{ from: user, to: vaultAddress, data: encodedCalldata, value: 0n }],
  },
);
// result satisfies SimulationResult
```
