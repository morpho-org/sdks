[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / SettlementFeeCbps

# Type Alias: SettlementFeeCbps

> **SettlementFeeCbps** = readonly \[`number`, `number`, `number`, `number`, `number`, `number`, `number`\]

Defined in: [packages/midnight-sdk/src/market/Market.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L22)

Seven settlement-fee centibip buckets stored on a Midnight market.

## Example

```ts
import type { SettlementFeeCbps } from "@morpho-org/midnight-sdk";

const cbps: SettlementFeeCbps = [0, 0, 0, 0, 0, 0, 0];
console.log(cbps.length);
```
