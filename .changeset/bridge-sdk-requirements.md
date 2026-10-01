---
"@morpho-org/evm-simulation": minor
---

Add `toSimulationAuthorizations({ chainId, mode, blockNumber, owner, requirements })`, a pure adapter that maps morpho-sdk `ActionRequirement[]` (from `ActionOutput.getRequirements()`) onto ordered `SimulationAuthorization[]` descriptors — no validation lives in the adapter; `simulate()`'s request parser validates each authorization's shape and semantics. ERC-20 approval and Blue authorization call requirements are decoded from their calldata; `permit`, `permit2SignatureTransfer`, and `authorization` signature requirements pass their EIP-712 payload through unchanged. A signature requirement without `typedData`, undecodable calldata, or an unknown requirement type throws a typed error (`AuthorizationRequestMismatchError` / `UnsupportedOperationError`).
