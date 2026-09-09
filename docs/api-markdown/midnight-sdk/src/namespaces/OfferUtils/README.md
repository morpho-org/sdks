[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / OfferUtils

# OfferUtils

Object-compatible helpers for Midnight offer construction, grouping, and
take-side encoding.

Make-side apps usually call [Offer.create](../../classes/Offer.md#create), then `Group.create` or
`Tree.create`. Use these helpers when you need the same validation or ABI
conversion without depending on class instances, or when converting API data
into the structs consumed by payload and take encoders.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

console.log(typeof OfferUtils.getOfferExpiry);
```

## Functions

- [getApr](functions/getApr.md)
- [getConsumableUnits](functions/getConsumableUnits.md)
- [getOfferExpiry](functions/getOfferExpiry.md)
- [getPrice](functions/getPrice.md)
- [getRate](functions/getRate.md)
- [groupHash](functions/groupHash.md)
- [hash](functions/hash.md)
- [hashStruct](functions/hashStruct.md)
- [resolveReceiverIfMakerIsSeller](functions/resolveReceiverIfMakerIsSeller.md)
- [toStruct](functions/toStruct.md)
- [validateContinuousFeeCap](functions/validateContinuousFeeCap.md)
- [validateOfferCaps](functions/validateOfferCaps.md)
- [validateOfferGroup](functions/validateOfferGroup.md)
- [validateOfferParams](functions/validateOfferParams.md)
- [validateOfferTick](functions/validateOfferTick.md)
- [validateOfferTimeRange](functions/validateOfferTimeRange.md)
