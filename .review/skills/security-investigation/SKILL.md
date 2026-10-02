---
name: security-investigation
description: Assess SDK protocol semantics and transaction authority for ABI/address, accounting, chain, approval, signature, routing, simulation or transaction-flow changes; follow CI and code trust boundaries through their owning SDK areas.
---

# Protocol and transaction safety

Read root `AGENTS.md` §1, §5 and §7, the affected package/nested contracts and canonical ABI/address/math/operation sources in the reviewed checkout. Follow funds and authority through a complete caller flow. Establish attacker-controlled inputs, privileges and inherited guards before claiming a vulnerability. Workflow trust belongs to `developer-workflow`; implementation injection and secrets also use `sdk-correctness`.

## Protocol semantics

- Compare changed function/argument tuples, widths, structs, payable/value fields and typed-data domains with pinned sources. Reuse canonical ABIs/deployments, including `morpho-ts` owners and compatibility re-exports. Inspect actual math/constants owners rather than stop at a facade. Runtime ABI fetching and divergent copies violate the release contract.
- Follow destination, spender, operator, recipient and authorization through direct vault/market calls, GeneralAdapter1/Bundler3, Midnight bundles and standalone VaultExitBundlesV1. Current routing docs and action contracts determine the route.
- Check native transfer/wrap before consumption, reallocation before the liquidity-consuming action, repay before collateral withdrawal, callbacks and receiver/initiator semantics. Native wrapping requires wNative. Forced exits deallocate before final withdrawal/redeem; in-kind exits retain their standalone periphery and lazy preflight boundary.
- Verify decimal scaling, asset/share rounding, total-assets/supply snapshots, min/max share-price protection and the documented inflation guard. Read canonical helpers for LLTV, buffers, WAD and oracle units; apply each entity's actual guard requirements.
- Preserve Blue timestamp behavior: market/position accrual at/before lastUpdate returns an unchanged copy without projection/rewind; past rate queries use lastUpdate and still reject unsupported IRMs. Vault V2 at/before its timestamp has zero fee shares. Forward accrual respects newer/empty/unsupported nested snapshots and reuses the accrued liquidity adapter. Vault V1 loss/fee reconciliation has no vault-wide timestamp.
- Distinguish partial asset repayment, exact-share repayment and upper-bound transfer. Trace native carving/addition and leftover skimming through requirements/output; fully native funding can need no ERC-20 pull.
- V1 reallocations use sorted withdrawals and ETH fees. V2 uses BluePublicAllocator, caller adapters, unsorted source/idle variants and per-call ceil(assets × penalty / WAD) loan-token donations. Requirements sum independently rounded penalties; only V1 fees enter tx.value. Mixed-version plans reject; high-level allocator calls retain skipRevert false.
- Check allocation headroom and hydrated configuration math against `blue-sdk`. Reads preserve chain/key/block context; liquidity planning uses one onchain block and deterministic loader output. New protocol terms remain discoverable in their owning glossary.

## Transaction authority and composed flows

- Validate chain/account at the owning boundary. `morpho-sdk` entities validate client chain before reads/construction; requirement signing checks signer/user identity. Pure encoders receive state and remain synchronous. `actions/requirements` intentionally resolves state asynchronously.
- Check pinned typed-data domain, nonce freshness/retry handling, signature ownership, cross-chain replay and delayed-use validity. A fixed five-minute deadline heuristic alone establishes no defect; inspect the actual supported window.
- Trace authorized amount/token/spender/recipient across approvals, Permit2, signatures and bundles, including aggregate V2 penalties. Distinguish deliberate persistent approvals and simulation descriptors from a newly exposed unlimited spend. Revocation findings need actual authority and a reachable recovery path.
- Challenge the entire transaction sequence: can an adversary change state or reuse authority between steps, redirect assets, or exploit a callback or partial failure? Reconcile calldata, ABI/address pairing, value and fee overrides with that path. Derive selectors from pinned sources unless an encoded literal is documented.
- Where this code owns submission, check receipt/failure handling before dependent operations and shared-signer nonce ordering. Returning a descriptor/hash intentionally does not promise mining. Hook findings require an actual stale/repeated operation; primitive address strings do not gain object identity on each render.
- Reverts, user rejection and failed transactions remain failures. Simulation authorization/retained balances follow `evm-simulation`'s contract; fallback classification belongs to `sdk-correctness`.

Finish with source-backed protocol invariants and authority paths checked, or precise missing evidence. A wrong-but-reverting transaction and an exploitable spend have different consequences; calibrate through Lupin's assigned policy rather than a default-critical persona label.
