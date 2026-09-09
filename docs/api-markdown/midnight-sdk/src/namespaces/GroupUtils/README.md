[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / GroupUtils

# GroupUtils

Make-side helpers for Midnight offer groups.

Groups sit between `Offer.create` and `Tree.create`: they assign a
content-addressed group id to offers that share one consumption bucket. One
group must use one cap mode and value because Midnight tracks a single
consumed scalar per maker and group. Tree helpers derive that id for explicit
groups and preserve it on grouped offer copies.

## Example

```ts
import { GroupUtils } from "@morpho-org/midnight-sdk";

console.log(typeof GroupUtils.hash);
```

## Functions

- [hash](functions/hash.md)
- [isGroupInput](functions/isGroupInput.md)
- [toStructs](functions/toStructs.md)
