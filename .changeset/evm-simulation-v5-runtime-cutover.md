---
"@morpho-org/evm-simulation": major
---

Cut `simulate()` over to the v5 public types and a pinned `eth_simulateV1` boundary.

BREAKING CHANGES:

- `SimulateParams` is now an options object with `mode`; `authorizations` are accepted only in `"preview"` and `"pending"` block tags are rejected at runtime. `SimulationAuthorization` is now the union of the five typed variants (`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`, `blueAuthorization`, `blueAuthorizationSignature`); the legacy `{type: "approval"}` and `{type: "signature"}` variants are removed.
- `SimulationTransaction` fields and `SimulateParams` inputs are `readonly`; `simulationTxs` echoes exactly the caller's normalized transactions (`txIdx` in `transfers` and `calls` indexes user transactions).
- `parseRequest` rejects unknown keys on `SimulateParams`, transactions, authorizations and limits with `SimulationValidationError` (`<path>.<key>: unknown field`); v4 ignored extra properties.
- `value` transfers are funded by the sender's real native balance (no balance inflation); `validation: false` keeps gas uncharged so gas stays separated from economic effects.
- New input `limits` (tightening-only, resolved against `DEFAULT_MAX_SLIPPAGE_WAD`, `DEFAULT_MIN_LLTV_BUFFER_WAD`, `DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS`).
- Until authorization preparation (PR5) and limit enforcement (PR6) land, preview `authorizations` and `limits` throw `UnsupportedVerificationFeatureError` once the state block is pinned, before the `eth_simulateV1` call, instead of being silently ignored.
- `blockNumber` no longer accepts `"pending"`.
- `InvalidSimulationResponseError` (non-bypassable) replaces `ExternalServiceError` for a malformed `eth_simulateV1` block envelope and a call-count mismatch. New checks that v4 did not perform (it returned success) also throw it: an endpoint whose `eth_chainId` disagrees with the configured chain, a simulated block that is neither the pinned state block nor its immediate successor (with matching `parentHash`), a block timestamp earlier than the pinned block's, a per-call result that fails normalization (non-quantity `gasUsed`, non-iterable `logs`, or a log whose `topics`/`address`/`data` are malformed), and a pinned state block whose hash changed mid-simulation.
- Node-level code `3`/"insufficient funds" `eth_simulateV1` failures are `SimulationRevertedError`: `details` is a URL-free `{ code, shortMessage }` record for a node-level revert (the viem error rides on `cause`), or the frozen `{ transactionIndex, result }[]` of the user transactions when one of them reverted.
