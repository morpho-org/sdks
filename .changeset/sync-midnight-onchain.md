---
"@morpho-org/midnight-sdk": minor
---

Sync the SDK with `morpho-org/midnight@55db096af93a8f2bc85bb67f3ccc7b92e1bfab73`.

Regenerate the pinned Midnight and ratifier ABIs from the updated onchain source. This picks up the configurator rename, enabled LLTV and liquidation cursor getters/setters, new market validation errors, updated ratifier ABI details, and removes the deleted `MidnightBundles` ABI surface.

Update market params to match the new protocol struct: markets now carry `chainId` and the core `midnight` address, and each collateral uses `liquidationCursor` instead of `maxLif`. These fields are reflected across SDK types, API mappings, payload encoding/decoding, offer structs, EIP-712 typed data, market hashing, Merkle tree padding, fixtures, and documentation examples.

Update `MarketUtils.toId` to mirror the new `IdLib.toId` behavior by encoding the full market struct and deriving the id with the embedded Midnight address and zero salt. Market hash and offer/tree signature fixtures were refreshed for the new type hashes.

Mirror the new `Midnight.touchMarket` checks in SDK normalization and payload validation: reject malformed or negative chain ids, too many collaterals, invalid liquidation cursors, computed maximum LIF above `2 WAD`, and non-WAD LLTV values whose computed maximum LIF product exceeds the protocol bound.
