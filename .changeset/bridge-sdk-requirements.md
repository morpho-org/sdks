---
"@morpho-org/evm-simulation": minor
---

Add `toSimulationAuthorizations({ owner, requirements })`, a pure adapter that converts morpho-sdk `ActionRequirement[]` (from `ActionOutput.getRequirements()`) into ordered `SimulationAuthorization[]` descriptors. ERC-20 approval and Blue authorization call requirements are decoded from their calldata and cross-checked against the action metadata; `permit`, `permit2SignatureTransfer`, and `authorization` signature requirements are parsed field-by-field into the exact EIP-712 shapes the simulator expects. Malformed payloads and calldata/metadata disagreements throw `AuthorizationRequestMismatchError`; unsupported requirement types throw `UnsupportedOperationError`.
