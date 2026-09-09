[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / submitCap

# Function: submitCap()

> **submitCap**(`marketParams`, `newSupplyCap`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:203](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L203)

Encodes a call to a MetaMorpho vault to submit a new supply cap.

## Parameters

### marketParams

[`InputMarketParams`](../../../../../blue-sdk/src/type-aliases/InputMarketParams.md)

The market params of the market of which to submit a supply cap.

### newSupplyCap

`bigint`

The new supply cap.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import type { InputMarketParams } from "@morpho-org/blue-sdk";
import { zeroAddress } from "viem";
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const marketParams = {
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: zeroAddress,
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
} satisfies InputMarketParams;

const call = MetaMorphoAction.submitCap(marketParams, 1_000_000_000_000_000_000n);
```
