# ADR-2026-10-01: Retire the Tenderly backend in `evm-simulation` 5.0.0 without a deprecation minor

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | accepted                             |
| **Date**   | 2026-10-01                           |
| **Author** | @jinmel                              |
| **Scope**  | `evm-simulation` 5.0.0               |

_Status is the only field that changes after acceptance._

## Context

`evm-simulation` 4.x simulated bundles through Tenderly RPC first and fell back to `eth_simulateV1`
on `ExternalServiceError`. Each chain entry accepted `tenderlyRpc`, `simulateV1Url` or both.
[`ADR-2026-09-18`](./ADR-2026-09-18-evm-simulation-calldata-verification.md) already decided to use
`eth_simulateV1` only and remove Tenderly and provider fallback, but its Migration section scheduled
that removal for 6.0.0, after a minor that marked the Tenderly configuration `@deprecated` and
accepted both forms.

Tenderly is a retired provider for the SDK: no supported integration configures it, and keeping it
for a minor would keep a second backend, its fallback path and its threat surface reachable without
giving consumers anything to migrate towards beyond `simulateV1Url`, which they can set today.
AGENTS.md §7 mandates the 4-step deprecation flow, so skipping it needs a recorded decision.

## Decision

`evm-simulation` 5.0.0 removes, in one step and without the successor-introduction, `@deprecated`
and one-minor coexistence steps of the §7 flow:

- the `TenderlyRpcConfig` type;
- `ChainSimulationConfig.tenderlyRpc`;
- the Tenderly backend and the Tenderly-to-`eth_simulateV1` provider fallback.

`ChainSimulationConfig.simulateV1Url` becomes required. `eth_simulateV1` is the sole backend:
a failed request throws `ExternalServiceError`, with no fallback, and `timeoutMs` (default 5000) is
the abort budget for that request.

This supersedes only the Tenderly part of ADR-2026-09-18's Migration section. The rest of that
record, including the deprecation minor for the legacy `SimulationAuthorization` variants and the
6.0.0 contract, is unchanged.

The exception does not waive the major changeset, migration notes, the maintained-dependent audit,
or continued availability of `evm-simulation` 4.x. No other removal inherits it.

## Invariants

- `evm-simulation` 5.0.0 exports no Tenderly type, config field or backend → a source search for
  `tenderly` in the package finds nothing.
- Every `ChainSimulationConfig` requires `simulateV1Url` → `tsc` rejects a chain entry without it.
- `timeoutMs` aborts the `eth_simulateV1` request → the `simulate()` timeout unit test.

## Rejected alternatives

- **Follow ADR-2026-09-18 as written: deprecate in a minor, remove in 6.0.0.** Rejected: the minor
  would only keep a retired provider reachable; the replacement (`simulateV1Url`) already exists and
  needs no coexistence period.

## References

- Supersedes the Tenderly part of the Migration section of
  [ADR-2026-09-18: EVM simulation — calldata verification and result constraints](./ADR-2026-09-18-evm-simulation-calldata-verification.md).
- [ADR-2026-05-13: SDK package deprecation lifecycle](./ADR-2026-05-13-sdk-package-deprecation-lifecycle.md)
- Accepted in https://github.com/morpho-org/sdks/pull/1204.
