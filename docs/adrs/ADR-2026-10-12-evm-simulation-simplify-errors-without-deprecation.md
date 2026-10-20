# ADR-2026-10-12: Simplify simulation errors in evm-simulation 7.0.0 without a deprecation minor

| Field | Value |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-10-12 |
| **Author** | @jinmel |
| **Scope** | `evm-simulation` 7.0.0 |

## Context

The original request asked for a complete semantic revert taxonomy. Published
6.x only emits `UNKNOWN_REVERT`. Contract errors do not reliably establish
broader categories: `ERC4626ExceededMaxWithdraw` can indicate shares or liquidity
rather than a cap. The initial replacement with arbitrary error names still
left `reason`, `reasonCode`, untyped `details`, and operation-dependent error
contexts. The maintainer approved simplifying the errors during design review.
This record reflects the final design before merge.

## Decision

- `SimulationPackageError` exposes the stable `code` and standard `Error` fields
  (`name`, `message`, `stack`, `cause`). Remove `context` and the exported
  `SimulationErrorContext`, its five per-stage context aliases, and `SimulationStage`.
- `SimulationRevertedError(message, revertData?, options?)` adds
  `revertData?: Hex` and `transactionIndex?: number`. Constructor options extend
  `ErrorOptions` with an optional readonly `transactionIndex`. Remove `reason`, `reasonCode`, `details`, and
  `SimulationExecutionReason`. Pass original exceptions through `options.cause`.
- Format every decoded custom-error argument, `Error(string)` reason, and panic
  code into `message`. Preserve the original node-returned bytes independently
  of whether decoding succeeds. No typed decoded-revert API or category mapping.
- Derive custom-error definitions from every pinned ABI exported by
  `@morpho-org/morpho-sdk/abis`, deduplicate by full signature,
  and decline to interpret ambiguous selectors. Decoding does not identify the
  emitting contract. Callers branch on SDK class/code or decode bytes with their ABI;
  message text is for display, not a stable discriminator.
- User reverts expose the zero-based caller `transactionIndex`; preparation and
  node-level reverts leave it undefined. Internal reads/preparations never shift
  this index. Preparation/user call locations also appear in their messages.
  Undecodable revert bytes use a generic message; provider messages stay in `cause`.
  Node-level reverts
  may have no bytes. An empty payload (`"0x"`) remains distinct from unavailable data.
- Remove the `chainId`, `mode`, and `blockNumber` inputs of
  `toSimulationAuthorizations`, which only fed the removed error context.
- Constructors that previously took a context take standard `ErrorOptions` in
  that position. Other specialized error fields remain unchanged.
- Replace `ExternalServiceError` / `EXTERNAL_SERVICE_ERROR` with `RpcTransportError` /
  `RPC_TRANSPORT_ERROR`, preserving original viem errors as `cause`. Wrap other unexpected
  failures in the existing `UnexpectedSimulationError` at `simulate`, retaining
  the original value as `cause`. All failures reject; services requiring simulation
  must withhold transactions on every rejection.
- Rename `MissingVerificationEvidenceError` / `MISSING_VERIFICATION_EVIDENCE` to `SlippageCheckUnavailableError` / `SLIPPAGE_CHECK_UNAVAILABLE`. The new name says what failed: a slippage limit could not be checked.
- Export `toSimulationErrorResponse` and `SimulationErrorResponse` for JSON-safe
  `code`, `message`, and optional `revertData` and `transactionIndex`. RPC failures retain `RPC_TRANSPORT_ERROR` with a generic public message;
  unexpected failures receive `UNEXPECTED_SIMULATION_ERROR`. The service logs the original
  exception and owns request IDs and HTTP status mapping.

The maintainer authorizes these listed removals and constructor retypes in v7
without a successor/deprecation/coexistence minor. This replaces only the error
context and revert-error surface, the `ExternalServiceError` caller bypass (now the
blocking `RpcTransportError`), and the `MissingVerificationEvidenceError` name (now
`SlippageCheckUnavailableError`) in ADR-2026-09-18, ADR-2026-10-01-evm-simulation-quoted-slippage-limits
and ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation. It does not authorize other
removals or waive a major changeset, migration guide, dependent audit, or continued
availability of 6.x. No workspace package directly depends on evm-simulation;
external consumers such as the Actions API must stop forwarding `reasonCode`.

## Invariants

- Original revert bytes survive custom, string, panic, empty, unknown, and
  malformed payloads on preparation/user and node-level paths → the `revertData`
  cases in `parse-response.test.ts` and `eth-simulate-v1.test.ts`.
- Decoded messages include every argument without bigint precision loss → the
  bigint formatting case in `decode-revert.test.ts`.
- Domain errors remain typed; decoding failures cannot turn a revert into success
  or a successful service response. Original node exceptions remain `cause` →
  `simulate.test.ts` and `error-response.test.ts`.
- `context`, `reason`, `reasonCode`, and `details` are absent from the public
  errors → the absence assertions in `errors.test.ts`.

## Rejected alternatives

- A fixed semantic taxonomy: some categories cannot be inferred reliably.
- A public union of typed reverts: too much API surface for consumers that need
  a readable failure and the original bytes.
- Parallel report/context objects: duplicate standard error fields and require
  callers to understand multiple representations of the same failure.

## References

- [ADR-2026-09-18](./ADR-2026-09-18-evm-simulation-calldata-verification.md)
- [Quoted slippage limits](./ADR-2026-10-01-evm-simulation-quoted-slippage-limits.md)
- [Retire Tenderly](./ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation.md)
- [Deprecation lifecycle](./ADR-2026-05-13-sdk-package-deprecation-lifecycle.md)
