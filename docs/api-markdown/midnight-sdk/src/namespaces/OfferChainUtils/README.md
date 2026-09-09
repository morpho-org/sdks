[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / OfferChainUtils

# OfferChainUtils

Utilities for building time-bounded Midnight offer chains.

A Midnight offer has one fixed price, so its displayed yearly rate changes
as maturity approaches. The markets app uses these helpers when a maker wants
to post, for example, a 5% order for several months: the app builds several
adjacent offers sharing the same reserve, each with a different tick and time
window, so the order reviews and renders as a stable 5% order across the
selected window instead of drifting upward as time passes.

## Example

```ts
import { OfferChainUtils } from "@morpho-org/midnight-sdk";

const legs = OfferChainUtils.buildLendFixedRateOfferChain({
  targetRate: 0.05,
  tickSpacing: 4n,
  maturityTimestamp: 1_798_761_600n,
  chainStartTimestamp: 1_767_225_600n,
  chainEndTimestamp: 1_791_153_600n,
});
console.log(legs[0]?.tick);
```

## Variables

- [MAX\_EXPIRY\_TTM\_FRACTION](variables/MAX_EXPIRY_TTM_FRACTION.md)

## Functions

- [buildBorrowFixedRateOfferChain](functions/buildBorrowFixedRateOfferChain.md)
- [buildLendFixedRateOfferChain](functions/buildLendFixedRateOfferChain.md)
- [getMaxFixedRateOfferChainEndTimestamp](functions/getMaxFixedRateOfferChainEndTimestamp.md)
