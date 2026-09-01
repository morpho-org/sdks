---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
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
the shared `AssetsOrSharesArgs`), the `BlueTokenRequirementsParams` and
`GetBlueBundlesV1TokenRequirementsParams` prerequisite options, and the WDK Blue-write option types
`readonly`.

The `@morpho-org/liquidity-sdk-viem` dependent bump for this `morpho-sdk` major — a `minor` that
widens its `morpho-sdk` peer range to `^5.4.0 || ^6.0.0` — is declared in the
`blue-v2-only-reallocations` changeset that performs the widening.
