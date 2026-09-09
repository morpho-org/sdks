[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateRequirementSpender

# Function: validateRequirementSpender()

> **validateRequirementSpender**(`params`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validateRequirementSpender.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validateRequirementSpender.ts#L34)

Validates that a requirement encoder spender matches one of the allowed chain addresses.

## Parameters

### params

Spender validation parameters.

#### allowed

readonly [`RequirementSpenderKey`](../type-aliases/RequirementSpenderKey.md)[]

Allowed registry slots for this requirement.

#### chainId

`number`

Chain id used to resolve supported spender addresses.

#### spender

`` `0x${string}` ``

Spender address to validate.

## Returns

`void`

Nothing after the spender matches an allowed chain address.

## Throws

when `spender` does not match any allowed slot.

## Example

```ts
import { validateRequirementSpender } from "@morpho-org/morpho-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";

validateRequirementSpender({
  chainId: 8453,
  spender: getChainAddress(8453, "midnightBundles"),
  allowed: ["midnightBundles"],
});
```
