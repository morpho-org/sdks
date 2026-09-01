---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
"@morpho-org/liquidity-sdk-viem": patch
---

Route Blue collateral supply, borrow, repay, and collateral withdrawal flows through the compatible
BlueBundlesV1 combined entrypoints. Preserve established names and migrate the WDK adapter.

Normalize token addresses to their EIP-55 checksum before resolving the per-token approval cap, so a
differently-cased loan token still caps the `MAX_TOKEN_APPROVALS` tokens (UNI/ONDO/COMP/FLUID) at
`uint96` instead of emitting a `maxUint256` approval those tokens reject. Reject oversized (`> uint256`)
and inconsistent withdrawal-only funding inputs in the combined builders with the SDK's typed
`InputExceedsMaxError`. Forward a caller-supplied reusable `approvalAmount` from
`getRequirements(...)` on the Blue collateral-supply and repay prerequisite paths (previously
dropped), while keeping the saturated-repay token cap. Mark the new Blue action argument shapes, the
combined-builder parameter interfaces, the `BlueActions` entity write-method parameter shapes (and
the shared `AssetsOrSharesArgs`), the `BlueTokenRequirementsParams` prerequisite options, and the
WDK Blue-write option types `readonly`.

Patch `@morpho-org/liquidity-sdk-viem` as a maintained direct dependent of the `morpho-sdk` major
(its `morpho-sdk` peer range already accepts `^6.0.0`); this is the explicit dependent bump the
migration plan requires in the implementation changeset.
