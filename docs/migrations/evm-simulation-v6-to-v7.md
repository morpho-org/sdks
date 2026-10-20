# EVM simulation v6 → v7

## Smaller error surface

`SimulationPackageError` now carries only its stable `code` and standard Error
fields (`name`, `message`, `stack`, `cause`). `SimulationRevertedError` adds
`revertData?: Hex`, the original node-returned bytes, and optional
`transactionIndex`, the zero-based index into the caller's transactions.

Removed fields and types:

- `ExternalServiceError` and the `EXTERNAL_SERVICE_ERROR` code.
- `MissingVerificationEvidenceError` and the `MISSING_VERIFICATION_EVIDENCE` code,
  renamed to `SlippageCheckUnavailableError` / `SLIPPAGE_CHECK_UNAVAILABLE`.
- `SimulationPackageError.context` and context constructor options/arguments.
- `SimulationErrorContext`, `SimulationValidationContext`,
  `SimulationTransportContext`, `SimulationPreparationContext`,
  `SimulationExecutionContext`, `SimulationVerificationContext`, `SimulationStage`.
- `SimulationRevertedError.reason`, `reasonCode`, `details`, and `SimulationExecutionReason`.

```diff
 if (error instanceof SimulationRevertedError) {
-  showError(error.reason);
-  forwardFailureCode(error.reasonCode);
+  showError(error.message);
+  forwardFailureCode(error.code); // "SIMULATION_REVERTED"
+  // Decode error.revertData with your ABI for contract-specific handling.
 }
```

Messages include all decoded custom-error arguments, Solidity reason strings,
and panic codes. They remain presentation text; never parse them for control
flow. Original bytes survive even if decoding fails. `"0x"` denotes an empty
payload; `undefined` means the node supplied no bytes. The SDK cannot recover
bytes a node omits. User reverts expose `transactionIndex`; preparation and
node-level reverts leave it undefined. Internal calls never shift the user index.
Locations also appear in preparation/transaction messages.

A node insufficient-funds rejection (viem `InsufficientFundsError` or JSON-RPC
`-38014`) whose revert bytes are absent or cannot be decoded produces `Sender native balance
cannot fund transaction value. Fund the sender or reduce value.` Any other
undecodable revert produces `Revert reason unavailable`, without provider
message text. Original provider diagnostics remain available in `cause`.

## Constructor changes

```ts
new SimulationRevertedError(message, revertData, { cause, transactionIndex });
new SimulationValidationError(message, fieldErrors, { cause });
new BlacklistViolationError(message, assetChanges, { cause });
new UnsupportedChainError(chainId, { cause });
```

Other errors inheriting the base constructor accept `(message, options?)`.
Specialized fields such as `fieldErrors`, `assetChanges`, and `chainId` remain.
`ExternalServiceError` / `EXTERNAL_SERVICE_ERROR` become `RpcTransportError` /
`RPC_TRANSPORT_ERROR`. RPC failures wrap the original viem error as `cause`,
preserving its class and cause chain. Other unexpected
failures become `UnexpectedSimulationError`, preserving the original value as
`cause`. Do not treat an infrastructure error as a successful simulation.

For API responses, use `toSimulationErrorResponse(error)` instead of serializing
an Error instance. It returns `code`, `message`, and optional `revertData` and `transactionIndex`, omitting
stack, cause, and specialized bigint fields. RPC failures retain `RPC_TRANSPORT_ERROR` with a generic message; non-SDK and unexpected failures map
to a generic `UNEXPECTED_SIMULATION_ERROR` response. Log the original exception
server-side and attach the service's request ID. Return transactions only after
simulation succeeds; see the package README for a complete service pattern.

## `toSimulationAuthorizations` inputs

`chainId`, `mode`, and `blockNumber` only fed the removed error context, so they
are removed. Pass `owner` and `requirements` only.

```diff
 toSimulationAuthorizations({
-  chainId,
-  mode: "preview",
-  blockNumber,
   owner,
   requirements,
 });
```

## Consumer audit

The Actions API and other consumers forwarding `reasonCode` must
switch to `code`, `message`, and optionally `revertData`, and review their own
public compatibility contract before upgrading. No workspace package declares
a direct runtime or peer dependency on evm-simulation; no dependent bump is needed.
Integrations requiring the removed fields can stay on 6.x during migration.

The maintainer-approved lifecycle exception is recorded in
[ADR-2026-10-12](../adrs/ADR-2026-10-12-evm-simulation-simplify-errors-without-deprecation.md). It covers the listed removals and constructor changes only.
