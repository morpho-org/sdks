---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
---

Add `RateRatifierV1Utils` and `PriceRatifierV1Utils` (leaf hashing, Merkle trees, ratifier data encoding/verification, rate price bounds, `setIsRootRatified` encoders), `priceRatifierV1Abi`/`rateRatifierV1Abi`, and V1 offer typehash constants. Add `TreeUtils.buildRoot`/`verifyLeafProof`. Register `priceRatifierV1` and `rateRatifierV1` address keys as zero addresses until deployment, and expose the new Midnight symbols through the `morpho-sdk` facade.
