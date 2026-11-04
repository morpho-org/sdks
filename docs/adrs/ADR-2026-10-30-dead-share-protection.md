# ADR-2026-10-30: Dead-share protection on supply and deposit flows

| Field      | Value                  |
| ---------- | ---------------------- |
| **Date**   | 2026-10-30             |
| **Author** | @Foulks-Plb            |
| **Scope**  | Packages: `morpho-sdk`, `wdk-protocol-lending-morpho-evm` |

_Frozen after merge; only superseded-by entries in References change._

## Context

A Morpho Blue market or a vault with almost no supply can have its share price inflated by a
donation, so the next supplier or depositor receives far fewer shares than the assets they bring.
The protocol's defense is a permanent dead deposit owned by `0x000000000000000000000000000000000000dEaD`.
An SDK flow that supplies into a market or deposits into a vault without that deposit exposes the
integrator's user to the attack, and the SDK can only check it from a snapshot of the target.

## Decision

Snapshot-taking SDK flows that supply to a Blue market or deposit into a vault refuse to build
unless the target's snapshot proves a sufficient dead deposit, recursively through the markets and
vaults the deposit can reach.

- A Blue market needs at least `1e9` supply shares owned by the dead address.
- A Vault V1 needs at least `1e9` dead shares, and every withdraw-queue market must pass.
- A Vault V2 needs at least `1e9` dead shares worth at least `1e6` assets, a share price above
  `1 / (10 * virtualShares)`, and every nested market or Vault V1 with a positive cap in the snapshot
  must pass. The snapshot always holds the liquidity market, which deposits reach; market adapters
  list only the other markets they supply to, so a positive-cap market with no allocation is not
  checked and a later allocator reallocation can move funds into it.
- Missing snapshot data fails closed with a typed error; the dead holder is never `address(1)`.
- `BlueActions.supply` introduces a snapshot-taking overload and deprecates the snapshot-free
  overload for one minor before removing it in the next major, following the normal deprecation
  lifecycle. The legacy overload preserves its previous behavior and cannot check the dead deposit;
  callers gain protection only by passing `marketData`. No deprecation exception applies.

## Invariants

- Each snapshot-taking supply and deposit builder calls its dead-share validator before returning a transaction.
  Check: unit tests per validator one share below each threshold; mocked-transport tests with no
  RPC request for Blue `supply` and `migrateToV2`; a mocked-transport test for `supplyBlueMakeLend`
  expecting the typed error after its parking-market fetch; fork tests for Vault V1 and V2
  `deposit`.
- The deprecated snapshot-free Blue `supply` overload remains callable during the minor window.
  Check: interface and entity compatibility tests compare its transaction with a protected supply.
- Validators are pure and RPC-free. Check: unit tests call them directly as pure functions, without
  a client.
- Revisit if the protocol changes its dead-deposit convention or thresholds.
