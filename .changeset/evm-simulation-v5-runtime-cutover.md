---
"@morpho-org/evm-simulation": major
---

Cut `simulate()` over to the v5 domain contract and a pinned, evidence-collecting `eth_simulateV1` boundary.

BREAKING CHANGES:

- `SimulateParams` is now the domain union `PreviewSimulateParams | FinalSimulateParams`. `mode` defaults to `"final"`; `authorizations` are only accepted in `"preview"` mode and use the five typed variants (`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`, `blueAuthorization`, `blueAuthorizationSignature`) — the legacy `{type: "approval"}` and `{type: "signature"}` variants are removed.
- `SimulationTransaction` fields and `SimulateParams` inputs are `readonly`; `simulationTxs` echoes exactly the caller's normalized transactions (`txIdx` in `transfers` and `calls` indexes user transactions only — internal probes are never exposed).
- `value` transfers are funded by the sender's real native balance (no balance inflation); `validation: false` keeps gas uncharged so gas stays separated from economic effects.
- New input `limits` (tightening-only, resolved against `DEFAULT_MAX_SLIPPAGE_WAD`, `DEFAULT_MIN_LLTV_BUFFER_WAD`, `DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS`) and new typed error classes for verification stages (`UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`).
- Until authorization preparation (PR5) and limit enforcement (PR6) land, preview `authorizations` and `limits` throw `UnsupportedVerificationFeatureError` instead of being silently ignored.
