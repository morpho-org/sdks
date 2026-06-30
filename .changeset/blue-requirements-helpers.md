---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Rename requirement entrypoints by protocol and isolate protocol-specific requirement modules.

The public Blue requirement entrypoint is now `getBlueRequirements`, and `getMorphoAuthorizationRequirement` is now `getBlueAuthorizationRequirement`. Blue requirement permit entrypoints are exported as `getBlueRequirementsPermit` and `getBlueRequirementsPermit2`. Protocol-agnostic approval and encoding utilities remain exported from the common requirements barrel, while Midnight-specific helpers now live under the Midnight requirements module.

Blue authorization requirement metadata is now protocol-prefixed as `BlueAuthorizationAction` with `action.type === "blueAuthorization"`. The previous `MorphoAuthorizationAction` type, `"morphoAuthorization"` discriminator, and `isRequirementAuthorization` guard are removed in favor of `isRequirementBlueAuthorization`.

DAI-specific permit support is removed from maintained Morpho SDK action-flow surfaces. DAI now follows the same token-pull policy as other tokens that are incompatible with the SDK's standard ERC-2612 encoder: Blue and Midnight requirement flows route DAI to Permit2, or to classic approval when Permit2 is unavailable, even when `useSimplePermit` is enabled and `nonces(owner)` is readable. The `getDaiPermitTypedData` re-export is removed from `@morpho-org/morpho-sdk/utils`.

Update the WDK Morpho lending adapter to consume the renamed Blue authorization action metadata.
