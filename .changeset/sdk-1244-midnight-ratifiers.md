---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/evm-simulation": patch
---

Add `RateRatifierV1Utils` and `PriceRatifierV1Utils` (leaf hashing, Merkle trees, ratifier data encoding/verification, rate price bounds, `setIsRootRatified` encoders), `priceRatifierV1Abi`/`rateRatifierV1Abi`, and V1 offer typehash constants. Add `TreeUtils.buildRootFromLeaves`/`verifyLeafProof` and the `MAX_TREE_HEIGHT` constant. Caller-provided V1 tree descriptors are fully re-validated before use, and negative rate/time bounds throw `InvalidRateRatifierV1RateError`/`InvalidRateRatifierV1TimeError`. Add `priceRatifierV1` and `rateRatifierV1` keys to `ChainAddresses` with Ethereum, Base, Arc and Robinhood mainnet registry entries, and expose the new Midnight symbols through the `morpho-sdk` facade.
