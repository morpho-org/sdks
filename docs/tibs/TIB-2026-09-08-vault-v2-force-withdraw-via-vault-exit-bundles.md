# TIB-2026-09-08: Vault V2 force withdraw via VaultExitBundlesV1

| Field      | Value                |
| ---------- | -------------------- |
| **Date**   | 2026-09-08           |
| **Author** | @foulques            |
| **Scope**  | `morpho-sdk` 6.0.0   |

## Context

[`TIB-2026-07-27`](./TIB-2026-07-27-vault-exit-in-kind-redemption.md) integrated two of
`VaultExitBundlesV1`'s three entry points and explicitly deferred the third —
`vaultExitBundlesV1ForceWithdrawVaultV2` — to its own TIB. This is that TIB, and it also records
why the SDK's existing `MorphoVaultV2.forceWithdraw` — a `VaultV2.multicall` of caller-supplied
`forceDeallocate` calls followed by a `withdraw` — is replaced rather than kept alongside it.

The multicall path pushes three problems onto every consumer:

1. **No coverage validation.** The SDK checks only that `deallocations` is non-empty and each amount
   positive. It never verifies the deallocated total covers the withdraw, so an under-covered plan
   dies on-chain with a raw `panic 0x32`, no custom error.
2. **No slippage bound at all.** A share-price drop (bad debt), a penalty increase, or liquidity
   leaving the market between build and inclusion all execute silently at worse terms.
3. **The caller plans the exit.** Every integrator reimplements the same deallocation planner, and
   each reimplementation is a place to be wrong about an amount the user cannot verify.

`vaultExitBundlesV1ForceWithdrawVaultV2` addresses the last two problems on-chain and the first at
the SDK boundary. On-chain it plans the exit itself — computing its own deallocations by walking the
adapter's market list, withdrawing everything the vault can pay without a penalty (idle assets plus
the liquidity reachable through the vault's liquidity adapter) before the penalised remainder — and
enforces a realized-exit-share-price bound against `minSharePriceE27` (problems 3 and 2). Coverage
(problem 1) it does **not** close: an exit the adapter's markets cannot cover still reaches the
contract's unbounded loop and reverts with a raw `panic 0x32`. This decision closes that at the SDK
boundary, by pre-flighting coverage against the vault snapshot and rejecting before submission. In
every case the caller supplies an amount, not a plan. The contract is already vendored, deployed on
the 13 chains where `bundles.vaultExitBundlesV1` is registered, and carries the same two audits as
the in-kind entry points — all shipped by the in-kind TIB, so this decision adds no ABI, address, or
dependency.

## Goals / Non-Goals

**Goals**

- Replace `vaultV2ForceWithdraw` and `MorphoVaultV2.forceWithdraw` with thin wrappers over
  `vaultExitBundlesV1ForceWithdrawVaultV2`, following the Client → Entity → Action layering and the
  lazy `{ getRequirements, buildTx }` shape the in-kind handles established.
- Turn the contract's one unbounded force-deallocation loop from an opaque `panic 0x32` into a named
  pre-flight rejection computed from the `getData()` snapshot with zero extra RPC.
- Derive a correct `minSharePriceE27` in the SDK — a bound the caller cannot reasonably compute by
  hand, and that a naive construction gets wrong in the direction that reverts every call.
- Keep `exitAssets` a 1:1, penalty-inclusive passthrough of the contract parameter, matching
  `inKindRedeem`, and ship `previewVaultV2ForceWithdraw` so frontends can quote the gross/net split.
- Bound the newly required vault-share allowance rather than granting an unlimited one.

**Non-Goals**

- **`forceRedeem` is untouched.** It stays on `VaultV2.multicall`, keeping `encodeForceDeallocateCall`,
  the `Deallocation` type, and `EmptyDeallocationsError`. A full exit is naturally
  share-denominated, and the contract has no shares or `max` mode; inverting the share price *and*
  the penalty to reach an `exitAssets` that redeems exactly a share balance is the arithmetic this
  decision removes, not adds. It is also the migration target for the vault shapes force withdraw
  can no longer serve.
- **No net-denominated amount mode.** `exitAssets` is gross, not the net payout (see
  [Rejected alternatives](#rejected-alternatives)).
- **No share-sufficiency validation**, **no gate preflighting** — both carried over from the in-kind
  TIB, for the same reasons. New here: the vault's `receiveAssetsGate` must now allow
  VaultExitBundlesV1, a precondition the multicall path never had.
- No new runtime dependency, ABI, or address slot. The `morpho-sdk`-major dependent audit and its
  outcome are recorded in [Breaking Changes & Migration](#breaking-changes--migration), not waived.

## Current Solution

`MorphoVaultV2.forceWithdraw` returns a synchronous `{ buildTx }` handle that encodes
`VaultV2.multicall([...forceDeallocate, withdraw])` from a caller-supplied `readonly Deallocation[]`,
validating only the chain id. `tx.to` is the vault, and no allowance is needed because the vault
burns `msg.sender`'s own shares. Every guarantee this decision needs — the vendored ABI, the 13
addresses, the shares-permit reshaping, Vault V2's two-field EIP-712 domain, and
`vaultExitBundlesV1` on both spender allowlists — already exists from the in-kind work.

## Decision

`MorphoVaultV2.forceWithdraw` and the pure `vaultV2ForceWithdraw` action encode the standalone
`vaultExitBundlesV1ForceWithdrawVaultV2` periphery call instead of a `VaultV2.multicall` of
caller-supplied `forceDeallocate` calls. The contract computes its own deallocations, withdraws the
vault's idle and liquidity-adapter assets penalty-free before the penalised remainder, and bounds
the realized exit share price. The SDK supplies an amount, pre-flights the exit's coverage against
the vault snapshot, derives both the price bound and the required share allowance, and validates the
periphery's preconditions before submission. `forceRedeem` is untouched and stays on the vault
multicall, retaining the multi-adapter and legacy-adapter shapes force withdraw can no longer serve.

## Public Interface

**Action** — `vaultV2ForceWithdraw`, pure and synchronous, `to` resolved from
`getChainAddress(chainId, "bundles.vaultExitBundlesV1")`, `value` always `0n`:

```ts
vaultV2ForceWithdraw({
  vault: { chainId, address },
  args: {
    adapter, exitAssets, minSharePriceE27, userAddress, deadline,
    referralFeePct?, referralFeeRecipient?, requirementSignature?,
  },
  metadata?,
}): Readonly<Transaction<VaultV2ForceWithdrawAction>>
```

`VaultV2ForceWithdrawAction.args` is reshaped — `deallocations` and `withdraw` are removed; `adapter`,
`exitAssets`, `minSharePriceE27`, `referralFeePct`, `referralFeeRecipient`, and `deadline` are added.
The `"vaultV2ForceWithdraw"` discriminant is unchanged.

**Entity** — `MorphoVaultV2.forceWithdraw` returns an `ActionOutput` instead of a `{ buildTx }`
handle; `buildTx` stays synchronous, only `getRequirements()` is async:

```ts
forceWithdraw(params: {
  exitAssets: bigint;
  vaultData: AccrualVaultV2;          // required
  userAddress: Address;
  adapter?: Address;                  // defaults to the vault's sole adapter
  deadline?: bigint;                  // defaults to now + 2h
  slippageTolerance?: bigint;         // defaults to DEFAULT_SLIPPAGE_TOLERANCE; above MAX_SLIPPAGE_TOLERANCE is rejected
  minSharePriceE27?: bigint;          // overrides the derived bound; must be > 0
  referralFeePct?: bigint;            // WAD-scaled, [0, WAD)
  referralFeeRecipient?: Address;
}): ActionOutput<VaultV2ForceWithdrawAction, readonly RequirementSignature[], undefined>
```

**Preview** — `previewVaultV2ForceWithdraw(vaultData, params)` returns a pure, RPC-free
`VaultV2ForceWithdrawPreview` — `maxExitAssets`, `exitAssets`, `remainingExitAssets`,
`assetsToWithdraw`, `assetsToDeallocate`, `penaltyAssets`, `referralFeeAssets`, and `netAssets` — so
a frontend can quote the gross/net split without baking it into calldata.

**Pure planning core** — `resolveVaultV2ForceWithdrawEligibility`, `computeVaultV2ForceWithdrawPlan`,
`computeVaultV2ForceWithdrawSharesBurnt`, and `computeMinForceWithdrawSharePrice`, plus the
`VaultV2ForceWithdrawEligibility` and `VaultV2ForceWithdrawPlan` types, are exported as the
deterministic core the entity, preview, and action share.

**Errors.** New: `VaultV2ForceWithdrawCoverageError` (carrying `required`, `covered`,
`maxExitAssets`), `VaultV2ForceWithdrawZeroWithdrawalError`, `VaultV2ForceWithdrawZeroSharePriceError`,
`VaultV2UnsupportedLiquidityAdapterError`, `VaultV2UndecodableLiquidityDataError`, and the shared
`MissingReferralFeeRecipientError` (carrying the offending `referralFeePct`).
`VaultV2SingleAdapterRequiredError` and `VaultV2UnsupportedExitAdapterError` are the canonical names
for the checks the in-kind path introduced as `InKindRedeemRequiresSingleAdapterError` and
`UnsupportedInKindAdapterError`, which stay as `@deprecated` aliases with `instanceof` preserved.

## Behavior

- **`exitAssets` is a gross debit, not a net payout.** The user is debited roughly `exitAssets`
  worth of shares and receives `assetsToWithdraw + floor((exitAssets − assetsToWithdraw) · WAD /
  (WAD + penalty))` minus the referral fee; the gap is the force-deallocation penalty and the fee.
  `previewVaultV2ForceWithdraw` quotes the split.
- **If the adapter's markets cannot release the required deallocation, the exit is rejected before
  submission** with `VaultV2ForceWithdrawCoverageError`, whose `maxExitAssets` is the largest
  penalty-inclusive `exitAssets` the current snapshot supports — never left to the contract's
  unbounded loop and its `panic 0x32`. `maxExitAssets` is `0` when the snapshot has no exitable
  capacity, never a non-actionable `1`.
- **If a dust `exitAssets` would withdraw nothing while still consuming the permit**, it is rejected
  with `VaultV2ForceWithdrawZeroWithdrawalError`; if a collapsed share price would make the realized
  price round down to `0` — which the contract reads as "no bound" — it is rejected with
  `VaultV2ForceWithdrawZeroSharePriceError`.
- **`minSharePriceE27` defaults to a bound derived from the vault snapshot and `slippageTolerance`.**
  Because the penalty is debited but never withdrawn, the realized exit price sits structurally below
  the vault share price, so the default is derived from the plan, not from `vaultData` alone; its
  denominator is accrued to execution time so a stale, fee-bearing vault is not spuriously reverted.
  A supplied override must be `> 0` on the entity (`NonPositiveInputError` otherwise) — the contract
  reads `0` as "no bound", so the high-level path cannot silently opt out of the guard. The low-level
  action accepts `0n` to disable it. `slippageTolerance` defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and
  a value above `MAX_SLIPPAGE_TOLERANCE` is rejected with `ExcessiveSlippageToleranceError`.
- **The required vault-share allowance is bounded**, not unlimited — sized to the largest burn the
  on-chain price check can accept, so it also covers the within-tolerance price drop the bound
  deliberately permits, and saturated at `maxUint256` rather than emitting a requirement the approval
  encoder can never satisfy. `getRequirements()` returns `[]` when the existing allowance already
  covers that burn, otherwise a bounded `encodeVaultSharesPermit` requirement (`supportSignature`) or
  an `encodeErc20Approval` call requirement.
- **The referral fee sits outside `minSharePriceE27`.** `referralFeePct` must be in `[0, WAD)`
  (`NegativeInputError` / `InputExceedsMaxError`), and a positive percentage requires a non-zero
  recipient (`MissingReferralFeeRecipientError`); the contract deducts the fee *after* the price
  check, so the SDK documents that the bound does not cover it rather than pretending otherwise.
- **`getRequirements()` reads only `allowance` and `nonces`.** Unlike in-kind redemption it never
  supplies into Blue, so there is no callback whose repaying `transferFrom` could outrun Blue's
  physical balance and no Blue token-balance read is needed.
- **The vault must have exactly one `MorphoMarketV1AdapterV2` and route liquidity through that same
  adapter or none.** A different adapter count, a legacy positions-based adapter, a foreign liquidity
  adapter, or `liquidityData` that does not decode as `MarketParams` is rejected at handle creation
  with the matching typed error, rather than the contract reverting opaquely on a cast or decode.
- **The builder must be the transaction sender**, and smart-contract wallets must take the approve
  path: the contract binds the permit owner, the burned shares, and the payout recipient to
  `msg.sender`, and `VaultV2.permit` is `ecrecover`-only. Only one VaultExitBundlesV1 call can
  execute per transaction (its `initiator` guard is transient and never cleared).

## Invariants

- **Coverage.** An exit whose required deallocation exceeds what the adapter's markets can release,
  as computed from the caller-supplied snapshot, is rejected before submission. The coverage verdict
  is order-independent: the contract's loop visits every market once taking `min(available,
  remaining)`, so total capacity does not depend on the storage order the loop happens to see.
- **Slippage bound is always live on the entity path.** A `forceWithdraw` handle produced by the
  entity always encodes a strictly positive `minSharePriceE27` — a derived default or a positive
  override — so an exit can never be submitted with the on-chain price check disabled. The derived
  default is a faithful lower bound on the payout over an upper bound on the burn, so it never
  rejects a snapshot that executes unchanged, while `slippageTolerance` absorbs benign drift.
- **The allowance is bounded, never unlimited**, and covers every share the on-chain price check can
  accept — including the penalty leg's separate burn and the within-tolerance price drop — so a
  faithful exit never reverts on allowance and never leaves a standing unlimited approval.
- **`exitAssets` maps 1:1 to the contract parameter and is penalty-inclusive**, consistent with
  `inKindRedeem`; the SDK never bakes a net-denominated quote into calldata.
- **`forceRedeem` and its multicall surface are unchanged**, so the multi-adapter and legacy-adapter
  shapes remain reachable through it.
- **The deprecated error aliases preserve `instanceof`** for both the old and canonical names.
- **Assumptions the decision depends on** (bounded, not defended against): vault idle balance,
  penalty, adapter position, and market liquidity can drift between snapshot and inclusion — bounded
  by the penalty's 2% cap and timelock and by timelocked market removals; the `receiveAssetsGate`
  must allow VaultExitBundlesV1; share sufficiency and both Vault V2 gate families are enforced only
  on-chain.

## Rejected alternatives

- **Keep the net-denominated amount and invert it in the SDK.** Preserving today's net
  `withdraw.amount` means solving for `exitAssets` against the snapshot. Rejected: the inversion is
  exact only against the snapshot, so if `withdrawable` or `penalty` moves, the already-fixed
  calldata silently delivers *less* than the number the caller typed. The gross convention cannot
  mislead that way and matches `inKindRedeem`.
- **Keep the multicall builder alongside the bundle one.** Rejected: two force-withdraw surfaces
  means two planners, and the multicall one is exactly the unvalidated, unbounded planner this
  decision removes; leaving it exported invites new call sites onto it. Its unique capability —
  multi-adapter and legacy-adapter vaults — is retained by `forceRedeem`.
- **Replay the contract's market order instead of summing capacity.** Rejected: it is *less*
  accurate. The snapshot order is stale by the time the loop runs (the prefetch happens after the
  penalty-free withdraw, and a drained market is removed by swap-and-pop), while the total is
  order-invariant. Replaying would add a failure mode in exchange for information coverage does not
  need.
- **Let the caller supply `minSharePriceE27` with no SDK default.** Rejected: an unset bound is `0`,
  i.e. no protection, and that is what every caller would ship because the correct value is
  non-obvious (it is *not* the vault share price). The derived bound stays overridable for callers
  who genuinely want out.
- **Hide the referral fee.** Rejected: the parameters exist on a deployed, audited contract;
  omitting them pushes integrators who need them off the SDK. Exposing them with validation plus an
  explicit note that the fee sits outside `minSharePriceE27` is more honest.

## Breaking Changes & Migration

Major bump on `@morpho-org/morpho-sdk`. It adds no ABI, address, or dependency — those shipped with
the in-kind TIB — but a `morpho-sdk` major still requires the downstream dependent audit
(`AGENTS.md` §4, §7), which this decision records rather than waives. The maintained dependents are
`wdk-protocol-lending-morpho-evm` (direct runtime dependency, `workspace:^`) and `liquidity-sdk-viem`
(peer dependency, range `^5.4.0 || ^6.0.0`). Audit outcome: neither consumes the reshaped
`forceWithdraw` surface, so this change forces no additional migration on either.
`wdk-protocol-lending-morpho-evm` already takes its own `2.0.0` major in this same v6 line, driven by
the BlueBundlesV1 route replacement ([`TIB-2026-08-25`](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)),
not by this change; `liquidity-sdk-viem`'s peer range already admits `^6.0.0` and needs no update. So
this decision contributes no dependent bump or peer-range change of its own beyond the `morpho-sdk`
v6 major it is part of. Migration is documented in `MIGRATION-v5-to-v6.md`.

- `MorphoVaultV2.forceWithdraw` takes `{ exitAssets, vaultData, userAddress, adapter?, deadline?,
  slippageTolerance?, minSharePriceE27?, referralFeePct?, referralFeeRecipient? }` instead of
  `{ deallocations, withdraw: { amount }, userAddress }`; `vaultData` is now required.
- It returns an `ActionOutput` (`{ getRequirements(), buildTx(signatures?) }`) instead of
  `{ buildTx() }`. Callers must resolve `getRequirements()` and authorize vault shares to
  VaultExitBundlesV1 (allowance or ERC-2612 permit) — the multicall path needed none because the
  vault burned `msg.sender`'s own shares.
- `exitAssets` is penalty-inclusive where `withdraw.amount` was the net payout; quote the split with
  `previewVaultV2ForceWithdraw`. `tx.to` is now VaultExitBundlesV1, not the vault.
- `VaultV2ForceWithdrawAction.args` is reshaped (see [Public Interface](#public-interface)); the
  caller no longer chooses markets or their order; exits can no longer be batched into one
  transaction.
- Multi-adapter vaults and vaults on a legacy positions-based `MorphoMarketV1Adapter` or a
  `MorphoVaultV1Adapter` lose `forceWithdraw` and must fall back to `forceRedeem` or a plain
  `withdraw`.
- Error renames ship as deprecated aliases (`instanceof` preserved). Shared with the BlueBundlesV1
  major landing in the same release: `MissingReferralFeeRecipientError` gains its `referralFeePct`
  argument, and on the exit methods a non-positive `deadline` now throws `NonPositiveInputError`
  (was `ExpiredDeadlineError`) while an out-of-`uint256` `deadline` throws `InputExceedsMaxError`.

## Acceptance Criteria

- [ ] An `exitAssets` of `maxExitAssets + 1` is rejected with `VaultV2ForceWithdrawCoverageError`
      before any RPC — a test that fails if the coverage guard is removed.
- [ ] A `forceWithdraw` handle from the entity always carries a positive `minSharePriceE27`: the
      derived default accepts a faithful snapshot (no spurious `SlippageExceeded`, including on a
      stale fee-bearing vault), and a `0n` override is rejected with `NonPositiveInputError` — tests
      that fail if either half of the slippage invariant is removed.
- [ ] The share-allowance requirement is bounded (never `maxUint256` except the deliberate
      saturation), covers the penalty leg and the within-tolerance price drop, and returns `[]` when
      a sufficient allowance already exists.
- [ ] `previewVaultV2ForceWithdraw` and the encoded exit agree that `exitAssets` is penalty-inclusive
      and that the net payout excludes the penalty and the referral fee.
- [ ] Referral-fee validation rejects `referralFeePct < 0`, `>= WAD`, and a positive pct with a
      missing or zero recipient, each with its typed error.
- [ ] The single-adapter, adapter-type, foreign-liquidity-adapter, and undecodable-`liquidityData`
      guards each throw their distinct typed error at handle creation.
- [ ] `instanceof` holds for both the canonical and deprecated names of the two renamed errors.
- [ ] `forceRedeem` behavior and its multi-adapter / legacy-adapter fork coverage are unchanged.
- [ ] A fork exit leaves a zero VaultExitBundlesV1 balance (payout and fee transferred in the same
      call), and at least one fork case exercises the `supportSignature: true` permit end-to-end.

## Consequences

- **Vault-state drift, share sufficiency, and both Vault V2 gate families stay unclosable and
  undefended**, documented on the entity method as residuals — the same list as the in-kind TIB. The
  on-chain `panic 0x32` correspondence is not fork-asserted (an `exitAssets` above the whole position
  reverts on shares or allowance before the contract's loop); the SDK-side coverage rejection is.
- **A `max`-mode force withdraw is deferred.** It would need the shares → assets → penalty inversion
  this decision declined; if ever wanted, `forceRedeem` is its natural home, since a full exit is
  share-denominated.
- **A multi-tier preview is deferred.** `previewVaultV2ForceWithdraw` caps at `maxExitAssets` and
  re-plans; a per-tier preview (penalty-free versus penalised) would let a UI show them separately.

## References

- [`VaultExitBundlesV1.sol`](https://github.com/morpho-org/bundles/blob/main/src/vault-exit/VaultExitBundlesV1.sol) — the contract
- [`VaultV2ExitBundlesTest.sol`](https://github.com/morpho-org/bundles/blob/main/test/VaultV2ExitBundlesTest.sol) — the contract's Vault V2 exit test suite, including its own realized-price-bound coverage
- [`vault-v2/src/VaultV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol) — `exit`, `forceDeallocate`, `previewWithdraw`, the gates
- [`TIB-2026-07-27`](./TIB-2026-07-27-vault-exit-in-kind-redemption.md) — the in-kind decision this extends, and the source of the permit, allowance, and gate reasoning
