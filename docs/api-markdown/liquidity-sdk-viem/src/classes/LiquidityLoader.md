[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [liquidity-sdk-viem/src](../README.md) / LiquidityLoader

# Class: LiquidityLoader\<chain\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L38)

## Type Parameters

### chain

`chain` *extends* `Chain` = `Chain`

## Constructors

### Constructor

> **new LiquidityLoader**\<`chain`\>(`client`, `parameters?`): `LiquidityLoader`\<`chain`\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L49)

#### Parameters

##### client

`Client`\<`Transport`, `chain`\>

##### parameters?

[`LiquidityParameters`](../interfaces/LiquidityParameters.md) = `{}`

Shared-liquidity source-market withdrawal tuning.

#### Returns

`LiquidityLoader`\<`chain`\>

## Properties

### client

> **client**: `Client`\<`Transport`, `chain`\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L50)

***

### dataLoader

> `protected` `readonly` **dataLoader**: `DataLoader`\<[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md), \{ `endState`: `VaultV1ReallocationData`; `startState`: `VaultV1ReallocationData`; `targetBorrowUtilization`: `bigint`; `withdrawals`: readonly [`PublicReallocation`](../../../morpho-sdk/src/interfaces/PublicReallocation.md)[]; \}\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L39)

***

### parameters

> `readonly` **parameters**: [`LiquidityParameters`](../interfaces/LiquidityParameters.md) = `{}`

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L52)

Shared-liquidity source-market withdrawal tuning.

## Methods

### fetch()

> **fetch**(`marketId`): `Promise`\<\{ `endState`: `VaultV1ReallocationData`; `startState`: `VaultV1ReallocationData`; `targetBorrowUtilization`: `bigint`; `withdrawals`: readonly [`PublicReallocation`](../../../morpho-sdk/src/interfaces/PublicReallocation.md)[]; \}\>

Defined in: [packages/liquidity-sdk-viem/src/loader.ts:244](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/liquidity-sdk-viem/src/loader.ts#L244)

Fetches the shared-liquidity plan for a target market from the Morpho API and onchain state.

#### Parameters

##### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Target market id to plan withdrawals for.

#### Returns

`Promise`\<\{ `endState`: `VaultV1ReallocationData`; `startState`: `VaultV1ReallocationData`; `targetBorrowUtilization`: `bigint`; `withdrawals`: readonly [`PublicReallocation`](../../../morpho-sdk/src/interfaces/PublicReallocation.md)[]; \}\>

The start state, simulated end state, computed withdrawals, and target borrow utilization.

#### Remarks

The returned `endState` is produced by `ReallocationData.getMarketPublicReallocations`
from onchain inputs fetched at one block, with reallocation headroom evaluated one hour after
that block timestamp.

#### Example

```ts
import type { MarketId } from "@morpho-org/blue-sdk";
import { LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://rpc.example"),
});
const loader = new LiquidityLoader(client);

const marketId =
  "0x7bbbb127f5d2886295f50f3cdf86231d9ff45f248639ee1fd3f2bd5d8b129dcf" as MarketId;
const { withdrawals, endState } = await loader.fetch(marketId);

// withdrawals: readonly PublicReallocation[]
// endState: ReallocationData
```
