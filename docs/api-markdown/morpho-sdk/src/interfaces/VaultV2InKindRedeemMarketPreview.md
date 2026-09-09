[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2InKindRedeemMarketPreview

# Interface: VaultV2InKindRedeemMarketPreview

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L17)

Frontend-ready preview of a Vault V2 in-kind redemption through one Morpho Blue market.

## Properties

### exitAssets

> `readonly` **exitAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L23)

Penalty-inclusive exit amount assigned to this market choice.

***

### feeAssets

> `readonly` **feeAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L31)

Assets charged as the force-deallocation penalty.

***

### idleAssets

> `readonly` **idleAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L27)

Portion of `exitAssets` withdrawn directly from the vault's idle assets.

***

### marketParams

> `readonly` **marketParams**: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L19)

Morpho Blue market parameters to pass to the in-kind redemption action.

***

### maxExitAssets

> `readonly` **maxExitAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L21)

Maximum penalty-inclusive exit amount supported by this market and the vault's idle assets.

***

### netAssets

> `readonly` **netAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L29)

Morpho Blue supply assets received after the force-deallocation penalty.

***

### remainingExitAssets

> `readonly` **remainingExitAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L25)

Requested penalty-inclusive exit amount not covered by this market choice.
