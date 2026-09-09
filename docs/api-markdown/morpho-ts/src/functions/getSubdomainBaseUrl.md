[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getSubdomainBaseUrl

# Function: getSubdomainBaseUrl()

> **getSubdomainBaseUrl**(`subDomain`): `string`

Defined in: [packages/morpho-ts/src/urls.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/urls.ts#L17)

Builds an HTTPS base URL for a Morpho subdomain.

## Parameters

### subDomain

`string`

Subdomain label to prefix before `morpho.org`.

## Returns

`string`

The HTTPS base URL for the requested subdomain.

## Example

```ts
import { getSubdomainBaseUrl } from "@morpho-org/morpho-ts";

const url = getSubdomainBaseUrl("docs");
// "https://docs.morpho.org"
```
