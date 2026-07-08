# @morpho-org/midnight-sdk

## 1.0.0

### Major Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Add `@morpho-org/midnight-sdk` as a Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities under a dedicated `@morpho-org/midnight-sdk/api` subpath.

  The initial surface includes pinned Midnight ABI literals, ABI-compatible market/position/offer values, `MarketParams.from`, `Market.from`, `Offer.create`, `Offer.from`, `Group`, `Group.from`, `Tree`, and `Tree.from` class APIs, object-compatible `MarketUtils`, `OfferUtils`, `GroupUtils`, and `TreeUtils` helpers, tree mempool validation through `Tree.mempoolValidate`, tick and units/assets math helpers, viem-backed fetch helpers with deployless position reads, ratifier classification, Ecrecover/Setter ratifier data codecs, local offer-proof verification, raw mempool payload encoding/decoding, and Midnight public API book/quote/takeable-offer/validation helpers.

  The payload codec rejects non-padding offer bytes unless exactly one of `maxUnits` and `maxAssets` is non-zero.

  The payload codec caps the full framed wire payload at 1,000,000 bytes and derives the compressed item budget after reserving the header and maximum attribution suffix.

  Offers include the protocol `continuousFeeCap` field in SDK types, API mappings, payload encoding/decoding, Merkle leaf hashing, and EIP-712 ratifier typed data so maker signatures match the current Midnight contracts.

  Payload collateral validation mirrors `Midnight.touchMarket` by rejecting zero collateral tokens and liquidation cursors whose computed max LIF violates protocol bounds.

  Payload and market construction reject LLTV values outside the protocol's fixed `[0, WAD]` range while still allowing dynamically configured LLTV tiers inside that range.

  Market hashing canonicalizes non-empty collateral params by token order while preserving raw empty-market hashing for protocol padding.

  `MarketParams` rejects empty collateral lists and duplicate collateral token entries, then normalizes collateral params into onchain token order before offer grouping, tree construction, or signing flows.

  `Market.getCollateralByIndex` and `MarketUtils.getCollateralByIndex` return configured collateral entries and throw `UnknownCollateralIndexError` when an index is unconfigured.

  Offer creation and payload validation reject `expiry` before `start` while allowing zero-duration time ranges that Midnight can take onchain.

  Ecrecover ratification supports direct maker signatures and delegated signer signatures, including mixed-maker trees when the same signer is authorized by every maker onchain.

  Ecrecover ratification accepts a viem client plus explicit signer account, infers a single EIP-712 domain chain id from the offer tree, rejects mixed-chain Ecrecover trees, checks the client is on that chain before signing, and validates client-produced or precomputed signatures against the tree root before producing payload items.

  Ecrecover client signing rejects typed-data signatures that do not recover to the requested signer account.

  `Tree.mempoolValidate` accepts optional ratification inputs so callers can validate final payload bytes with Ecrecover signature data or Setter proof data instead of only validating the pre-ratification tree with empty `ratifierData`.

  `OfferUtils.getConsumableUnits` and `Offer.getConsumableUnits` compute remaining units from hydrated market state plus a caller-provided `consumed` value, with examples inlining the single `Midnight.consumed(maker, group)` read.

  Asset-capped buy-offer consumable units mirror Midnight `take` cap checks by returning the largest unit amount whose rounded-down buyer assets fit within the remaining asset cap.

  Offer creation only accepts protocol-reachable tick spacings and offer groups require a shared cap mode and value, matching Midnight's tick accessibility and group consumption accounting.

  Tick math constants mirror the current Midnight protocol range and price quantum, with `TickLib.tickToApr` plus offer-level price, rate, and APR helpers for simple annualization over a market's time to maturity.

  The package exports `midnightBundlesAbi` for app-compatible Midnight Bundles taker and repay flows, with tuple components aligned to the current Midnight `Market` and `Offer` structs.

  The package consumes shared primitives, `MathLib`, typed errors, and registry data from `@morpho-org/morpho-ts`, and exposes a configurable `MidnightApi` client from `@morpho-org/midnight-sdk/api` with a `https://api.morpho.org/v0/midnight` default, optional string-or-`URL` `baseUrl` override, and parsed quote or takeable-offer payloads that can be passed directly to compatible bundle action inputs.

  `MidnightApi` uses explicit TypeScript interfaces with viem `Address`, `Hash`, and `Hex` primitives for the HTTP boundary; caller inputs are trusted at runtime and forwarded according to those types.

### Minor Changes

- [#824](https://github.com/morpho-org/sdks/pull/824) [`b8d721c`](https://github.com/morpho-org/sdks/commit/b8d721ca0f6701d26fd6a766640fdaf680ec5963) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Sync the SDK with `morpho-org/midnight@55db096af93a8f2bc85bb67f3ccc7b92e1bfab73`.

  Regenerate the pinned Midnight and ratifier ABIs from the updated onchain source. This picks up the configurator rename, enabled LLTV and liquidation cursor getters/setters, new market validation errors, updated ratifier ABI details, and removes the deleted `MidnightBundles` ABI surface.

  Update market params to match the new protocol struct: markets now carry `chainId` and the core `midnight` address, and each collateral uses `liquidationCursor` instead of `maxLif`. These fields are reflected across SDK types, API mappings, payload encoding/decoding, offer structs, EIP-712 typed data, market hashing, Merkle tree padding, fixtures, and documentation examples.

  Update `MarketUtils.toId` to mirror the new `IdLib.toId` behavior by encoding the full market struct and deriving the id with the embedded Midnight address and zero salt. Market hash and offer/tree signature fixtures were refreshed for the new type hashes.

  Mirror the new `Midnight.touchMarket` checks in SDK normalization and payload validation: reject malformed or negative chain ids, too many collaterals, invalid liquidation cursors, computed maximum LIF above `2 WAD`, and non-WAD LLTV values whose computed maximum LIF product exceeds the protocol bound.

### Patch Changes

- [#848](https://github.com/morpho-org/sdks/pull/848) [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Update Midnight ABI/hash helpers and register Base Midnight deployment addresses.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
