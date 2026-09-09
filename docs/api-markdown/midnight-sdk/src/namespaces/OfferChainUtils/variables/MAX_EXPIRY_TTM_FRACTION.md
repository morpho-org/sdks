[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferChainUtils](../README.md) / MAX\_EXPIRY\_TTM\_FRACTION

# Variable: MAX\_EXPIRY\_TTM\_FRACTION

> `const` **MAX\_EXPIRY\_TTM\_FRACTION**: `0.75` = `0.75`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L76)

Maximum fraction of the initial time-to-maturity covered by a fixed-rate offer chain.

Use this cap before displaying an expiry picker for a fixed-rate maker
order. The last part of the maturity window is intentionally excluded
because tiny time changes cause large displayed-rate drift.

## Example

```ts
import { OfferChainUtils } from "@morpho-org/midnight-sdk";

console.log(OfferChainUtils.MAX_EXPIRY_TTM_FRACTION);
```
