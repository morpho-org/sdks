---
name: sdk-morpho-protocol
description: Use for ABI/address or typed-data changes, transaction routing, protocol entities, accrual, rounding, LLTV, shares, native wrapping, allocator fees or penalties.
---

# Morpho protocol semantics

Read root `AGENTS.md` §1, §5 and §7, affected package/nested instructions and the canonical ABI/address/constant/operation sources. For `morpho-sdk`, read its routing glossary plus the affected actions and entities instructions. Resolve protocol facts from the reviewed sources; unavailable ABI or state evidence is a coverage limit.

## Encoding and routing

- Compare every changed function name/argument tuple, width, struct, payable/value field and typed-data domain with the pinned source. Reuse canonical ABI/deployment exports, including shared `morpho-ts` definitions and compatibility re-exports. Runtime ABI fetching and divergent copies violate the release/source-of-truth contract.
- Follow the destination, spender, operator and authorization through the complete transaction. Distinguish direct vault/market calls, GeneralAdapter1/Bundler3 paths, Midnight bundles and standalone VaultExitBundlesV1. Consult current routing docs and per-action JSDoc rather than a generic rule about every deposit or withdrawal.
- Check native transfer/wrap before consumption, reallocation before the liquidity-consuming action, repay before collateral withdrawal, callbacks and receiver/initiator semantics. Native wrapping requires wNative. Vault forced exits place forceDeallocate calls before final withdrawal/redeem; in-kind exits use their standalone periphery and documented lazy preflight boundary.

## Accounting

- Verify asset/share rounding, total-assets/supply snapshots, min/max share-price protections and the documented inflation guard. Compare units for LLTV, buffer, WAD and oracle scaling using canonical helpers. Read entity-specific LLTV obligations rather than applying every guard to every operation.
- Preserve Blue timestamp behavior: market/position accrual at or before lastUpdate returns an unchanged copy without projection/rewind; past rate queries use lastUpdate and still reject unsupported IRMs. Vault V2 at/before its timestamp has zero fee shares. Forward accrual follows contributing nested state, respecting newer/empty/unsupported nested snapshots and reusing the accrued liquidity adapter. Vault V1 loss/fee reconciliation remains valid without a vault-wide timestamp.
- Distinguish partial asset repayment from exact-share repayment and upper-bound transfer. Follow native carving/addition and leftover skimming through requirements and encoded output; fully native funding can require no ERC-20 pull.
- V1 reallocations use sorted withdrawals and ETH fees. V2 uses the registered BluePublicAllocator, caller adapters, unsorted source/idle variants and per-call ceil(assets × penalty / WAD) loan-token donations. Sum independently rounded penalties for requirements; only V1 fees enter tx.value. Mixed version plans reject, and high-level allocator calls retain skipRevert false.
- Check canonical allocation-headroom and hydrated configuration math in `blue-sdk`; state reads preserve chain/key/block context. In liquidity planning, snapshot onchain state at one block and preserve deterministic loader output.

Check entity names and V1/V2/Market terminology against actual operations. A changed protocol concept must remain discoverable in its owning glossary/routing contract. Record mechanisms and source evidence, and connect any retained finding to changed output or a binding contract.
