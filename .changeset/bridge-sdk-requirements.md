---
"@morpho-org/evm-simulation": minor
---

Add `toSimulationAuthorizations({ chainId, mode, blockNumber, owner, requirements, preLiquidations? })`, a pure adapter that converts morpho-sdk `ActionRequirement[]` (from `ActionOutput.getRequirements()`) into ordered `SimulationAuthorization[]` descriptors. ERC-20 approval and Blue authorization call requirements are decoded from their calldata and cross-checked against the action metadata; `permit`, `permit2SignatureTransfer`, and `authorization` signature requirements pass their EIP-712 payload through unchanged — the envelope shape is validated by `simulate()`'s request parser — while the adapter cross-checks it against the action metadata, the owner, and the chain registry. Calldata/metadata disagreements throw `AuthorizationRequestMismatchError`; unsupported requirement types throw `UnsupportedOperationError`.
