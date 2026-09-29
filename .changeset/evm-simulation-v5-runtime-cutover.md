---
"@morpho-org/evm-simulation": major
---

Cut `simulate()` over to the v5 public types and a pinned, probe-instrumented `eth_simulateV1` boundary.

BREAKING CHANGES:

- `SimulateParams` is now a mode-tagged params object (`mode: "preview" | "final"`). `mode` defaults to `"final"`; `authorizations` are only accepted in `"preview"` mode and use the five typed variants (`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`, `blueAuthorization`, `blueAuthorizationSignature`) — the legacy `{type: "approval"}` and `{type: "signature"}` variants are removed.
- `SimulationTransaction` fields and `SimulateParams` inputs are `readonly`; `simulationTxs` echoes exactly the caller's normalized transactions (`txIdx` in `transfers` and `calls` indexes user transactions only — internal probes are never exposed).
- `value` transfers are funded by the sender's real native balance (no balance inflation); `validation: false` keeps gas uncharged so gas stays separated from economic effects.
- New input `limits` (tightening-only, resolved against `DEFAULT_MAX_SLIPPAGE_WAD`, `DEFAULT_MIN_LLTV_BUFFER_WAD`, `DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS`) and new typed error classes for verification (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`).
- Until authorization preparation (PR5) and limit enforcement (PR6) land, preview `authorizations` and `limits` throw `UnsupportedVerificationFeatureError` at validation, before any RPC, instead of being silently ignored.
- `blockNumber` no longer accepts `"pending"`, and transactions targeting the reserved probe address `0x000000000000000000000000000000000000Ba1a` are rejected with `SimulationValidationError`.
- An endpoint whose `eth_chainId` disagrees with the configured chain now throws `InvalidSimulationResponseError` (non-bypassable) instead of `ExternalServiceError`, and the simulated block must equal the pinned state block or its immediate successor.
