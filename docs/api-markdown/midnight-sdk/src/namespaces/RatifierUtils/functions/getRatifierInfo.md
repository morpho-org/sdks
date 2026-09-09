[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [RatifierUtils](../README.md) / getRatifierInfo

# Function: getRatifierInfo()

> **getRatifierInfo**(`params`): [`RatifierInfo`](../../../interfaces/RatifierInfo.md)

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:239](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L239)

Selects Ecrecover for EOAs/EIP-7702 accounts and Setter for deployed-code
accounts.

Use the returned `ratifier` address in `Offer.create`. Later, use
`EcrecoverRatifierUtils.ratify` when `type` is `ecrecover`, or approve the
root and call `SetterRatifierUtils.ratify` when `type` is `setter`.

## Parameters

### params

[`GetRatifierInfoParams`](../../../interfaces/GetRatifierInfoParams.md)

## Returns

[`RatifierInfo`](../../../interfaces/RatifierInfo.md)

Ratifier information for the maker.

## Example

```ts
import { RatifierUtils } from "@morpho-org/midnight-sdk";

const info = RatifierUtils.getRatifierInfo({
  bytecode: "0x",
  ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
  setterRatifier: "0x0000000000000000000000000000000000000002",
});
console.log(info.type);
```
