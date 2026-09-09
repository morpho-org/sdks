[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2BlueReallocationSource

# Type Alias: VaultV2BlueReallocationSource

> **VaultV2BlueReallocationSource** = \{ `adapter`: `Address`; `marketParams`: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md); `type`: `"market"`; \} \| \{ `type`: `"idle"`; \}

Defined in: [packages/morpho-sdk/src/types/sharedLiquidity.ts:129](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/sharedLiquidity.ts#L129)

Source of a Vault V2 BluePublicAllocator reallocation.

## Union Members

### Type Literal

\{ `adapter`: `Address`; `marketParams`: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md); `type`: `"market"`; \}

#### adapter

> `readonly` **adapter**: `Address`

Vault V2 adapter supplying the source market.

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

Source market parameters.

#### type

> `readonly` **type**: `"market"`

Reallocate from a Morpho Blue market.

***

### Type Literal

\{ `type`: `"idle"`; \}

#### type

> `readonly` **type**: `"idle"`

Allocate from vault idle liquidity without a synthetic market.
