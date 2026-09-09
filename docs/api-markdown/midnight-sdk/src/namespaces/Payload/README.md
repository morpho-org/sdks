[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / Payload

# Payload

Namespace for Midnight mempool payload utilities.

Use `Payload.encode` to turn ratified offer items into wire bytes for mempool
publication or raw payload API validation, and `Payload.decode` to inspect
published maker offers, ratifier data, or attribution-tagged payloads.
Encoded payloads are always `Hex` strings ready to be included in onchain
mempool submission calldata.

## Type Aliases

- [DecodeOptions](type-aliases/DecodeOptions.md)
- [Item](type-aliases/Item.md)

## Variables

- [CURRENT\_VERSION](variables/CURRENT_VERSION.md)
- [MAX\_ATTRIBUTION\_SUFFIX\_BYTES](variables/MAX_ATTRIBUTION_SUFFIX_BYTES.md)
- [MAX\_COMPRESSED\_ITEMS\_BYTES](variables/MAX_COMPRESSED_ITEMS_BYTES.md)
- [MAX\_DECOMPRESSED\_ITEMS\_BYTES](variables/MAX_DECOMPRESSED_ITEMS_BYTES.md)
- [MAX\_PAYLOAD\_BYTES](variables/MAX_PAYLOAD_BYTES.md)
- [MAX\_PAYLOAD\_HEX\_LENGTH](variables/MAX_PAYLOAD_HEX_LENGTH.md)
- [MAX\_REQUEST\_BODY\_BYTES](variables/MAX_REQUEST_BODY_BYTES.md)

## Functions

- [decode](functions/decode.md)
- [encode](functions/encode.md)
