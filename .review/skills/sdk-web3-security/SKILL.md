---
name: sdk-web3-security
description: Use for transaction parameters, chain/account validation, approvals, permits, typed-data signatures, nonces, deadlines, or dependent onchain operations.
---

# Wallet and transaction safety

Read root `AGENTS.md` §1–2 and §5, the owning package and action/entity/requirement instructions, pinned ABI/address sources and actual signer/caller boundaries. Trace the value or authority at risk from input to signing/sending or the returned transaction descriptor.

## Check authority at its owner

- Confirm destination chain and account where the contract requires validation. `morpho-sdk` entities validate client chain before reads/construction; signer/user identity is checked at requirement signing. Pure encoders need not gain a client or perform RPC merely to duplicate those checks. Inspect upstream enforcement before asserting absence.
- Check protocol-pinned typed-data name/version/chain/verifying contract, nonce freshness and retry handling, signature ownership and cross-chain replay. For deadlines, show the supported validity window and delayed-use behavior; a fixed five-minute heuristic alone does not establish a defect or justify moving clock/RPC reads into an encoder.
- Trace spender/operator, authorized amount, token and recipient through approvals, Permit2, authorization signatures and bundles. Enforce exact/aggregate amounts where the operation contract requires them, including independently rounded V2 penalties. Distinguish user-selected persistent approvals and simulation authorization descriptors from a newly exposed unlimited spend. Recovery/revocation findings need actual granted authority and a reachable failure path.

## Check the transaction path

- Reconcile ABI and address registry, calldata argument shape and widths, payable/value semantics and fee overrides. Derive selectors from pinned ABI/viem unless the documented encoded literal is intentional. Protocol routing and accounting use `sdk-morpho-protocol`.
- Where the changed code owns submission, trace receipt/failure handling before dependent reads/writes and nonce sequencing for a shared signer. Returning a transaction hash or a pure descriptor is not itself a missing receipt wait.
- Check applicable wagmi chain/enable/dependency guards from their real reactive behavior. Primitive address strings do not acquire object identity on each render; a hook finding needs an actual stale or repeated operation.
- Preserve synchronous pure transaction actions, immutable inputs and frozen descriptors. Async state/signing work belongs to its documented boundary, including `actions/requirements`. Builders receive the state they need.
- Decode/surface contract reverts, user rejection and failed transactions without turning them into success. Simulated authorizations and retained balances must satisfy `evm-simulation`'s own documented semantics.

Retain security claims only with attacker/caller capability, required preconditions, changed path and concrete effect. Wrong-but-reverting output and an exploitable spend have different impact. Use the assigned Lupin severity/confidence policy, not the former persona's default-critical labels. Unavailable source evidence limits coverage; it is not a vulnerability.
