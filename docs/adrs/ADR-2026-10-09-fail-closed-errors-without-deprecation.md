# ADR-2026-10-09: Ship fail-closed token, chain and contract-code errors without a deprecation minor

| Field      | Value                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status** | accepted; `morpho-sdk` 7.0.0 target superseded by ADR-2026-10-13-malformed-token-metadata-error                                                                                                                                                     |
| **Date**   | 2026-10-09                                                                                                                                                   |
| **Author** | @Foulks-Plb                                                                                                                                                  |
| **Scope**  | `blue-sdk-viem` 7.0.0, `morpho-sdk` 7.0.0, `wdk-protocol-lending-morpho-evm` 3.0.0, and the next major of maintained dependents such as `liquidity-sdk-viem` |

_Status is the only field that changes after acceptance._

## Context

Several exported reads and requirement resolvers resolved successfully from data the SDK never
verified, and the result looked usable:

- a token whose `decimals()` read failed, for any reason including an RPC outage or an address
  with no code, got `decimals: 0`, which mis-scaled every amount derived from it by up to
  10^18;
- a token with no permit domain name produced ERC-2612 typed data with `name: undefined`, which
  the token could not verify;
- an RPC endpoint connected to another chain served that chain's state, because only the chain the
  client declared was compared, and core contracts share addresses across chains;
- a registry target with no contract code passed requirement resolution, and a call to it
  succeeded on-chain as a no-op.

`docs/jsdoc-style.md` §5 makes a new `@throws` class on an existing export a breaking change,
and AGENTS.md §7 requires the 4-step deprecation flow for breaking changes. That flow keeps the
old behavior exported for one minor next to an opt-in successor. Here the old behavior was the
defect: during a coexistence minor every integrator that had not opted in would keep building
transactions from guessed decimals, wrong-chain state and code-less targets. Fund safety
outweighs the coexistence window, as it did for the Vault V2 `forceWithdraw` exception.

## Decision

These majors make the listed exports throw typed errors in place, without the
successor-introduction, `@deprecated` and one-minor coexistence steps of the §7 flow:

- **Token metadata** (`blue-sdk-viem` 7.0.0, re-exported by `morpho-sdk` 7.0.0): `fetchToken`
  and `Token.fetch` throw `UnknownTokenError` when `decimals()` reverts, the address has no
  code, the result cannot be decoded or is outside 0–255, and propagate transport errors from
  every metadata read instead of returning `undefined` fields. `getPermitTypedData` throws
  `MissingPermitDomainNameError` when the token exposes neither `name()` nor an EIP-5267 domain.
  In `morpho-sdk` 7.0.0, `encodeErc20Permit` throws both errors. WDK requirement resolution can
  reject with `UnknownTokenError` and transport errors in `wdk-protocol-lending-morpho-evm`
  3.0.0.
- **Wrong chain** (`morpho-sdk` 7.0.0): entity reads, `getRequirements()` on action outputs that
  read on-chain state, and the exported requirement resolvers query `eth_chainId` and throw
  `ChainIdMismatchError` when the RPC serves another chain, or a viem transport error when that
  query fails. Synchronous `buildTx()` builders are unchanged.
- **Missing contract code** (`morpho-sdk` 7.0.0): Blue, VaultV1 and VaultV2 `getRequirements()`
  throw `MissingContractCodeError` when a registry contract the flow writes to has no code.

The exception also covers exports, in these packages or in any maintained dependent, that reach a
listed export directly or transitively and only propagate its new errors: for example
`fetchVault`, `fetchAccrualVault`, `fetchVaultUser`, `fetchVaultV2` and `fetchAccrualVaultV2`
through `fetchToken`, and `liquidity-sdk-viem`'s `LiquidityLoader` through `fetchVault`. Each
such package ships the change in its next major.

The exception covers only these errors on these exports. It does not waive the major
changesets, the migration guides, the maintained-dependent audit, or continued availability of
the previous majors. No other break inherits it.

## Invariants

- No listed export resolves from the unverified data it now rejects → the fail-closed tests for
  token metadata, wrong-chain RPCs and missing contract code assert the typed error and that no
  `Requirement` or `Transaction` is produced; deleting a check fails its test.
- Genuine 0-decimal tokens still resolve with `decimals: 0` → the token metadata unit test for a
  genuine 0-decimal token.
- Each listed change ships as a major with a migration-guide entry → PR review of the changesets
  and migration guides.
- Revisit if a later break claims this exception for an error not listed here, or for an export
  the Decision does not cover.

## Rejected alternatives

- **Opt-in strict mode in a minor, default in the next major.** Rejected: the default path in the
  minor still turns outages into `decimals: 0` and reads another chain's state, so the window
  protects the defect rather than integrators.

## References

- [ADR-2026-08-28: VaultExitBundlesV1 force withdraw for Vault V2](./ADR-2026-08-28-vault-exit-force-withdraw.md)
  (fund-safety precedent for skipping the coexistence minor)
- [ADR-2026-05-13: SDK package deprecation lifecycle](./ADR-2026-05-13-sdk-package-deprecation-lifecycle.md)
- Accepted in the PR that added this file.
