# TIB-2026-08-28: Retire Vault V1 shared liquidity

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Status**     | Proposed                                                         |
| **Date**       | 2026-08-28                                                       |
| **Author**     | @Rubilmax                                                        |
| **Scope**      | Packages: `morpho-sdk`, `wdk-protocol-lending-morpho-evm`       |
| **Supersedes** | TIB-2026-08-25 Vault V1 planning and composition retention only |

---

## Context

[`TIB-2026-08-25`](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md) keeps Vault V1
shared-liquidity planning data and low-level Bundler3 composition after high-level Blue writes move
to BlueBundlesV1. That retention leaves two allocator models in the public SDK even though Vault V2
BluePublicAllocator is the supported successor.

The next `morpho-sdk` major should remove the obsolete Vault V1 algorithm rather than preserve a
second planning and composition path indefinitely. The removal needs a published deprecation minor
first under the repository's package lifecycle rules.

## Goals / Non-Goals

**Goals**

- Give every consumer of the Vault V1 shared-liquidity algorithm a deprecation warning before the
  next major.
- Make Vault V2 BluePublicAllocator the only shared-liquidity model in the next major.
- Keep the previous `morpho-sdk` major available for integrations that still require PublicAllocator
  V1.

**Non-Goals**

- Remove Vault V1 deposits, withdrawals, redemptions, migrations, or in-kind exits.
- Remove raw Vault V1 protocol ABI, address, fetch, or config exports from their protocol packages.
- Remove unrelated Bundler3 primitives.

## Current Solution

`morpho-sdk` exposes Vault V1 reallocations through high-level Blue inputs, state and planner
classes, free helpers, validators, V1-only types and errors, and
`BundlerAction.publicAllocatorReallocateTo`. The WDK adapter also accepts Vault V1 reallocations in
its legacy borrow options. `liquidity-sdk-viem` consumes the same V1 planner through its
`morpho-sdk` 5 peer range.

## Proposed Solution

Publish one prerequisite minor that deprecates every public `morpho-sdk` symbol whose sole purpose
is Vault V1 shared-liquidity planning or PublicAllocator composition, including:

- the Vault V1 branch accepted by high-level Blue reallocation inputs;
- `VaultV1ReallocationData`, its input shape, planner methods, metrics, and compatibility aliases;
- V1 planner options, intermediate and action-ready reallocation types, free helpers, validators,
  and V1-only errors;
- `InputReallocation`, `ActionArgs.reallocateTo`, and
  `BundlerAction.publicAllocatorReallocateTo`;
- the WDK Vault V1 borrow-reallocation input.

Keep these symbols functional for the deprecation minor. Remove them in the next `morpho-sdk` and
WDK majors, and make high-level Blue reallocation inputs accept Vault V2 only. Raw protocol
surfaces remain available because this decision retires the SDK algorithm, not the deployed
contract.

Do not widen `liquidity-sdk-viem`'s peer range to the next `morpho-sdk` major while it depends on the
removed V1 planner. Its existing release remains available with `morpho-sdk` 5 unless a separate
decision migrates it to Vault V2.

## Considered Alternatives

### Deprecate only high-level Blue inputs

Keep V1 planning and manual Bundler3 composition as advanced APIs.

**Why rejected:** Those APIs preserve the unsupported algorithm and imply an ongoing compatibility
commitment after Vault V2 becomes the only high-level route.

### Remove the V1 surface immediately

Delete the algorithm in the BlueBundlesV1 major without a prior minor.

**Why rejected:** Vault V1 reallocations are outside the narrow route-migration exception and must
follow the repository's published deprecation lifecycle.

## Assumptions & Constraints

- The deprecation minor must publish before the BlueBundlesV1 major.
- Vault V2 BluePublicAllocator remains the supported shared-liquidity successor.
- Previous package majors remain installable for integrations that require Vault V1 reallocations.

## References

- [TIB-2026-08-25: Route Blue actions through BlueBundlesV1](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [TIB-2026-08-18: Vault V2 Blue reallocation API](./TIB-2026-08-18-vault-v2-blue-reallocation-api.md)
