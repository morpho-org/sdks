# ADR-2026-10-02: Remove the legacy authorization variants and the `"pending"` block tag in `evm-simulation` 5.0.0 without a deprecation minor

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | accepted                             |
| **Date**   | 2026-10-02                           |
| **Author** | @jinmel                              |
| **Scope**  | `evm-simulation` 5.0.0               |

_Status is the only field that changes after acceptance._

## Context

`evm-simulation` 4.x accepted `SimulateParams.authorizations` entries shaped `{ type: "approval" }`
and `{ type: "signature" }`, and accepted `blockNumber: "pending"`.
[`ADR-2026-09-18`](./ADR-2026-09-18-evm-simulation-calldata-verification.md) replaced the two legacy
variants with five typed ones (`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`,
`blueAuthorization`, `blueAuthorizationSignature`) and scheduled their removal for the major after
a minor that marked them `@deprecated` and accepted both forms.

The legacy shapes carry no owner, spender, token or amount binding, so nothing in them can be
verified against the simulated state: a minor that accepted both forms would keep an unverifiable
input path reachable beside the typed one it is meant to replace. A pending block has no canonical
hash, so a simulation pinned to it cannot be re-verified against the block it ran on. The typed
variants and the concrete block tags are the successors and exist in the same major. AGENTS.md §7
mandates the 4-step deprecation flow, so skipping it needs a recorded decision.

## Decision

`evm-simulation` 5.0.0 removes, in one step and without the successor-introduction, `@deprecated`
and one-minor coexistence steps of the §7 flow:

- the `{ type: "approval" }` and `{ type: "signature" }` variants of `SimulateParams.authorizations`;
- `"pending"` as a value of `SimulateParams.blockNumber`.

`SimulateParams.authorizations` accepts only the five typed `SimulationAuthorization` variants.
`SimulateParams.blockNumber` accepts a `bigint` or a block tag other than `"pending"`; a request
with `"pending"` throws `SimulationValidationError`.

This supersedes only the legacy-authorization part of ADR-2026-09-18's Migration section. The
rest of that record is unchanged, apart from the Tenderly part already superseded by
[`ADR-2026-10-01`](./ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation.md).

The exception does not waive the major changeset, migration notes, the maintained-dependent audit,
or continued availability of `evm-simulation` 4.x. No other removal inherits it.

## Invariants

- `evm-simulation` 5.0.0 exports no `approval` or `signature` authorization variant → `tsc`
  rejects `{ type: "approval" }` and `{ type: "signature" }` in `SimulateParams.authorizations`.
- `SimulateParams.blockNumber` excludes `"pending"` → `tsc` rejects it, and the request parser
  unit test proves the runtime rejection.

## Rejected alternatives

- **Follow ADR-2026-09-18 as written: deprecate in a minor, remove in the next major.** Rejected:
  the minor would keep an unverifiable authorization input and an unpinnable block tag reachable
  while their replacements already exist; there is nothing to coexist with.

## References

- Supersedes the legacy-authorization part of the Migration section of
  [ADR-2026-09-18: EVM simulation — calldata verification and result constraints](./ADR-2026-09-18-evm-simulation-calldata-verification.md).
- [ADR-2026-10-01: Retire the Tenderly backend in `evm-simulation` 5.0.0 without a deprecation minor](./ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation.md)
- [ADR-2026-05-13: SDK package deprecation lifecycle](./ADR-2026-05-13-sdk-package-deprecation-lifecycle.md)
- Accepted in https://github.com/morpho-org/sdks/pull/1172.
