# ADR-2026-10-08: Replace `evm-simulation`'s chain config with the caller's viem client in 6.0.0 without a deprecation minor

| Field      | Value                    |
| ---------- | ------------------------ |
| **Status** | accepted                 |
| **Date**   | 2026-10-08               |
| **Author** | @jinmel                  |
| **Scope**  | `evm-simulation` 6.0.0   |

_Status is the only field that changes after acceptance._

## Context

`evm-simulation` 5.x takes a `SimulationConfig` built by the caller: a map of
`chainId → ChainSimulationConfig` carrying the `eth_simulateV1` endpoint URL and
per-chain knobs (`blockOverrides.gasLimit`, `parentHashCheck`), plus `logger` and
`timeoutMs`. `SimulateParams.chainId` selects the entry, and the package builds
its own viem client on that URL.

That config layer duplicates what every caller already has: a viem client whose
`chain.id` names the chain and whose transport names the endpoint. Keeping both
means two chain identifiers that can disagree — the config key and the transport's
actual node — and forces the package to own transport policy (timeout budget,
zero retries) that should belong to the caller. The v5 lifecycle ADRs
(`ADR-2026-10-01`, `ADR-2026-10-02`) covered removals inside the unpublished v5
line; v5 is now released (5.1.0), so the client refactor is a removal from a
published API and AGENTS.md §7 requires a recorded decision to skip the 4-step
deprecation flow.

## Decision

`evm-simulation` 6.0.0 removes, in one step and without the successor-introduction,
`@deprecated` and one-minor coexistence steps of the §7 flow:

- `SimulationConfig`, `ChainSimulationConfig`, `SimulateParams.chainId`,
  `resolveChain` and `createSimulationClient`;
- the `simulate(config, params)` signature in favor of
  `simulate(client, params)`, where `client` is the caller's
  `Client<Transport, Chain>`.

The chain id comes from `client.chain.id`; a client without `chain` throws
`InvalidChainIdError`. The former config fields move onto `SimulateParams`
(`logger`, `timeoutMs`, `blockOverrides`, `parentHashCheck`). Request verification
is unchanged: every call inside `eth_simulateV1` still carries the chain id as a
hex quantity, so a node on a different chain still rejects the simulation.

This also supersedes the `ADR-2026-10-01` invariant that "`timeoutMs` aborts the
`eth_simulateV1` request": the caller's client owns the transport, so `timeoutMs`
bounds only the steps `simulate()` drives between requests; in-flight requests
follow the caller transport's own timeout and retry policy. The rest of
ADR-2026-10-01 is unchanged.

The exception does not waive the major changeset, the v5→v6 migration guide, the
maintained-dependent audit, or continued availability of `evm-simulation` 5.x.
No other removal inherits it.

## Invariants

- `evm-simulation` 6.0.0 exports no `SimulationConfig`, `ChainSimulationConfig`,
  `resolveChain` or `createSimulationClient`, and `SimulateParams` has no
  `chainId` field → `tsc` rejects all of them.
- `simulate` accepts a caller `Client<Transport, Chain>` → `tsc` rejects a
  client typed without `chain`, and the request parser unit test proves the
  runtime `InvalidChainIdError` for a chain-less client.
- Every call inside `eth_simulateV1` carries `client.chain.id` as a hex
  quantity → the boundary unit test asserts the request shape.

## Rejected alternatives

- **Deprecate the config API in a 5.x minor, remove in 6.0.0.** Rejected: the
  minor would ship two parallel ways to name the same chain — `SimulateParams.chainId`
  selecting a config entry, and `client.chain.id` — whose disagreement is exactly
  the ambiguity the refactor removes. The removal is mechanical for callers
  (build a `createPublicClient` they largely already have), so a coexistence
  minor would only prolong the duplicate surface.
- **Keep `SimulationConfig` as an optional wrapper.** Rejected: it reintroduces
  the dual chain-identifier problem it exists to remove, for no added capability.

## References

- [`ADR-2026-10-01`](./ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation.md) — superseded in part (the `timeoutMs` invariant only).
- [`ADR-2026-10-02`](./ADR-2026-10-02-evm-simulation-remove-legacy-authorization-variants-without-deprecation.md) — same §7 exception pattern for the v5 line.
