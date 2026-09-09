[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / DecodeOptions

# Type Alias: DecodeOptions

> **DecodeOptions** = `object`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:199](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L199)

Optional decode bounds.

## Example

```ts
import type { Payload } from "@morpho-org/midnight-sdk";

const options: Payload.DecodeOptions = { maxItems: 16 };
console.log(options.maxItems);
```

## Properties

### maxItems?

> `readonly` `optional` **maxItems?**: `number`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:201](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L201)

Optional caller-provided item cap.
