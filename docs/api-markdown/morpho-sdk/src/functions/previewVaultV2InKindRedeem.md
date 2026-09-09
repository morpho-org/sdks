[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / previewVaultV2InKindRedeem

# Function: previewVaultV2InKindRedeem()

> **previewVaultV2InKindRedeem**(`vaultData`, `params`): readonly [`VaultV2InKindRedeemMarketPreview`](../interfaces/VaultV2InKindRedeemMarketPreview.md)[]

Defined in: [packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/previewVaultV2InKindRedeem.ts#L57)

Previews the single-market in-kind redemption choices needed by a Vault V2 frontend.

Vaults with exactly one MorphoMarketV1AdapterV2 can produce choices. Their non-empty markets are
returned in descending allocation order with the exact penalty-inclusive input ceiling, idle
assets withdrawn directly, and resulting Blue position for `requestedExitAssets`.

## Parameters

### vaultData

[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)

Pre-fetched Vault V2 accrual snapshot.

### params

[`PreviewVaultV2InKindRedeemParams`](../interfaces/PreviewVaultV2InKindRedeemParams.md)

Preview parameters.

## Returns

readonly [`VaultV2InKindRedeemMarketPreview`](../interfaces/VaultV2InKindRedeemMarketPreview.md)[]

Frontend-ready market choices, or an empty list when no choices are available.

## Example

```ts
import { previewVaultV2InKindRedeem } from "@morpho-org/morpho-sdk";

const [market] = previewVaultV2InKindRedeem(vaultData, {
  requestedExitAssets,
  timestamp: block.timestamp,
});
// market?.exitAssets is ready to pass to vault.inKindRedeem(...)
```
