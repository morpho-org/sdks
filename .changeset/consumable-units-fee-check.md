---
"@morpho-org/midnight-sdk": patch
---

`OfferUtils.getConsumableUnits` now validates the settlement fee against the offer price before returning unit-capped capacity, so a unit-capped buy offer whose fee exceeds its price throws `SettlementFeeExceedsPriceError` instead of being reported as consumable.
