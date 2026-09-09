[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / addTransactionMetadata

# Function: addTransactionMetadata()

> **addTransactionMetadata**(`tx`, `metadata`): `object`

Defined in: [packages/morpho-sdk/src/helpers/metadata.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/metadata.ts#L37)

Adds metadata to a transaction object by concatenating additional
hex-encoded data to the transaction's `data` field. The additional
data may include a timestamp and an origin identifier derived
from the metadata.

The function ensures that the transaction data is correctly formatted
and includes optional metadata elements if provided.

`metadata.origin` accepts either a raw hex string (`"cafe"`) or a
0x-prefixed hex string (`"0xcafe"` / `"0Xcafe"`); both produce the same
appended 4-byte origin tag. The 0x/0X prefix is stripped case-insensitively
before length-validation, so an origin of `"0xdeadbeef"` (10 chars
including prefix, 8 raw hex chars) is accepted while `"0xdeadbeef00"`
(10 raw hex chars) is rejected and a warning is logged. Odd-length raw
fragments (e.g. `"abc"`, `"0xabc"`) are also rejected — concatenating
a non-byte-aligned fragment would corrupt the trailing analytics byte
once viem's `concatHex` pads it to a whole byte at broadcast time.

## Parameters

### tx

The original transaction object.

#### data

`` `0x${string}` ``

The existing hex-encoded data for the transaction.

#### to

`` `0x${string}` ``

The recipient address of the transaction.

#### value

`bigint`

The value to be sent with the transaction.

### metadata

[`Metadata`](../interfaces/Metadata.md)

An object containing optional metadata fields
such as `timestamp` and `origin`.

## Returns

`object`

- A new transaction object with the modified `data` field
including the concatenated metadata.

If no `data` is present in the original transaction, the function returns
the transaction unmodified.

### data

> **data**: `` `0x${string}` ``

### to

> **to**: `` `0x${string}` ``

### value

> **value**: `bigint`
