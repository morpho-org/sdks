[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / AssetChange

# Interface: AssetChange

Defined in: [packages/evm-simulation/src/types.ts:85](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L85)

Net balance change for a single asset (one token) within an account's entry.
Native ETH uses viem's `ethAddress` sentinel as `token`. `symbol`/`decimals`
are best-effort and may be absent, notably on the `eth_simulateV1` fallback.

## Properties

### decimals?

> `readonly` `optional` **decimals?**: `number`

Defined in: [packages/evm-simulation/src/types.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L88)

***

### diff

> `readonly` **diff**: `bigint`

Defined in: [packages/evm-simulation/src/types.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L90)

Signed net change of the account's balance, in raw token units.

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/evm-simulation/src/types.ts:87](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L87)

***

### token

> `readonly` **token**: `` `0x${string}` ``

Defined in: [packages/evm-simulation/src/types.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L86)
