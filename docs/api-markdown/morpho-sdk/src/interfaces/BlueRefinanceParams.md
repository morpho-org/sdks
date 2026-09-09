[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRefinanceParams

# Interface: BlueRefinanceParams

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L22)

Parameters for [blueRefinance](../functions/blueRefinance.md).

## Properties

### args

> **args**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L30)

#### authorizationSignature?

> `optional` **authorizationSignature?**: [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md)

Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
standalone `setAuthorization` transaction.

#### borrowAssets?

> `optional` **borrowAssets?**: `bigint`

Loan assets to borrow on the target. Assets mode: the exact borrow (exclusive with
`borrowShares`). Shares mode: the positive overshoot covering accrual + slippage; omitting it
throws [RefinanceSharesMissingBorrowAssetsError](../classes/RefinanceSharesMissingBorrowAssetsError.md).

#### borrowShares?

> `optional` **borrowShares?**: `bigint`

Source borrow shares to repay (immune to mid-tx accrual); exclusive with `borrowAssets`.

#### collateralAmount

> **collateralAmount**: `bigint`

Amount of collateral moved from the source market to the target market.

#### maxRepaySharePrice

> **maxRepaySharePrice**: `bigint`

Maximum repay share price on the source market (in ray); must be > 0 when a repay leg exists.

#### minBorrowSharePrice

> **minBorrowSharePrice**: `bigint`

Minimum borrow share price on the target market (in ray).

#### targetReallocations?

> `optional` **targetReallocations?**: [`BlueReallocationPlan`](../type-aliases/BlueReallocationPlan.md)

Homogeneous Vault V1 or Vault V2 reallocations into the target market.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2 for new integrations.

#### user

> **user**: `` `0x${string}` ``

Address whose position is refinanced from the source to the target market.

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L59)

***

### source

> **source**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L23)

#### chainId

> `readonly` **chainId**: `number`

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

***

### target

> **target**: `object`

Defined in: [packages/morpho-sdk/src/actions/blue/refinance.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/blue/refinance.ts#L27)

#### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)
