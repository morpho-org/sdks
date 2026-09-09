[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / TickLib

# TickLib

TypeScript port of Midnight `TickLib`.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

console.log(TickLib.tickToPrice(6744n));
```

## Variables

- [EXP\_OFFSET](variables/EXP_OFFSET.md)
- [LN\_2](variables/LN_2.md)
- [LN\_ONE\_PLUS\_DELTA](variables/LN_ONE_PLUS_DELTA.md)

## Functions

- [assertTickAlignedToSpacing](functions/assertTickAlignedToSpacing.md)
- [assertTickInRange](functions/assertTickInRange.md)
- [divHalfDownUnchecked](functions/divHalfDownUnchecked.md)
- [priceToTick](functions/priceToTick.md)
- [rateToPrice](functions/rateToPrice.md)
- [snapPriceToTick](functions/snapPriceToTick.md)
- [tickToApr](functions/tickToApr.md)
- [tickToPrice](functions/tickToPrice.md)
- [tickToRate](functions/tickToRate.md)
- [wExp](functions/wExp.md)
