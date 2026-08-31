---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Route Blue collateral supply, borrow, repay, and collateral withdrawal flows through the compatible
BlueBundlesV1 combined entrypoints. Preserve established names and migrate the WDK adapter.

Normalize token addresses to their EIP-55 checksum before resolving the per-token approval cap, so a
differently-cased loan token still caps the `MAX_TOKEN_APPROVALS` tokens (UNI/ONDO/COMP/FLUID) at
`uint96` instead of emitting a `maxUint256` approval those tokens reject. Mark the new Blue action
argument shapes and WDK Blue-write option types `readonly`.
