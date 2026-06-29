---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Rename Blue-specific requirement helpers and isolate requirement modules by protocol.

The public `getRequirements` helper is now `getBlueRequirements`, and `getMorphoAuthorizationRequirement` is now `getBlueAuthorizationRequirement`. Blue-only permit helpers are exported as `getBlueRequirementsPermit` and `getBlueRequirementsPermit2`. Shared requirement utilities remain exported from the common requirements barrel, while Midnight-specific helpers now live under the Midnight requirements module.

Blue authorization requirement metadata is now protocol-prefixed as `BlueAuthorizationAction` with `action.type === "blueAuthorization"`. The previous `MorphoAuthorizationAction` type, `"morphoAuthorization"` discriminator, and `isRequirementAuthorization` guard are removed in favor of `isRequirementBlueAuthorization`.

DAI-specific permit support is removed from maintained Morpho SDK action-flow surfaces. DAI now follows the same token-pull policy as other tokens that are incompatible with the SDK's standard ERC-2612 encoder: Blue and Midnight requirement flows route DAI to Permit2, or to classic approval when Permit2 is unavailable, even when `useSimplePermit` is enabled and `nonces(owner)` is readable. The `getDaiPermitTypedData` re-export is removed from `@morpho-org/morpho-sdk/utils`.

Update the WDK Morpho lending adapter to consume the renamed Blue authorization action metadata.
