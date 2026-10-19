# EVM simulation v5 → v6

## Version 6.1.0: fail-closed RPC response handling

`simulate()` classifies node-level reverts reported as `-32000 "execution reverted"` or
Nethermind's `VM execution error` as `SimulationRevertedError`, like a code `3` revert. A
non-JSON body on a 2xx reply from block lookup, `eth_getCode`, or `eth_simulateV1` throws
`InvalidSimulationResponseError`; a JSON `null` from block lookup or `eth_getCode` does too,
as does a JSON body that is not a JSON-RPC object from `eth_simulateV1`. Other JSON block
responses without an RPC result remain missing-block `ExternalServiceError`s, while a code
response without a result is treated as no code and causes `SimulationValidationError` for
calldata targets. An HTTP error status remains `ExternalServiceError` unless the body is a
well-formed JSON-RPC error, in which case it is classified by its code and message,
regardless of status. Plain-text bodies do not become `SimulationRevertedError`.

An empty 2xx block-lookup body without a JSON `Content-Type` is parsed by viem
as `{}` and treated as a missing block; it remains `ExternalServiceError`. With
`Content-Type: application/json`, an empty 2xx body fails JSON parsing and
becomes `InvalidSimulationResponseError`.

## Restricted bundle address moved to MidnightBundlesV2

The standalone-bundle retention guard now restricts the registered
`midnightBundlesV2` address instead of the removed `midnightBundles` (V1)
address. Net value retained by a `bundles` or `midnightBundlesV2` contract
above `DUST_THRESHOLD` (100 raw units per restricted address/token) still
raises `BlacklistViolationError`.

Two behavior changes follow:

- Value left in the MidnightBundles V1 contract is no longer flagged — V1
  addresses no longer exist in the chain registry.
- Value left in the MidnightBundles V2 contract is now flagged. Simulations
  of Midnight maker, taker or cancel flows that leave value in V2 now raise
  `BlacklistViolationError` where v5 succeeded.

No call-site changes are required; the guard reads the top-level
`midnightBundlesV2` registry key in place of the removed top-level
`midnightBundles` key (both sit next to the `bundles` map, not inside it).
Custom chains registered through `registerCustomAddresses` must set that key
for V2 to stay guarded.

## Dependency majors

The published package's `@morpho-org/blue-sdk`, `@morpho-org/morpho-sdk` and
`@morpho-org/morpho-ts` dependencies move to new majors — `blue-sdk` ^8,
`morpho-sdk` ^7, `morpho-ts` ^4 — which drop the `midnightBundles` registry
keys and `midnightBundlesAbi`. Upgrade those packages together; npm installs
them automatically, but pinned or vendored copies must move in lockstep. See
the matching `morpho-sdk` [v6 → v7 guide](../../packages/morpho-sdk/MIGRATION-v6-to-v7.md).
The `viem` peer range is unchanged.

## Staying on v5

Integrations that still simulate MidnightBundles V1 flows should stay on
`@morpho-org/evm-simulation` 5.x — v6 cannot flag value retained by V1,
because the V1 registry entries no longer exist.
