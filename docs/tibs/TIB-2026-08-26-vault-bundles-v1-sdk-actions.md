# TIB-2026-08-26: VaultBundlesV1 SDK action flows

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| **Status** | Proposed                                       |
| **Date**   | 2026-08-26                                     |
| **Author** | @foulques                                      |
| **Scope**  | Packages: `morpho-sdk`, `wdk-protocol-lending-morpho-evm` |

---

## Context

The protocol team is replacing Bundler3 / GeneralAdapter1 vault routes with
[`VaultBundlesV1`](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/VaultBundlesV1.sol),
a fixed-flow contract whose call order, token routing, authorization handling, fee accounting, and
refund behavior are audited onchain.

`VaultBundlesV1` exposes three entrypoints:

| Entrypoint | Purpose |
| ---------- | ------- |
| `vaultBundlesV1Deposit` | Pull or wrap assets and deposit them into a vault for `msg.sender`. |
| `vaultBundlesV1Withdraw` | Withdraw by assets or redeem by shares and pay `msg.sender`. |
| `vaultBundlesV1Migrate` | Exit a source vault and deposit the proceeds into a same-asset destination vault. |

This TIB records the stable SDK behavior required by that route. It deliberately does not prescribe
source-file placement, private helpers, downstream adapter method names, or implementation
sequencing.

Two earlier decisions remain relevant:

- [TIB-2026-07-27](./TIB-2026-07-27-vault-exit-in-kind-redemption.md) establishes the fixed-bundle
  deadline, authorization, and gate-preflight precedents.
- [TIB-2026-08-25](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md) establishes the token-funding
  behavior shared by fixed Blue and vault bundles, including Permit2 SignatureTransfer.

The contract revision reviewed for this proposal is
`f27e7bcf744310303e24faa522b71d702e696686`. Published ABIs and deployments must use the final
reviewed deployment revision.

## Decision Summary

- Existing vault actions and entity methods keep expressing the user's intent; they route through
  `VaultBundlesV1` instead of gaining a parallel bundles-specific vocabulary.
- Stateful preparation returns an immutable operation handle. Requirements, signatures, and the
  final transaction belong to that handle and must not be recomputed through a second entity call.
- Actions remain synchronous and pure. Entity handles own RPC reads and state-derived bounds.
- Deposits support classic approval, ERC-2612, Permit2 SignatureTransfer, and native funding where
  the vault asset is the chain's wrapped native token.
- Withdraw, redeem, and migration authorize the bundle contract to spend vault shares. A signed
  authorization is bound to the exact prepared owner, vault, spender, share cap, nonce, and deadline.
- Contract amounts are gross amounts. Fee-adjusted net amounts drive destination and deposit
  protections.
- The SDK does not invent a source-exit price bound or reliable standalone gate check that the
  contract cannot enforce.
- Public removals and semantic changes follow the repository's deprecation, major-release,
  migration-guide, dependent-audit, and security-audit requirements.

## Goals / Non-Goals

### Goals

- Route Vault V1 and Vault V2 deposit, withdraw, redeem, and V1-to-V2 migration through
  `VaultBundlesV1` while preserving the established operation names.
- Define authorization and amount semantics precisely enough that all SDK and adapter surfaces
  produce the same safe behavior.
- Preserve the `Client -> Entity -> Action` boundary and the stateless extension model.
- Identify breaking changes, lost capabilities, operational dependencies, and security invariants
  before release.

### Non-Goals

- No new `vaultBundlesV1*` public action namespace or parallel vault entity.
- No version-agnostic migration surface. This decision covers the established V1-to-V2 migration.
- No changes to the in-kind redemption route, foreign-protocol migrations, or `wrapMorphoLegacy`.
- No generic bundle-call, callback, automatic routing, or multi-vault composition API.
- No native-token output on exit.
- No source-exit share-price protection or gate preflight that is not execution-equivalent.
- No prescription of downstream WDK method names or private SDK implementation structure.

## Public Behavior

### 1. Preserve intent-oriented vault operations

The established deposit, withdraw, redeem, and V1-to-V2 migration action and entity names remain the
public vocabulary. Their route changes in place:

| SDK intent | VaultBundlesV1 behavior |
| ---------- | ----------------------- |
| Deposit | Pull or wrap the gross assets, deduct any referral fee, and deposit the net assets. |
| Withdraw | Exit by an exact asset amount, burning up to the prepared share cap. |
| Redeem | Exit by an exact share amount. |
| Migrate to V2 | Exit a V1 source by assets or shares and deposit the post-fee proceeds into a same-asset V2 destination. |

The SDK must carry enough chain context to select the registered deployment without an RPC read in
the action layer.

The contract fixes depositor, share owner, and proceeds recipient to `msg.sender`. Consequently,
legacy receiver and owner parameters cannot be honored. They must be deprecated before removal and
must never be accepted and silently ignored. On the new route, `userAddress` means the account that
will submit the transaction. When a connected account is available, the SDK rejects a mismatch.
Public-client and offline builders cannot prove the submitting account, so their documentation must
make this responsibility explicit.

Delegated deposits and exits remain possible only through a route whose contract supports distinct
owner and recipient addresses.

### 2. Prepare once and keep the operation handle

A stateful vault operation is represented by an immutable prepared-operation handle. “Handle” means
the value returned after the entity has combined the caller's intent with the vault state needed to
construct the operation. It is not an onchain identifier and does not imply a mutable SDK cache.

The handle owns the stable context for the operation:

- chain, contract, vault, asset, submitting account, and amount mode;
- deadline and fee configuration;
- state-derived price or share bounds; and
- the owner, spender, amount, nonce, and deadline expected from each signature.

The required lifecycle is:

1. prepare an operation once;
2. obtain that handle's requirements;
3. satisfy or sign those requirements; and
4. build the transaction from the same handle.

Calling the entity operation a second time creates a new handle and therefore a new intent. Its
state-derived bound or deadline may legitimately differ. A signature produced for the first handle
must not be reused merely because the user-facing options look equal.

Calling requirement resolution more than once on the same handle may observe that an approval or
nonce has since been consumed, but it must not silently change values already captured for signing.
If the caller intentionally refreshes a bound or deadline, it creates a new handle and signs the new
requirements.

Adapters, including WDK, must preserve this lifecycle. They may expose the SDK handle directly or a
caller-held prepared-operation value, but they must not implement requirement discovery and
submission as two independent calls that each recreate the entity handle. This TIB specifies that
invariant, not the adapter's public method names.

### 3. Keep reads in entities and encoding in actions

The architectural boundary remains:

| Layer | Responsibility |
| ----- | -------------- |
| Client | Construct chain-scoped entities without reading state. |
| Entity / prepared handle | Read allowances, permit state, vault state, and nonces; capture derived bounds. |
| Action | Validate complete inputs and synchronously encode one immutable transaction. |
| Pure helpers | Perform deterministic validation, arithmetic, and ABI-compatible reshaping. |

An action never reads RPC state, signs, consults a clock, or reconstructs a state-derived bound.
An adapter must not collapse the entity lifecycle into a function that prepares the operation again
at submission time.

### 4. Token funding requirements

For ERC-20 deposits, `VaultBundlesV1` is the token spender. The requirements surface must support
every authorization path accepted by the contract:

- an existing sufficient allowance or a classic approval;
- ERC-2612 where the asset supports it; or
- Permit2 SignatureTransfer.

Permit2 SignatureTransfer is distinct from Permit2 AllowanceTransfer. Their signed data and
requirement discriminants are not interchangeable. Passing the wrong kind must fail with a typed SDK
error before encoding.

A first-time SignatureTransfer user may also need to approve the ERC-20 to the Permit2 contract.
That prerequisite must appear before the signature requirement. The approval must cover the
contract's `uint256` token amount domain rather than inheriting AllowanceTransfer's narrower amount
width.

Permit2 uses unordered nonce bits. The application supplies an explicit unused nonce for each
concurrent intent, and the entity verifies the selected bit before signing. The stateless SDK does
not reserve, scan for, or coordinate nonces across processes. Reusing one free nonce for concurrent
intents can produce two valid signatures, but only the first included transaction can consume it.

### 5. Share authorization requirements

Withdraw, redeem, and migration make `VaultBundlesV1` spend the submitting account's vault shares.
When existing allowance is insufficient, the handle offers an ERC-2612 share permit where supported,
or a classic share-token approval otherwise.

The authorized amount is exact and bounded:

- redeem and share-based migration authorize the requested shares;
- asset-based withdrawal and migration authorize the prepared upper bound on shares burned.

The handle accepts a signed share permit only when its authorization kind, vault share token, owner,
spender, amount, nonce, and deadline exactly match the captured requirement. A larger stale permit is
not substituted for the handle's cap, and an insufficient permit is not passed through to fail
onchain.

The share cap for an asset-based exit must account for the supported ways the share price can move
between preparation and inclusion, together with the caller's slippage tolerance. This applies to
Vault V2 and to MetaMorpho 1.0, whose lack of a loss clamp means an accrual-only preview is not a
complete upper bound. The SDK does not max-approve shares by default.

If later state movement exceeds the prepared cap, the transaction may revert. The caller then
prepares a new handle and authorizes its new cap; the SDK does not mutate the old handle.

### 6. Deadlines

Bundle deadlines follow the fixed-bundle convention: a documented short default when omitted and
eager rejection when already expired. The deadline is captured by the prepared handle and checked
again before requirements are returned.

Bundle execution deadlines and permit-signature deadlines are independent contract values. A
transaction builder must not replace either one after a signature has been produced.

### 7. Amount, fee, and slippage semantics

`amount` is the contract's gross asset value: the amount pulled from the wallet on deposit or exited
from the source vault on withdrawal or migration. Approvals, balances, share caps, and native value
therefore cover the gross amount.

The referral fee is deducted from that gross amount. Fee percentages are WAD-scaled, non-negative,
and strictly less than `WAD`; a non-zero fee requires a non-zero recipient. A net-target gross-up
utility, if exposed, must round-trip exactly through the contract's floor-fee formula.

Deposit and migration destination protections use post-fee assets:

- a deposit's maximum share price is calculated from the net amount deposited;
- a migration's destination preview, maximum share price, and zero-share guard use post-fee
  proceeds; and
- Vault V1 and Vault V2 deposit previews use equivalent forward-accrual treatment.

Redeem and share-based migration do not claim fixed asset proceeds before execution. Any displayed
proceeds are simulation previews, not enforced floors.

`VaultBundlesV1` does not enforce a source-exit share-price bound. The SDK must not retain or invent a
parameter that implies otherwise. This is a capability loss for the existing migration route and
must be disclosed in the migration guide.

Migration accepts exactly one source amount mode: assets or shares. Source and destination must be
different vaults with the same underlying asset. Non-positive inputs and previewed zero-share
deposits are rejected before the transaction is built at the earliest layer with enough information.

### 8. Native funding

Native and ERC-20 funding are mutually exclusive. Native value is the gross deposit amount and is
accepted only when the vault asset is the chain's wrapped native token. A token signature supplied
for a native-funded operation is rejected rather than silently discarded.

No exit entrypoint unwraps proceeds to native token.

### 9. Contract execution constraints

The contract's transient initiator permits only one `VaultBundlesV1` call in a transaction. Wallet
call batches and multisends may include approvals and calls to other contracts, but at most one call
to this contract. The SDK does not add a batching abstraction that implies otherwise.

Vault V2 send/receive gates are not pre-checked with standalone reads. A gate may inspect the
bundle's transient execution context, so a standalone check is not execution-equivalent and can
reject a transaction that would succeed. Compatibility is determined through finalized transaction
simulation or execution.

## Compatibility and Release Requirements

The route change is a major SDK change even though established operation names remain:

- removed receiver, owner, and source-price-bound inputs must first be deprecated through the
  repository's required published-minor runway;
- the WDK additive native-plus-token supply surface must likewise gain an exclusive successor and
  complete its deprecation runway before removal;
- compatibility exports already used by fixed vault-exit flows remain available for their promised
  coexistence period;
- migration guides must lead with the changed `userAddress` meaning, authorization flow, exclusive
  funding, and lost capabilities;
- maintained runtime and peer dependents must be audited and bumped as required; and
- the major package surfaces require the repository-mandated security audit and public report.

The TIB does not assign these requirements to an implementation sequence. Release owners may
organize the work differently as long as all gates are satisfied before the breaking release.

## Breaking Changes and Capability Losses

| Change | Required treatment |
| ------ | ------------------ |
| Token and native deposit amounts stop being additive. | Exclusive public input; typed failure for untyped callers; migration example. |
| Deposit receiver is no longer selectable. | Deprecate before removal; document that shares mint to the submitter. |
| Exit owner and recipient are no longer selectable. | Deprecate before removal; document the lost delegated-exit capability. |
| `userAddress` now identifies the submitting account. | JSDoc, connected-account validation, and prominent migration guidance. |
| Withdraw and redeem may require share authorization. | Expose the prepared requirement/sign/build lifecycle. |
| Permit2 funding uses SignatureTransfer with an application-owned nonce. | Keep it distinct from AllowanceTransfer and document concurrent nonce ownership. |
| Migration loses its source-leg price bound. | Remove the misleading input and disclose simulation as preview-only mitigation. |
| Migration accepts assets or shares exclusively. | Make invalid combinations unrepresentable for typed callers and reject them at runtime. |
| Transaction target and calldata change. | Coordinate selector/indexer/simulation consumers before release. |
| Only one VaultBundlesV1 call may execute per transaction. | Document the batching constraint. |
| Gated Vault V2 deployments must admit VaultBundlesV1 on entry and exit. | Curator readiness check before release; finalized simulation for detection. |
| No deposit-for-another-address, exit-to-another-address, or arbitrary Bundler3 composition. | Consumers needing those capabilities retain a compatible route. |
| Referral fees separate gross and net amounts. | Label previews clearly and apply bounds to post-fee values. |

## Acceptance Criteria

Implementations may choose their own module boundaries and private abstractions, but must prove the
following externally observable behavior:

- Every preserved vault operation encodes the intended `VaultBundlesV1` entrypoint and immutable
  transaction shape.
- Actions remain pure and deterministic; RPC and permit-state reads remain at the entity boundary.
- A prepared handle's signed fields do not change between requirement resolution and transaction
  construction.
- Recreating an operation produces a distinct handle; a signature for the old handle is rejected
  when any captured authorization field differs.
- Classic approval, ERC-2612, first-time Permit2, consumed Permit2 nonce, and concurrent distinct
  Permit2 nonce cases behave as specified.
- Share permits reject wrong owner, vault, spender, amount, nonce, or deadline, including stale
  larger permits.
- Asset-based exit authorization remains upper-bounded under the supported loss and accrual cases,
  including MetaMorpho 1.0.
- Native/token exclusivity, chain selection, fee validation, same-asset migration, amount-mode
  exclusivity, and post-fee zero-share protection fail with named public errors.
- Deposit and migration price protection uses net assets, and exact net-target gross-up arithmetic
  matches the contract.
- Standalone gate reads are not presented as authoritative, and double bundle calls are documented
  as reverting.
- WDK or another adapter preserves one caller-held prepared operation across requirement signing and
  submission instead of reconstructing it.
- Public API changes have JSDoc, unit coverage, property-based encoder coverage, pinned-fork coverage
  for state-dependent paths, migration guidance, changesets, and dependent-package review.

## Architectural Decisions

- Call `VaultBundlesV1` directly for the covered intents.
- Preserve intent-oriented action and entity names instead of exposing contract-oriented duplicates.
- Treat a prepared operation handle, rather than an adapter function invocation, as the unit of
  requirement resolution and transaction construction.
- Keep the SDK extension stateless: the handle is caller-held immutable data, not a global nonce or
  operation cache.
- Keep RPC at the entity edge and calldata encoding in synchronous actions.
- Bind every authorization to its complete prepared context and reject mismatches before encoding.
- Use exact, upper-bounded share authorization instead of default max approval.
- Treat contract amounts as gross and apply destination protections to post-fee net amounts.
- Do not promise protections or routing flexibility that the fixed contract cannot enforce.

## Considered Alternatives

### Add a parallel `vaultBundlesV1*` API

Rejected because it duplicates the vocabulary for the same user intent and forces applications to
select a route they should not need to understand.

### Let adapter methods recreate handles internally

Rejected because requirement discovery and submission can then capture different state-derived
bounds or deadlines. A correctly signed authorization can become unusable, or a stale authorization
can be applied to a different prepared intent. The handle must cross the signing boundary.

### Recompute requirements immediately before submission

Rejected as a replacement for handle preservation. A second resolution cannot change already signed
data. Refreshing an intent is valid only when the caller knowingly creates a new handle and signs its
requirements.

### Max-approve vault shares

Rejected because it expands the periphery contract's authority beyond the prepared exit. ERC-2612
keeps the exact-approval path usable without an extra transaction where signatures are supported.

### Reserve Permit2 nonces in the SDK

Rejected because a per-client cache cannot coordinate tabs, processes, servers, or other wallets and
would violate the stateless extension model. Applications own their in-flight intent set.

### Pre-check Vault V2 gates

Rejected because a standalone read lacks the transient initiator context visible during bundle
execution and can produce false negatives.

### Preserve a migration source-price parameter

Rejected because the contract cannot enforce it. Accepting such a parameter would imply protection
that does not exist.

### Interpret `amount` as net proceeds

Rejected because the wallet funds and authorizes the gross contract amount. Applications that begin
from a desired net value can use exact gross-up arithmetic.

## Assumptions and Operational Constraints

- `VaultBundlesV1` is deployed on supported chains and published in the address registry.
- Vault shares used by the signature path implement compatible ERC-2612 behavior.
- No monotonic share-price assumption is made for MetaMorpho 1.0 across loss realization.
- Supported Vault V2 configurations follow the contract's deployment constraints.
- Curators update both relevant Vault V2 gates before the SDK route changes.
- Referral-fee eligibility and policy remain outside the core SDK.
- Applications using public clients keep `userAddress` aligned with the eventual submitter.
- Finalized transaction simulation is the only reliable preflight for transient-context gates and
  remains preview-only protection for the unbounded migration source leg.

## Security

- Share authorization grants a new, narrowly bounded delegation to `VaultBundlesV1`; default max
  approval is forbidden.
- The signed share owner must be the submitting account, and the signed spender must be the
  registered contract selected for the prepared chain.
- Token signatures bind the submitting owner, pulled asset, spender, gross amount, nonce, and
  deadline exactly.
- Native funding cannot carry a token permit, and no signature may be silently discarded.
- Removed routing parameters must not remain structurally accepted and ignored.
- Connected-account validation reduces `userAddress` misrouting risk, but public-client builders
  cannot eliminate it; documentation and migration guidance are part of the safety boundary.
- The contract leaves a maximum asset allowance from itself to the vault by design and holds no
  balance between transactions.
- Token compatibility inherits the vault and contract assumptions around approval behavior.

## Dependencies

- The final reviewed `morpho-org/bundles` contract revision, ABI, deployments, and contract audit.
- The accepted Blue bundles and vault-exit TIB decisions referenced above.
- Published deprecation runways required before the breaking SDK and WDK releases.
- Address-registry availability on every supported chain.
- Major-release migration guides, dependent-package audit, changesets, and the required SDK security
  audit with a public report.

These are product, protocol, and release dependencies. The decision is not coupled to a particular
implementation order.

## Open Questions

1. Accept the loss of the migration source-leg price floor, or require applications to gate
   submission on a finalized simulation while clearly labeling it as preview-only?
2. Confirm that gross contract amounts remain the primary SDK input, with exact gross-up available
   to net-first applications.
3. For asset-based exits, is the slippage-widened exact share cap preferred over authorizing the
   full share balance?
4. Who owns confirming that every gated Vault V2 deployment admits `VaultBundlesV1` on both entry
   and exit before release?
5. Does the Aave V3-to-Vault V2 flow remain on its existing route until a compatible fixed contract
   exists, or is it removed?
6. Is opportunistic connected-account validation sufficient, or should a future decision require
   builder and submitter identity and intentionally retire offline/proposal-building patterns?

## References

- [VaultBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/VaultBundlesV1.sol)
- [IVaultBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/interfaces/IVaultBundlesV1.sol)
- [TokenLib at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/libraries/TokenLib.sol)
- [Bundles repository README](https://github.com/morpho-org/bundles/blob/main/README.md)
- [Blue and vault bundles audit — Blackthorn, 2026-08-07](https://github.com/morpho-org/bundles/blob/main/audits/2026-08-07-blue-vaults-bundles-blackthorn.pdf)
- [Permit2 SignatureTransfer](https://docs.uniswap.org/contracts/permit2/reference/signature-transfer)
- [Permit2 AllowanceTransfer](https://docs.uniswap.org/contracts/permit2/reference/allowance-transfer)
- [TIB-2026-06-03 — Midnight ActionOutput interface](./TIB-2026-06-03-midnight-action-output-interface.md)
- [TIB-2026-07-27 — VaultExitBundlesV1 in-kind redemption](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)
- [TIB-2026-08-25 — BlueBundlesV1 SDK action flows](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [Transaction Flow Migration plan](https://app.notion.com/p/morpho-labs/Transaction-Flow-Migration-3a4d69939e6d81c69393dc649d2f4d77)
