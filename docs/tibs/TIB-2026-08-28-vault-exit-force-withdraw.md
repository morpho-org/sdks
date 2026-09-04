# TIB-2026-08-28: VaultExitBundlesV1 force withdraw for Vault V2

| Field      | Value                                    |
| ---------- | ---------------------------------------- |
| **Status** | Accepted                                 |
| **Date**   | 2026-08-28                               |
| **Author** | @foulques                                |
| **Scope**  | Packages: `morpho-sdk`                   |

---

## Context

[`TIB-2026-07-27`](./TIB-2026-07-27-vault-exit-in-kind-redemption.md) integrated two of
`VaultExitBundlesV1`'s three entry points and explicitly deferred the third:

> **`vaultExitBundlesV1ForceWithdrawVaultV2` is out of scope** and gets its own TIB.

This is that TIB. It also records why the SDK's existing `MorphoVaultV2.forceWithdraw` — a
`VaultV2.multicall` of caller-supplied `forceDeallocate` calls followed by a `withdraw` — is replaced
rather than kept alongside.

The multicall path has three problems, all of them the caller's to absorb today:

1. **No coverage validation.** The SDK checks only that `deallocations` is non-empty and each amount
   positive. It never verifies the deallocated total covers the withdraw, never verifies the
   adapter holds those positions, and never verifies the underlying markets have the liquidity to
   release them. `forceRedeem`'s own JSDoc pushes the arithmetic onto the caller.
2. **No slippage bound.** A share-price drop (bad debt), a penalty increase, or liquidity moving out
   of the market between build and inclusion all execute silently at the worse terms.
3. **The caller plans the exit.** Every consumer reimplements the same deallocation planner —
   `vvrm`'s `deallocation.ts` and `useVaultV2WithdrawLogic.ts` are that planner — and each
   reimplementation is a place to be wrong about an amount the user cannot verify.

[`vaultExitBundlesV1ForceWithdrawVaultV2`](https://github.com/morpho-org/bundles/blob/main/src/vault-exit/VaultExitBundlesV1.sol)
closes all three on-chain. It withdraws everything the vault can pay without a penalty (idle assets
plus the liquidity reachable through the vault's liquidity adapter), force-deallocates the remainder
by walking the adapter's own market list, and **checks the realized exit share price** against
`minSharePriceE27`. The caller supplies an amount, not a plan.

The contract carries the same two audits as the in-kind entry points (blackthorn, trustsec,
2026-07-06) and is already deployed on the 13 chains where `bundles.vaultExitBundlesV1` is
registered.

## Goals / Non-Goals

**Goals**

- Replace `vaultV2ForceWithdraw` and `MorphoVaultV2.forceWithdraw` with thin wrappers over
  `vaultExitBundlesV1ForceWithdrawVaultV2`, following the Client → Entity → Action layering and the
  lazy `{ getRequirements, buildTx }` shape the in-kind handles established.
- **Eliminate the contract's one unbounded loop as a failure mode.** Its force-deallocation loop
  indexes a pre-fetched market array without a bound, so an under-covered request dies with a raw
  `panic 0x32`. Simulate the loop from the `getData()` snapshot and reject before submission.
- **Derive `minSharePriceE27` in the SDK.** A naive bound built from the vault share price would
  reject every penalised exit; the correct bound has to be built from the plan itself.
- Keep `exitAssets` a 1:1 passthrough of the contract parameter, penalty-inclusive, matching
  `inKindRedeem`. Ship `previewVaultV2ForceWithdraw` so frontends can quote the gross/net split.
- Bound the authorized vault-share allowance rather than granting an unlimited one.
- Ship with JSDoc, colocated unit tests, mock-client entity tests, Anvil fork tests, and a
  semver-relevant changeset.

**Non-Goals**

- **`forceRedeem` is untouched.** It stays on `VaultV2.multicall`. The contract has no shares mode
  and no `max` mode, and a full exit is naturally share-denominated — inverting the share price *and*
  the penalty to reach an `exitAssets` that redeems exactly the user's balance is the kind of
  arithmetic this TIB is trying to remove, not add. `encodeForceDeallocateCall`, the `Deallocation`
  type, and `EmptyDeallocationsError` therefore all stay.
- **No net-denominated amount mode.** See [Considered Alternatives §1](#alternative-1-keep-the-net-denominated-amount-and-invert-it-in-the-sdk).
- **No share-sufficiency validation.** Carried over from the in-kind TIB: a sufficient allowance
  settles *authorization*, not *balance*. Sizing `exitAssets` against
  `vault.previewRedeem(sharesHeld)` — with a small buffer, since per-leg penalty and share rounding
  can burn marginally more than a boundary-exact `exitAssets` implies — is the caller's job.
- **No gate preflighting.** Also carried over, with one addition specific to this entry point: the
  vault's `receiveAssetsGate` must now allow VaultExitBundlesV1, which it did not have to before.
- No new runtime dependencies, no new ABI, no new address slot — the in-kind TIB shipped all three.

## Current Solution

`src/actions/vaultV2/forceWithdraw.ts` encodes `VaultV2.multicall([...forceDeallocate, withdraw])`
from a caller-supplied `readonly Deallocation[]`. `MorphoVaultV2.forceWithdraw` is a synchronous
`{ buildTx }` handle that validates only the chain id. `tx.to` is the vault, and no allowance is
needed because the vault burns `msg.sender`'s own shares.

The plumbing this TIB needs already exists, all of it from the in-kind work:

| Already in place                                              | Location                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `vaultExitBundlesV1ForceWithdrawVaultV2` in the vendored ABI  | `src/abis.ts`                                             |
| Addresses on 13 chains                                        | `packages/morpho-ts/src/addresses.ts`                     |
| `Permit` struct reshaping, empty sentinel, EIP-2098 handling  | `src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts` |
| Vault V2's two-field EIP-712 permit domain                    | `src/actions/requirements/encode/encodeVaultSharesPermit.ts` |
| `vaultExitBundlesV1` on both spender allowlists               | `src/helpers/validateRequirementSpender.ts`, `encodeErc20Approval.ts` |

## Proposed Solution

### What the contract does

```solidity
require(initiator == address(0)); initiator = msg.sender;            // AlreadyInitiated
require(block.timestamp <= deadline);                                // DeadlinePassed
require(IVaultV2(vault).adaptersLength() == 1);                      // InvalidAdaptersLength
require(IVaultV2(vault).isAdapter(adapter));                         // AdapterNotPartOfVault
require(IMorphoMarketV1AdapterV2(adapter).morpho() == BLUE);          // MorphoMismatch
require(referralFeePct < WAD);                                       // PctExceeded
TokenLib.submitPermit(vault, sharesPermit);
uint256 sharesBefore = IERC20(vault).balanceOf(msg.sender);

withdrawableAssets = IERC20(asset).balanceOf(vault)
  + (liquidityAdapter != address(0)
       ? min(liquidityAdapterAssets, totalSupplyAssets - totalBorrowAssets)
       : 0);
assetsToWithdraw  = min(exitAssets, withdrawableAssets);
IVaultV2(vault).withdraw(assetsToWithdraw, address(this), msg.sender);   // no penalty

marketIds = prefetch(adapter.marketIds);   // the loop can drop a drained market from the list
penalty            = IVaultV2(vault).forceDeallocatePenalty(adapter);
assetsToDeallocate = (exitAssets - assetsToWithdraw).mulDivDown(WAD, WAD + penalty);

for (uint256 i; remainingAssets > 0; i++) {              // <- unbounded index
    available = min(adapterAssets(marketIds[i]), marketLiquidity(marketIds[i]));
    assets    = min(available, remainingAssets);
    remainingAssets -= assets;
    if (assets > 0) IVaultV2(vault).forceDeallocate(adapter, marketParams, assets, msg.sender);
}
IVaultV2(vault).withdraw(assetsToDeallocate, address(this), msg.sender);

withdrawn = assetsToWithdraw + assetsToDeallocate;
totalSharesBurnt = sharesBefore - IERC20(vault).balanceOf(msg.sender);
require(totalSharesBurnt == 0
     || withdrawn.mulDivDown(1e27, totalSharesBurnt) >= minSharePriceE27);   // SlippageExceeded

referralFeeAssets = withdrawn.mulDivDown(referralFeePct, WAD);
if (referralFeeAssets > 0) safeTransfer(asset, referralFeeRecipient, referralFeeAssets);
safeTransfer(asset, msg.sender, withdrawn - referralFeeAssets);
```

**The load-bearing consequence:** the user is debited roughly `exitAssets` worth of shares but
receives `assetsToWithdraw + assetsToDeallocate ≤ exitAssets`. The gap is the force-deallocation
penalty — which `VaultV2.forceDeallocate` charges as `mulDivUp(assets, penalty, WAD)` burned from
`onBehalf` while the assets stay in the vault — and then the referral fee. `exitAssets` is a **gross
debit**, not a net payout, exactly as in `inKindRedeem`.

Three further facts from `vault-v2/src/VaultV2.sol` that shape the SDK's checks:

- `forceDeallocate`'s penalty leg calls `withdraw(penaltyAssets, address(this), onBehalf)`, so the
  penalty **also consumes the bundle's share allowance**. An allowance sized only for the asset legs
  underflows.
- `exit()` requires `canSendShares(onBehalf)` **and** `canReceiveAssets(receiver)`. The receiver is
  now VaultExitBundlesV1, so the vault's `receiveAssetsGate` must allow it — a precondition the
  multicall path never had, because the receiver was the user.
- `previewWithdraw` rounds shares **up**, and the exit splits the burn across up to
  `penaltyLegs + 2` separate withdrawals, so the total burn exceeds a single preview of the summed
  amount by up to one share per *additional* leg that moves a positive amount. A zero-amount leg
  burns `toShares(0, "Up") == 0` and rounds nothing.

`setLiquidityAdapterAndData` does not check `isAdapter`; combined with `adaptersLength() == 1`, the
only liquidity configurations the contract can actually resolve are unset or the vault's sole
adapter.

### Public surface

**Action** — `src/actions/vaultV2/forceWithdraw.ts`, pure and synchronous, `to` resolved from
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

**Entity** — `MorphoVaultV2.forceWithdraw` returns
`ActionOutput<VaultV2ForceWithdrawAction, readonly RequirementSignature[], undefined>`:

```ts
forceWithdraw({
  exitAssets, vaultData, userAddress,
  adapter?, deadline?, slippageTolerance?, minSharePriceE27?,
  referralFeePct?, referralFeeRecipient?,
})
```

`buildTx` stays synchronous, per root `AGENTS.md` §1 and the precedent set by the in-kind TIB's
Considered Alternatives §5. Only `getRequirements()` is async.

**Helpers** — three new pure exports, deliberately split so the numeric core has exactly one
implementation:

- `resolveVaultV2ForceWithdrawEligibility(vaultData, adapter?)` returns a **discriminated union**
  (`"eligible" | "adapterCount" | "adapterMismatch" | "unsupportedAdapter" |
  "unsupportedLiquidityAdapter" | "undecodableLiquidityData"`). The entity maps each failing tag to a
  typed error; the preview maps them all to `undefined`. Same source of truth, different failure
  semantics — which is the whole reason the split exists rather than duplicating the four
  preconditions.
- `computeVaultV2ForceWithdrawPlan({ vaultData, adapter, liquidityMarketId, exitAssets, timestamp })`
  returns every amount the exit needs.
- `computeVaultV2ForceWithdrawSharesBurnt({ vaultData, deadlineVaultData, plan })` returns the share
  upper bound, accrued to `now` on both endpoints, for the denominator of the slippage bound. The
  authorized allowance is *not* this value — it is read off the price floor itself (see below), so it
  covers every burn the on-chain check can accept, including the within-tolerance price drop the floor
  permits.

Plus `computeMinForceWithdrawSharePrice` in `src/helpers/slippage.ts` alongside its siblings, and
`previewVaultV2ForceWithdraw` alongside `previewVaultV2InKindRedeem`.

### The simulation

Everything comes from the `AccrualVaultV2` snapshot the caller already fetched — `assetBalance`,
`forceDeallocatePenalties`, `liquidityAdapter`, `liquidityData`, and
`accrualAdapters[0].markets[]` (full `Market` objects, aligned 1:1 with `marketIds` by
`fetchAccrualVaultV2MorphoMarketV1AdapterV2`). **Zero extra RPC.**

```
penalty = forceDeallocatePenalties[adapter] ?? 0n
idle    = vaultData.assetBalance

liquidityMarketId  = liquidityAdapter === 0 ? undefined : MarketParams.fromHex(liquidityData).id
available(id)      = min(accrued(id).toSupplyAssets(supplyShares[id]), accrued(id).liquidity)
withdrawableAssets = idle + (liquidityMarketId ? available(liquidityMarketId) : 0n)
assetsToWithdraw   = min(exitAssets, withdrawableAssets)
assetsToDeallocate = mulDivDown(exitAssets - assetsToWithdraw, WAD, WAD + penalty)

// the penalty-free leg drains the liquidity market before the loop reaches it
drained            = zeroFloorSub(assetsToWithdraw, idle)
coveredAssets      = Σ available(id), minus `drained` on the liquidity market
require              coveredAssets >= assetsToDeallocate

// saturated: excludes the liquidity market outright, so the ceiling is request-independent
saturatedCovered   = Σ available(id) over id ≠ liquidityMarketId
maxExitAssets      = withdrawableAssets == 0 && saturatedCovered == 0
                       ? 0n                                             // nothing is exitable
                       : min(withdrawableAssets
                               + wMulUp(saturatedCovered + 1n, WAD + penalty) - 1n,
                             maxUint256)                                // ...and fits the ABI slot
```

`maxExitAssets` deliberately sums `saturatedCovered`, not the request-dependent `coveredAssets`: at
the ceiling the penalty-free leg always drains the liquidity market completely, so that market
contributes nothing to the force-deallocation loop, whereas a small request leaves part of it behind
and a `coveredAssets`-based ceiling would overstate the largest exit the snapshot supports.

Both bounds exist because the ceiling has to be *actionable*, not merely the exact inverse of the
coverage guard: callers cap an input field with it, and `VaultV2ForceWithdrawCoverageError` tells them
to reduce to it. At zero total capacity the inversion rounds up to `1n` at a positive penalty, and
`1n` withdraws nothing — reporting it would send a caller from a coverage error straight into
`VaultV2ForceWithdrawZeroWithdrawalError`. At the other end the gross-up can pass `uint256` on an
enormous snapshot, which the entity rejects outright, so it saturates instead.

Two decisions inside this worth recording.

**The coverage sum is order-independent, and that is not an approximation.** The contract iterates
`marketIds` in the adapter's storage order, but the loop visits *every* market taking
`min(available, remaining)` and never revisits one, so total capacity does not depend on the order.
This matters concretely: `MorphoMarketV1AdapterV2.deallocate` removes a market whose position it
zeroes, the prefetch happens *after* the penalty-free withdraw has already drained the liquidity
market, and removal is a swap-and-pop that reorders the tail. A sum is exact and immune to all of
that; an ordered replay of the snapshot would not be. This is the opposite of `inKindRedeem`, where
the caller supplies the order and V1 duplicate handling makes order safety-relevant.

**The accrued market state must be computed, not read off `maxWithdraw`.**
`AccrualVaultV2.maxWithdraw` and `AccrualVaultV2MorphoMarketV1AdapterV2.maxWithdraw` already compute
`min(toSupplyAssets(shares), market.liquidity)` — but on **un-accrued** market state, while the
contract reads `expectedMarketBalances`. Reusing them would understate capacity. Note that accrual
raises `totalSupplyAssets` and `totalBorrowAssets` by the same interest, so market *liquidity* is
invariant under accrual and only the adapter's *position* grows.

### The `minSharePriceE27` bound

This is the part a naive implementation gets wrong in the direction that reverts every call.

The realized price is `withdrawn · 1e27 / totalSharesBurnt`. Because the penalty is debited from the
position but never withdrawn, `withdrawn < exitAssets` while `totalSharesBurnt ≈ exitAssets / price`.
The realized price is therefore **structurally below** the vault share price, by roughly a factor of
`withdrawn / exitAssets`. A bound derived from `vaultData` alone rejects every penalised exit.

The bound is built from the plan, pessimistically on both sides:

```
grossDebited     = withdrawnAssets + penaltyAssets                    // penaltyAssets is an upper bound
positiveLegs     = (assetsToWithdraw > 0) + (penalty > 0 ? penaltyLegs : 0)
                   + (assetsToDeallocate > 0)                          // legs that actually round
sharesBurnt(v)   = v.toShares(grossDebited, "Up") + max(0, positiveLegs - 1)

nowVaultData     = vaultData.accrueInterest(now)                      // execution-time vault state
minSharePriceE27 = mulDivDown(withdrawnAssets, wToRay(WAD - slippageTolerance),
                              sharesBurnt(nowVaultData))              // now-accrued burn
allowance        = min(mulDivUp(exitAssets, RAY, minSharePriceE27),   // largest burn the price check accepts
                       maxUint256)                                     // ...saturated to the ABI slot
```

`withdrawnAssets` is a lower bound of the payout and `sharesBurnt` an upper bound of the burn, so a
faithful snapshot never trips the check while the tolerance absorbs benign drift.

The **price floor** accrues its denominator to `now` (execution time): the raw `lastUpdate` snapshot
underestimates the burn a stale fee-bearing vault realizes once its first withdrawal accrues pending
management fees, which lifts the floor above the faithful price and reverts a valid exit with
`SlippageExceeded`. Accruing to `now` rather than the caller-chosen `deadline` fixes that without
letting a long deadline weaken the guard — a larger denominator only lowers the floor — and
`slippageTolerance` absorbs the residual drift until inclusion.

The **allowance** is then read straight off that floor. The on-chain check accepts any exit whose
realized price stays at or above `minSharePriceE27`, so it can burn at most
`mulDivUp(exitAssets, RAY, minSharePriceE27)` shares — `withdrawn ≤ exitAssets` and
`withdrawn / burnt ≥ minSharePriceE27`. This one expression is a mechanics-independent ceiling: it
dominates the burn at every accrual endpoint *and* covers the within-tolerance price drop the floor
deliberately permits. It is saturated at `maxUint256`, because a very small accepted floor scales it
past the ABI slot: the approval encoder clamps what it emits, so an uncapped requirement would sit
permanently above any grantable allowance and `getRequirements()` would keep re-emitting the same
approval. Saturating loses nothing real — `totalSharesBurnt ≤ totalSupply ≤ maxUint256`, so the clamp
still dominates every burn that can physically occur. Sizing the allowance to the snapshot plan alone would instead revert on
allowance for exactly that permitted drop — clearest on a no-fee vault, where the accrual endpoints
collapse to the snapshot burn — silently nullifying the advertised `slippageTolerance`.

`penaltyAssets` bounds `Σ ceil(assetsᵢ·penalty/WAD)` by
`wMulUp(assetsToDeallocate, penalty) + (penaltyLegs − 1)`, using
`Σ ceil(aᵢ) ≤ ceil(Σ aᵢ) + (n − 1)`. `penaltyLegs` is the tight order-independent worst case: sort
the non-empty market capacities ascending and count how many are needed to reach
`assetsToDeallocate`. At a **zero penalty** every chunk charges exactly nothing, so the per-leg slack
is dropped entirely rather than carried as `penaltyLegs − 1`.

The dust term applies the same `Σ ceil(aᵢ) ≤ ceil(Σ aᵢ) + (n − 1)` inequality to the share burn,
generalizing the `+ 2` in the contract's own `testForceWithdrawTightPriceBound`. It counts `n` as the
legs that move a **positive** amount, not the calls the loop can make: converting `grossDebited`
already spends one ceiling, and a zero-amount leg rounds nothing. Counting calls instead would inflate
the denominator — an idle-only exit would carry two phantom shares — and because a larger denominator
lowers the floor, that silently widens the price drop the bound accepts. The effect is worst on a dust
exit, where phantom shares dominate the real burn.

**What the bound protects against**, and this is why it is worth the arithmetic:

| Drift between build and inclusion | Effect on the realized price |
| --- | --- |
| Share price drops (bad-debt realisation, fee spike) | More shares burnt for the same payout → price falls |
| `forceDeallocatePenalty` increases | More of `exitAssets` goes to the penalty → payout falls |
| Liquidity moves out of the penalty-free leg | `assetsToWithdraw` shrinks, so more of the exit is penalised → payout falls |

All three previously executed silently. The referral fee is the one thing the bound does **not**
cover: the contract deducts it after the check, on purpose, and the SDK documents that rather than
pretending otherwise.

### The validation matrix

Every `require`, every unchecked array index, and every nested call was walked once.

#### Synchronous — at handle creation, before any RPC

| On-chain failure | SDK check | Error |
| --- | --- | --- |
| every read hits the wrong chain | `client.chain?.id === this.chainId` | `ChainIdMismatchError` *(reused)* |
| every amount computed off another vault | `vaultData.address === this.vault` | `VaultAddressMismatchError` *(reused)* |
| `InvalidAdaptersLength` | `accrualAdapters.length === 1` | `VaultV2SingleAdapterRequiredError` **(canonical; `InKindRedeemRequiresSingleAdapterError` kept as a deprecated alias)** |
| `AdapterNotPartOfVault` | `adapter === accrualAdapters[0].address` | `AdapterNotPartOfVaultError` *(reused)* |
| `MorphoMismatch`, or garbage from casting the adapter to `IMorphoMarketV1AdapterV2` | `instanceof AccrualVaultV2MorphoMarketV1AdapterV2` — the factory pins Blue, so a genuine V2 adapter cannot mismatch | `VaultV2UnsupportedExitAdapterError` **(canonical; `UnsupportedInKindAdapterError` kept as a deprecated alias)** |
| `NotAdapter`, or `supplyShares` missing on the liquidity adapter | `liquidityAdapter ∈ {zeroAddress, adapter}` | `VaultV2UnsupportedLiquidityAdapterError` **(new)** |
| `abi.decode(liquidityData, MarketParams)` reverts | `MarketParams.fromHex(liquidityData)` | `VaultV2UndecodableLiquidityDataError` **(new)** — reported separately from a foreign adapter, which is the only case `VaultV2UnsupportedLiquidityAdapterError` now covers |
| **`panic 0x32`** — the loop indexes past the market list | `coveredAssets >= assetsToDeallocate` | `VaultV2ForceWithdrawCoverageError { required, covered, maxExitAssets }` **(new)** |
| silent no-op that still consumes the permit | `withdrawnAssets > 0` | `VaultV2ForceWithdrawZeroWithdrawalError` **(new)** |
| a negative fee is not an encodable `uint256` | `referralFeePct >= 0` | `NegativeInputError` *(reused)* |
| `PctExceeded` | `referralFeePct < WAD` | `InputExceedsMaxError` *(reused)* |
| `safeTransfer` to `address(0)` | `referralFeePct > 0 ⇒ recipient ≠ zeroAddress` | `MissingReferralFeeRecipientError` **(new)** |
| `DeadlinePassed` / `PermitDeadlineExpired` | `deadline > now`, at creation **and** again before `getRequirements()` reads | `ExpiredDeadlineError` *(reused)* |
| the `SlippageExceeded` guard silently passes — the contract reads `minSharePriceE27 == 0` as "no bound" | a supplied `minSharePriceE27` override is `> 0` | `NonPositiveInputError` *(reused)* |
| — | `exitAssets > 0` | `NonPositiveInputError` *(reused)* |
| — | `slippageTolerance <= MAX_SLIPPAGE_TOLERANCE` | `ExcessiveSlippageToleranceError` *(via `validateSlippageTolerance`)* |

The two canonical renames keep `instanceof` working through
`export const X = Y; export type X = Y;`, the pattern already used in `error.ts`. The old names read
wrong on a force-withdraw failure, which is the whole reason to rename them.

#### Asynchronous — in `getRequirements()`, one multicall, two reads

`allowance(user, vaultExitBundlesV1)` and `nonces(user)`. Returns `[]` when the allowance already
covers `sharesBurnt`; otherwise a bounded `encodeVaultSharesPermit` requirement when
`supportSignature` is set, or an `encodeErc20Approval` call requirement.

**No Blue token-balance read.** This is the one place force withdraw is *simpler* than in-kind
redemption: it never supplies into Morpho Blue, so there is no callback whose repaying
`transferFrom` could outrun Blue's physical balance. Market liquidity is already accounting-level in
the snapshot, and Blue always holds at least `Σ (supply − borrow)`.

#### Left to on-chain execution, documented

- `CannotReceiveAssets` / `CannotSendShares` — the receive gate may inspect the periphery's
  transient `initiator`, unset during a standalone read; the send gate is arbitrary code re-evaluated
  after every penalty burn. Neither is execution-equivalent from one read. Simulate the finalized
  transaction when gate compatibility must be known before submission.
- **Share sufficiency** — by decision, unchanged from the in-kind TIB.
- `AlreadyInitiated` — unreachable from a single EOA call, but it does mean **two bundle calls cannot
  share a transaction**: `initiator` is transient and never cleared.
- Idle balance, penalty, adapter position, and market liquidity drift — unclosable, bounded by
  timelocks (the penalty is capped at 2% and its changes are timelocked, as are market removals).

## Considered Alternatives

### Alternative 1: keep the net-denominated amount and invert it in the SDK

Today's `withdraw.amount` is the net payout. Preserving that means solving for `exitAssets`:
`withdrawable + ceil((amount − withdrawable)·(WAD + penalty) / WAD)`, which is an exact inverse of
the contract's floor division. Existing call sites would keep their meaning.

**Why rejected:** the inversion is exact only against the snapshot. If `withdrawable` or `penalty`
moves, `exitAssets` is already fixed in calldata and the user silently receives *less* than the
number they typed — the SDK would have promised an amount the transaction does not deliver. The
gross convention cannot mislead that way: `exitAssets` is what leaves the position, and
`previewVaultV2ForceWithdraw` quotes the payout without baking a stale quote into calldata. It also
matches `inKindRedeem`, so the two exit paths do not disagree about what their amount means.

### Alternative 2: keep the multicall builder alongside the bundle one

Ship the bundle path under a new name and deprecate the old builder over a minor.

**Why rejected:** two force-withdraw surfaces means two planners, and the multicall one is precisely
the unvalidated, unbounded planner this TIB exists to remove. Leaving it exported invites new call
sites onto it. The capability it uniquely had — force-deallocating from a `MorphoVaultV1Adapter` or a
multi-adapter vault — is retained by `forceRedeem`, which still covers those shapes on the multicall
and keeps its fork coverage for them.

### Alternative 3: replay the contract's market order instead of summing capacity

Simulate the loop index by index against `adapter.marketIds`.

**Why rejected:** it is *less* accurate, not more. The snapshot order is stale by the time the loop
runs — the prefetch happens after the penalty-free withdraw, and swap-and-pop removal reorders the
tail — while the total is order-invariant. Replaying would add a failure mode (disagreeing with the
live order) in exchange for information the coverage verdict does not need.

### Alternative 4: let the caller supply `minSharePriceE27`, with no SDK default

Fewer moving parts, no risk of the SDK computing a bound that spuriously reverts.

**Why rejected:** an unset bound is `0`, i.e. no protection, and that is what every caller would
ship on day one because the correct value is non-obvious (it is *not* the vault share price). The
conservative-both-sides construction makes a spurious revert essentially impossible while keeping the
guard real, and `minSharePriceE27` remains overridable for callers who genuinely want out. The
low-level `vaultV2ForceWithdraw` action even accepts `0n` to disable the bound; the high-level
`MorphoVaultV2.forceWithdraw` entity, however, requires a strictly positive override
(`NonPositiveInputError` otherwise) so it cannot silently opt out of the guard it exists to add.

### Alternative 5: hide the referral fee

Hardcode `referralFeePct = 0` and keep the parameters off the SDK surface.

**Why rejected:** the parameters exist on a deployed, audited contract; omitting them would push
integrators who need them off the SDK entirely. Exposing them with validation
(`referralFeePct < WAD`, and a non-zero recipient whenever the percentage is non-zero) plus an
explicit note that the fee sits outside `minSharePriceE27` is more honest than pretending the feature
is absent.

## Assumptions & Constraints

- **Single-adapter, markets-based vaults only.** The contract's constraint, not ours. Multi-adapter
  vaults and vaults on the legacy positions-based `MorphoMarketV1Adapter` or a
  `MorphoVaultV1Adapter` lose `forceWithdraw` and must use `forceRedeem` or a plain `withdraw`. The
  SDK asserts the adapter type rather than letting the contract revert opaquely on the cast.
- **The vault routes liquidity through that same adapter, or not at all.** Any other configuration is
  unresolvable, since `deallocateInternal` requires `isAdapter`.
- **The `receiveAssetsGate` must allow VaultExitBundlesV1.** New relative to the multicall path.
- **The builder must be the signer.** The contract binds the permit owner, the burned shares, and the
  payout recipient all to `msg.sender`.
- **Smart-contract wallets take the approve path.** `VaultV2.permit` is `ecrecover`-only; the
  integrator's `supportSignature: false` is authoritative.
- **One bundle call per transaction**, from the transient `initiator` guard.

## Dependencies

[`morpho-org/bundles`](https://github.com/morpho-org/bundles) `VaultExitBundlesV1`, already vendored
and deployed. No package bump beyond `morpho-sdk` itself: the ABI and the address slot shipped with
the in-kind TIB, so no downstream peer-range audit is required.

## Security

- **The slippage bound is the headline.** The multicall path had none. See the drift table above.
- **The allowance is bounded** to the largest burn the on-chain price check can accept —
  `mulDivUp(exitAssets, RAY, minSharePriceE27)` — rather than granting an unlimited approval to the
  periphery. Deriving it from the floor (not the snapshot plan) keeps a within-tolerance price drop
  from reverting on allowance and nullifying the slippage guard. The one regime where it does reach
  `maxUint256` is the deliberate saturation above, which only triggers for a floor so small that no
  smaller allowance could satisfy the exit anyway.
- **The coverage check removes the only opaque revert** in the flow. The fork suite asserts the
  SDK-side direction — `maxExitAssets + 1` is rejected before submission with
  `VaultV2ForceWithdrawCoverageError`. The matching on-chain `0x32` panic is *not* asserted, because
  an `exitAssets` above the whole position reverts on shares/allowance long before the contract's
  unbounded loop; the panic correspondence therefore rests on the contract's unbounded-loop
  semantics, not a dedicated fork assertion.
- **The referral fee is outside the slippage guard** — stated in the JSDoc, the action's parameter
  docs, and here, because it is the one way a caller can lose value the bound does not see.
- **Nothing can strand in the periphery**: the contract transfers the payout and the fee in the same
  call, and the fork suite asserts a zero periphery balance afterwards.
- **Residuals, all documented and none defended against**: vault-state drift between snapshot and
  inclusion, share sufficiency, and both Vault V2 gate families. Same list as the in-kind TIB, for
  the same reasons.

## Future Considerations

- A `max`-mode force withdraw would need the shares→assets→penalty inversion this TIB declined. If
  it is ever wanted, `forceRedeem` is the natural home, since a full exit is share-denominated.
- `previewVaultV2ForceWithdraw` currently caps at `maxExitAssets` and re-plans; a multi-tier preview
  (like `previewVaultV2InKindRedeem`'s per-market choices) would let a UI show penalty-free versus
  penalised tiers separately.

## References

- [`VaultExitBundlesV1.sol`](https://github.com/morpho-org/bundles/blob/main/src/vault-exit/VaultExitBundlesV1.sol) — the contract
- [`VaultV2ExitBundlesTest.sol`](https://github.com/morpho-org/bundles/blob/main/test/VaultV2ExitBundlesTest.sol) — `testForceWithdrawTightPriceBound` is the source of the dust term
- [`vault-v2/src/VaultV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol) — `exit`, `forceDeallocate`, `previewWithdraw`, the gates
- [`TIB-2026-07-27`](./TIB-2026-07-27-vault-exit-in-kind-redemption.md) — the in-kind decision this TIB extends, and the source of the permit, allowance, and gate reasoning

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- Addenda may be appended to record operational updates that affect
  how the TIB is applied without changing the decision itself.
- TIB identifiers use CalVer (YYYY-MM-DD) based on the date the TIB was first drafted.
- A TIB is a *proposal* until its Status becomes Accepted. Once accepted, the rule the
  TIB decides on is codified in the relevant section of `AGENTS.md`; the TIB stays as
  the dated record of how the decision was reached. TIBs feed `AGENTS.md` — they do
  not override it.
-->
