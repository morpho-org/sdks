---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Rename Blue requirement entrypoints and isolate Blue-specific requirement modules.

The public GeneralAdapter requirement entrypoint is now `getGeneralAdapterRequirements`, and `getMorphoAuthorizationRequirement` is now `getBlueAuthorizationRequirement`. GeneralAdapter token permit requirement entrypoints are exported as `getGeneralAdapterRequirementsPermit` and `getGeneralAdapterRequirementsPermit2`, and the Permit2 approval encoder is exported as `encodeErc20Permit2Approve`. Protocol-agnostic approval and EIP-2612 encoding utilities remain exported from the common requirements barrel.

Blue authorization requirement metadata is now protocol-prefixed as `BlueAuthorizationAction` with `action.type === "blueAuthorization"`. The previous `MorphoAuthorizationAction` type, `"morphoAuthorization"` discriminator, and `isRequirementAuthorization` guard are removed in favor of `isRequirementBlueAuthorization`.

DAI-specific permit support is removed from maintained Morpho SDK action-flow surfaces. DAI now follows the same token-pull policy as other tokens that are incompatible with the SDK's standard ERC-2612 encoder: Blue requirement flows route DAI to Permit2, or to classic approval when Permit2 is unavailable, even when `useSimplePermit` is enabled and `nonces(owner)` is readable. The `getDaiPermitTypedData` re-export is removed from `@morpho-org/morpho-sdk/utils`.

Update the WDK Morpho lending adapter to consume the renamed Blue authorization action metadata.
