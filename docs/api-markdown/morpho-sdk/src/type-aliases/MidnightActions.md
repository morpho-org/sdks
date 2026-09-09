[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightActions

# Type Alias: MidnightActions

> **MidnightActions** = `Pick`\<`MorphoMidnight`, `"getMarketData"` \| `"getPositionData"` \| `"getOffersData"` \| `"takeLend"` \| `"takeBorrow"` \| `"supplyCollateralTakeBorrow"` \| `"supplyCollateral"` \| `"makeLend"` \| `"makeBorrow"` \| `"supplyCollateralMakeBorrow"` \| `"redeem"` \| `"repayWithdrawCollateral"` \| `"cancelOffer"`\>

Defined in: [packages/morpho-sdk/src/entities/midnight/midnight.ts:119](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/midnight/midnight.ts#L119)

Entity methods exposed by `client.morpho.midnight(chainId)`.

Use this surface for app flows: fetch market or position data first when a
method asks for it, call the flow method to receive lazy `getRequirements`
and `buildTx` handles, collect requirements, then build the final
transaction synchronously.

## Example

```ts
import { maxUint256 } from "viem";

const midnight = client.morpho.midnight(8453);
const marketData = await midnight.getMarketData(marketId);
const output = midnight.takeLend({
  accountAddress: lender,
  marketData,
  assets: 1_000_000n,
  minUnits: 900_000n,
  takeableOffers: quote.data.takeableOffers,
  deadline: maxUint256,
});
const requirements = await output.getRequirements();
const tx = output.buildTx();
```
