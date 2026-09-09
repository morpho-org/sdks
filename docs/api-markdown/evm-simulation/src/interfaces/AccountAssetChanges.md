[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / AccountAssetChanges

# Interface: AccountAssetChanges

Defined in: [packages/evm-simulation/src/types.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L104)

Net per-token balance changes for one account over the whole bundle. Returned
for every account that nets a non-zero change, the sender and counterparties
alike (the zero address is kept for mints/burns). Accounts and their `changes`
are sorted by address for deterministic, cross-backend output.

Both backends report the full net native-ETH delta, including ETH moved via
internal calls (e.g. a `WETH.withdraw` refund): Tenderly derives it from its
trace, and the `eth_simulateV1` fallback runs with `traceTransfers` so the
node synthesizes native moves as transfer logs under viem's `ethAddress`.

## Properties

### account

> `readonly` **account**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:105](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L105)

***

### changes

> `readonly` **changes**: readonly [`AssetChange`](AssetChange.md)[]

Defined in: [packages/evm-simulation/src/types.ts:106](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L106)
