[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [liquidity-sdk-viem/src](../README.md) / LiquidityParameters

# Interface: LiquidityParameters

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L20)

Optional tuning for the shared-liquidity source-market withdrawal ceiling.

## Properties

### defaultMaxWithdrawalUtilization?

> `optional` **defaultMaxWithdrawalUtilization?**: `bigint`

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L26)

The default maximum utilization allowed to reach to find shared liquidity (scaled by WAD).

#### Default

```ts
90% (900000000000000000n)
```

***

### ~~maxWithdrawalUtilization?~~

> `optional` **maxWithdrawalUtilization?**: `Record`\<[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md), `bigint`\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L35)

If provided, defines the maximum utilization allowed to reach for each market, defaulting to `defaultMaxWithdrawalUtilization`.

#### Deprecated

Per-market source ceilings will be removed in the next major.
Use `defaultMaxWithdrawalUtilization` to configure one ceiling for every
source. The Morpho API's `targetWithdrawUtilization` is no longer consulted.
