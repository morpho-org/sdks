[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / RatifierUtils

# RatifierUtils

Utilities for selecting Midnight ratifier routes.

Call these during make-side preparation, before `Offer.create`, when an app
must decide whether a maker can sign an Ecrecover root or must approve a
Setter root onchain. Fetch helpers read bytecode for you; this namespace is
the pure classification logic.

## Example

```ts
import { RatifierUtils } from "@morpho-org/midnight-sdk";

console.log(RatifierUtils.isEip7702Designator("0xef0100"));
```

## Functions

- [getRatifierInfo](functions/getRatifierInfo.md)
- [isEip7702Designator](functions/isEip7702Designator.md)
- [normalizeRatifierTree](functions/normalizeRatifierTree.md)
