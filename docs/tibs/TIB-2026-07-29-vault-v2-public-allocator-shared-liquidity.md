# TIB-2026-07-29: Vault V2 public-allocator shared liquidity

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| **Status** | Proposed                                                                     |
| **Date**   | 2026-07-29                                                                   |
| **Author** | @foulques                                                                    |
| **Scope**  | Packages: `morpho-sdk`, `blue-sdk-viem`, `blue-sdk`, `morpho-ts`             |

---

## Context

Integrators (frontends, allocators, risk dashboards) ask one question of a Morpho Blue market:
**"how much more can be borrowed here, counting liquidity a public allocator could pull in?"**

Today the SDK answers that for **MetaMorpho Vault V1 only**. The engine lives in `morpho-sdk`:

```
MorphoBlue.getReallocationData()  →  ReallocationData            (entity, state container)
                                       ↓ getMarketPublicReallocations()   (greedy discovery)
                                     computeReallocations()       (helper, transactional planner)
                                       ↓
                                     VaultReallocation[]  →  PublicAllocator.reallocateTo(...)
```
plus two read-only metrics on the entity (`getPublicReallocationLiquidity`,
`getAvailableLiquidityToUtilization`, frozen in
[TIB-2026-06-16](./TIB-2026-06-16-shared-liquidity-target-utilization-metric.md)) and a
state-independent validator (`validateReallocations`).

`morpho-org/vault-v2` has since shipped **`BluePublicAllocator`**
(`src/periphery/blue-public-allocator/BluePublicAllocator.sol`, last touched
`b41782590d3d33d8d836aedd233aaa72ac8b2aa2`, 2026-07-29) — the Vault V2 counterpart. It lets anyone
move a Vault V2's liquidity between Morpho Blue markets through `MorphoMarketV1AdapterV2` adapters,
or out of the vault's idle balance, in exchange for a per-call native penalty.

The SDK has **no** surface for it: no ABI, no address key, no entity, no compute. As Vault V2 TVL
grows, a Blue market's reallocatable liquidity increasingly sits behind Vault V2 vaults, and the
V1-only engine silently under-reports it — a borrow that would succeed is quoted as impossible.

This TIB freezes the design of the Vault V2 mirror.

## Goals / Non-Goals

**Goals**

- Mirror the V1 shared-liquidity engine for Vault V2, named with a `VaultV2` **suffix**:
  `computeReallocationsVaultV2`, `validateReallocationsVaultV2`, `ReallocationDataVaultV2` and its
  three public methods.
- Model `BluePublicAllocator` faithfully: post-state `absoluteCap`, boolean `canDeallocate`,
  `isActiveAdapter`, per-call `nativePenalty`, and the V2-only `allocateFromIdle` source.
- **Full-parity cap simulation.** Never emit a fee-bearing plan that reverts on-chain: simulate the
  allocator's own cap *and* the vault's absolute + relative caps on all three allocation ids.
- Reuse the existing constants (`DEFAULT_WITHDRAWAL_TARGET_UTILIZATION`,
  `DEFAULT_SUPPLY_TARGET_UTILIZATION`) and the existing `blue-sdk` id derivation
  (`VaultV2MorphoMarketV1AdapterV2.ids`). No duplicated formula, no duplicated constant.

**Non-Goals**

- **No change to the V1 surface.** Nothing is renamed, deprecated, or deleted. `ReallocationData`,
  `computeReallocations`, `validateReallocations` and every V1 type stay byte-identical. This is
  purely additive — there is no breaking change and no migration.
- **No calldata.** No action, no bundler encoder, no `Transaction`. The engine returns a plan; it
  does not encode one.
- **No entity wiring.** `MorphoBlue` and `MorphoVaultV2` are not modified. `MorphoBlue.getReallocationData()`
  keeps its exact current behavior. Dispatching between V1 and V2 — and folding V2 reallocations into
  `borrow` / `supplyCollateralBorrow` / `withdraw` / `refinance` — lands in the **blue bundles
  migration** project, in its own PR.
- No combined V1+V2 liquidity metric (needs the entity dispatch above).
- No curator-facing setters (`setAbsoluteCap`, `setCanDeallocate`, `setIsActiveAdapter`,
  `setNativePenalty`, `claimNativePenalty`). Reads only — matching V1, which never exposed
  `setFlowCaps`.
- No `liquidity-sdk-viem` change; its `LiquidityLoader` stays V1-only.

## Current Solution

`ReallocationData` (`packages/morpho-sdk/src/entities/reallocationData.ts`) holds four maps —
`markets`, `vaults` (MetaMorpho `Vault`), `positions[vault][marketId]`,
`vaultMarketConfigs[vault][marketId]` — and drives a greedy loop. Per `(vault, sourceMarket)`
candidate it computes:

```ts
assets = min(
  srcPosition.supplyAssets,
  srcPosition.market.getWithdrawToUtilization(ceiling),   // 90%, then 100% in phase 2
  suppliable,                                            // target vault cap headroom, pending-cap aware
  vaultPublicAllocatorConfig.maxIn  ?? 0n,                // flow cap IN, target market
  srcConfig.publicAllocatorConfig.maxOut ?? 0n,           // flow cap OUT, source market
)
```

then applies the largest candidate to a cloned state, flipping `maxIn`/`maxOut` and accruing the
vault fee, and repeats. `computeReallocations` wraps it in a two-phase planner (friendly at 90%,
aggressive at 100%), groups withdrawals by vault, caps them to the required amount, and emits
`VaultReallocation { vault, fee, withdrawals }` — one entry per `reallocateTo` call.

Nothing in that model transfers directly, because the V2 contract's cap model is structurally
different (see below).

## Proposed Solution

### The contract, and what it changes

`BluePublicAllocator` is a singleton — no constructor, no immutables, no `MORPHO` reference. Every
entry point is gated on `IVaultV2(vault).isAllocator(msg.sender)`; there is no `admin` mapping.

```solidity
mapping(address vault => mapping(bytes32 id => uint256)) public absoluteCap;
mapping(address vault => mapping(bytes32 id => bool))    public canDeallocate;
mapping(address vault => mapping(address adapter => bool)) public isActiveAdapter;
mapping(address vault => VaultData) public vaultData;
// VaultData { bool canAllocateFromIdle; uint120 nativePenalty; uint120 accruedNativePenalty; }

function reallocate(
    address vault,
    address deallocateAdapter, MarketParams calldata deallocateMarketParams,
    address allocateAdapter,   MarketParams calldata allocateMarketParams,
    uint128 assets
) external payable;

function allocateFromIdle(
    address vault, address adapter, MarketParams calldata marketParams, uint128 assets
) external payable;
```

`id` is `keccak256(abi.encode("this/marketParams", adapter, marketParams))` — already implemented
off-chain as `VaultV2MorphoMarketV1AdapterV2.marketParamsId(adapter, params)`
(`packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:49`). Because the adapter address
is in the preimage, the same Blue market reached through two adapters has two distinct ids and two
distinct caps.

Nine deltas from V1 drive the whole design. Items 4–7 were **verified against `VaultV2.sol` and
`MorphoMarketV1AdapterV2.sol` at `vault-v2@main`**, and two of them invalidate the intuitive port.

1. **One source → one target per call.** No `Withdrawal[]`, so no ordering requirement and no
   deduplication check. `nativePenalty` is charged **per call**, so N sources cost N × penalty. V1
   batched N withdrawals under a single fee — which is why V1's greedy loop ends with a
   `(count − 1) × fee` refund. **That refund loop must not be ported.**
2. **`absoluteCap` is a post-state ceiling, not a consumable budget.** V1's `FlowCaps{maxIn, maxOut}`
   shift on every call and deplete; V2 re-reads `IVaultV2.allocation(id)` and compares. There is no
   flow bookkeeping to simulate — but also no rate limit, so a cap-compliant reallocation is
   repeatable.
3. **No source-side amount limit** — only the `canDeallocate` boolean. A deallocatable market can be
   fully drained in one call, subject to Blue's own liquidity.
4. **`allocation[id]` is rebased, not incremented.** `VaultV2.allocate`/`deallocate` apply the
   adapter's returned `int256 change`, and `MorphoMarketV1AdapterV2` builds it as
   `expectedSupplyAssets(marketId) − vault.allocation(marketParamsId)`. So after a leg,
   `allocation(marketParamsId) == expectedSupplyAssets(marketId)` **exactly**. Three consequences:
   - Define `untracked = expectedSupplyAssets(marketId) − allocation(marketParamsId) ≥ 0`, the
     interest realized on the first touch. It **consumes target-side cap headroom even for a tiny
     `assets`** — a market untouched for months can blow through its cap on a 1-wei reallocation.
   - The same `change` is applied to all three ids, so `adapterId` and `collateralId` are `Σ`
     aggregates whose non-touched components are stale.
   - `allocation[id]` **never bounds `assets`** on the deallocate leg — the vault only requires
     `allocation > 0`. The binding constraint is Blue's `supplyShares` underflow and
     `INSUFFICIENT_LIQUIDITY`, both of which fire before the vault touches `caps`.
5. **Shared ids do not net to zero.** Source and target share `adapterId` when on the same adapter,
   and share `collateralId` whenever the collateral token matches — *across adapters*, since the
   adapter address is not in that preimage. On a shared id the pair nets to
   `untracked_src + untracked_tgt > 0`. An intra-adapter rotation is therefore **not cap-neutral**
   and can revert on `AbsoluteCapExceeded` / `RelativeCapExceeded`. Treating shared ids as cancelling
   out is the single most tempting wrong simplification here.
6. **Vault caps are checked on `allocate` only**, on all three target ids, with three requires:
   `absoluteCap > 0` (`ZeroAbsoluteCap`), `allocation ≤ absoluteCap`, and
   `relativeCap == WAD || allocation ≤ firstTotalAssets.mulDivDown(relativeCap, WAD)`. Because the
   deallocate leg has already landed in the same transaction, the allocate-leg check sees the
   post-deallocation state.
7. **The relative-cap denominator is `firstTotalAssets`**, not `_totalAssets` — transient storage set
   once per transaction inside `accrueInterest()` as
   `min(realAssets, _totalAssets + _totalAssets·elapsed·maxRate/WAD)`. It is the anti-flashloan
   mechanism, and it is **frozen for a whole bundled plan**. Note `deallocate` does *not* accrue;
   `allocate` does.
8. **`allocateFromIdle` is a new liquidity source** with no source market: it spends the vault's idle
   ERC-20 balance. Its gate failure reverts with `CannotDeallocate()` (reused, no dedicated error).
   There is no public deallocate-to-idle — idle → market only, never back.
9. Active adapters **must** be `MorphoMarketV1AdapterV2` (contract natspec: otherwise "the public
   allocator's absolute cap system could break"), and both legs require
   `marketParams.irm == adaptiveCurveIrm` and `loanToken == asset`.

### Public surface

Suffix naming throughout, so every symbol reads as "the V1 thing, for Vault V2":

| Layer | Symbol |
| --- | --- |
| Helper | `computeReallocationsVaultV2({ reallocationData, marketId, operation, amount, options })` |
| Helper | `validateReallocationsVaultV2(reallocations, target)` |
| Entity | `class ReallocationDataVaultV2` / `interface InputReallocationDataVaultV2` |
| Entity method | `getMarketPublicReallocationsVaultV2(marketId, options?)` |
| Entity method | `getPublicReallocationLiquidityVaultV2(marketId, options?)` |
| Entity method | `getAvailableLiquidityToUtilizationVaultV2(marketId, utilization?, options?)` |
| Types | `VaultReallocationVaultV2`, `ReallocationWithdrawalVaultV2`, `PublicReallocationVaultV2`, `PublicAllocatorOptionsVaultV2`, `ReallocationComputeOptionsVaultV2` |
| Config shapes | `VaultV2PublicAllocatorConfig`, `VaultV2MarketPublicAllocatorConfig` |
| Fetchers | `fetchVaultV2PublicAllocatorConfig`, `fetchVaultV2MarketPublicAllocatorConfig`, `fetchVaultV2PublicAllocatorData` |
| ABI / address | `bluePublicAllocatorAbi`, `ChainAddresses.bluePublicAllocator` |

The config shapes use the `VaultV2` **prefix** rather than the suffix, because they live in
`blue-sdk/src/vault/v2/` alongside `VaultV2Adapter`, `VaultV2MorphoVaultV1Adapter` and
`AccrualVaultV2`. The suffix rule governs the mirrored *logic* surface; the prefix rule governs
`blue-sdk` entity shapes. They are plain readonly **interfaces**, not classes — no new class is
introduced and no `.fetch` augment is added.

```ts
export interface PublicAllocatorOptionsVaultV2 {
  readonly enabled?: boolean;
  readonly timestamp?: BigIntish;
  readonly reallocatableVaults?: readonly Address[];
}
export type ReallocationComputeOptionsVaultV2 = PublicAllocatorOptionsVaultV2;

/** One entry = one on-chain call. `idle` has no source market. */
export type ReallocationWithdrawalVaultV2 =
  | { readonly type: "market"; readonly adapter: Address;
      readonly marketParams: MarketParams; readonly amount: bigint }
  | { readonly type: "idle"; readonly amount: bigint };

export interface VaultReallocationVaultV2 {
  readonly vault: Address;
  readonly allocateAdapter: Address;
  readonly allocateMarketParams: MarketParams;
  /** Total native penalty: `nativePenalty × withdrawals.length`. */
  readonly fee: bigint;
  readonly withdrawals: readonly ReallocationWithdrawalVaultV2[];
}
```

`PublicAllocatorOptionsVaultV2` carries **only** the three live options. V1's four `@deprecated`
utilization knobs are not carried forward: the 90% source ceiling and 90% supply trigger are the
existing constants, and phase 2's 100% drain is an internal parameter, not public surface.

`VaultReallocationVaultV2` stays vault-grouped like V1 for shape symmetry, with the group key
`(vault, allocateAdapter)` — a vault may hold several adapters covering the target market, and each
call names its own `allocateAdapter`. `fee = nativePenalty × withdrawals.length` because each
withdrawal is exactly one call. The deferred encoder expands one group into N
`reallocate` / `allocateFromIdle` calls.

### State model: keyed by derived `bytes32` id

`ReallocationDataVaultV2` keys cap state by the derived id, scoped per vault — **not** by
`(vault, adapter, marketId)`:

```ts
export interface InputReallocationDataVaultV2 {
  readonly chainId: number;
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;
  readonly vaults?: Readonly<Record<Address, AccrualVaultV2 | undefined>>;
  /** Vault caps + live allocation per derived id. */
  readonly allocations?: Readonly<Record<Address, Readonly<Record<Hex, IVaultV2Allocation | undefined>>>>;
  readonly publicAllocatorConfigs?: Readonly<Record<Address, VaultV2PublicAllocatorConfig | undefined>>;
  readonly marketPublicAllocatorConfigs?: Readonly<Record<Address, Readonly<Record<Hex, VaultV2MarketPublicAllocatorConfig | undefined>>>>;
}
```

Three reasons, in severity order:

1. **The ids alias.** One `adapterId` is shared by every market on that adapter; one `collateralId`
   is shared by every pair with the same collateral token, across adapters. A
   `(vault, adapter, marketId)`-keyed map stores the same live `allocation` in N slots, so every
   mutation needs fan-out writes and every read needs reconciliation — and the second withdrawal of
   a plan reads a stale aggregate and busts the bucket.
2. **1:1 with storage.** All five relevant mappings are `mapping(bytes32 id => …)`. Any derived key
   is a lossy re-projection.
3. It reuses the existing `IVaultV2Allocation` (`{ id, absoluteCap, relativeCap, allocation }`)
   verbatim instead of exporting a duplicate shape (root §1).

`(vault, adapter, marketId)` remains the key for the *permission* projection, because that is what a
call takes. Note the asymmetry the contract dictates: the **allocator's** `absoluteCap` is checked on
**one** id (`marketParamsId`), while the **vault's** caps are checked on **all three**.

Everything derivable from `AccrualVaultV2` is derived, not fetched: candidate adapters
(`accrualAdapters[i].type`), source positions (`supplyShares` × `Market`), `MarketParams`, all three
ids (`adapter.ids(params)`), idle balance (`assetBalance`), `adaptiveCurveIrm`.

### The per-candidate bound

With `untracked(a, m) = expectedSupplyAssets(m) − allocation[marketParamsId(a, m)]` and
`A = firstTotalAssets` from one up-front `accrueInterest(timestamp)`, frozen for the plan:

**Feasibility gates** — return `0n`, no amount:

- `isActiveAdapter[target]`, `isActiveAdapter[source]`, `canDeallocate[sourceMarketParamsId]`,
  `canAllocateFromIdle` for an idle source.
- `marketParams.irm === adapter.adaptiveCurveIrm` on both legs.
- `sourceMarketParamsId !== targetMarketParamsId` — exclude the **pair**, not the market. The same
  market on a different adapter is a legitimate source; a true self-reallocation is a
  penalty-charging no-op that can also revert.
- `absoluteCap[t] > 0` for every target id (`ZeroAbsoluteCap`), `allocation[s] > 0` for every source
  id (`ZeroAllocation`).
- For each id **shared** between source and target:
  `allocation[id] + untracked_src + untracked_tgt ≤ min(absoluteCap[id], mulDivDown(A, relativeCap[id], WAD))`.
  This is `assets`-independent, so it gates feasibility rather than bounding the amount.

**Amount bounds** — `MathLib.min` of:

| # | Bound |
| --- | --- |
| 1 | `MathLib.MAX_UINT_128` — `assets` is `uint128` on the allocator API |
| 2 | `zeroFloorSub(bpaAbsoluteCap[targetMarketParamsId], allocation[targetMarketParamsId] + untracked_tgt)` |
| 3 | for each target id **not** shared with the source: `allocationHeadroom(allocation[t], A) − untracked_tgt` |
| 4 | market source: `expectedSupplyAssets(sourceMarketId)` — *not* `allocation[id]` |
| 5 | market source: `sourceMarket.getWithdrawToUtilization(ceiling)` — SDK policy; at `WAD` this is exactly Blue's `totalSupply − totalBorrow` |
| 6 | idle source: `vault.assetBalance` |

`zeroFloorSub` on every cap term (caps may legally sit below the live allocation); `mulDivDown` for
relative caps — over-stating by 1 wei produces a `RelativeCapExceeded` revert.

### State transition

`applyPublicReallocationVaultV2` clones on write and applies the legs in contract order
(deallocate → allocate), so both the intermediate dip and the shared-id netting are faithful:

| Field | market → market | idle → market |
| --- | --- | --- |
| `allocations[vault][s]`, all 3 source ids | `+= change_src = −assets + untracked_src` | — |
| `allocations[vault][t]`, all 3 target ids | `+= change_tgt = assets + untracked_tgt` | same |
| `markets[srcId]`, `srcAdapter.supplyShares` | `withdraw(assets)` | — |
| `markets[tgtId]`, `tgtAdapter.supplyShares` | `supply(assets)` | same |
| `vault.assetBalance` | `+= assets + untracked_src`, then `−= assets` | `−= assets` |
| `publicAllocatorConfigs[vault].accruedNativePenalty` | `+= nativePenalty`, once per withdrawal | same |
| `vault._totalAssets`, `firstTotalAssets` | **unchanged** | **unchanged** |

`_totalAssets` is written only by `accrueInterest` / `enter` / `exit`, and `firstTotalAssets` is
transient. **V1's closing `vaultData.totalAssets = withdrawQueue.reduce(…)` recomputation must not be
ported**: in V1 `totalAssets` is a derived mirror, in V2 it is stored, and recomputing it folds
per-leg Blue rounding into the relative-cap denominator on every greedy step. Because `A` is frozen,
relative headroom is monotonically non-increasing and the greedy loop provably terminates.

### Planner and validator

`computeReallocationsVaultV2` keeps V1's two-phase shape — friendly at
`DEFAULT_WITHDRAWAL_TARGET_UTILIZATION`, then aggressive at `MathLib.WAD` passed as an internal
parameter — the same `groupWithdrawalsByVault` / `capVaultWithdrawals` logic keyed on
`(vault, allocateAdapter)`, the same `getSupplyTargetUtilization` trigger, and the same
`InsufficientSharedLiquidityError` / `ReallocationWithdrawExceedsMarketSupplyError` throws. It drops
V1's terminal sort, which existed only to satisfy `reallocateTo`'s ascending-id requirement.

`validateReallocationsVaultV2` stays state-independent like V1: non-negative `fee`, non-empty
`withdrawals`, positive `amount`, `amount ≤ MAX_UINT_128`, no withdrawal on the target
`(adapter, marketId)` pair, and **unique** sources per group (replacing V1's sortedness check).

New error classes follow root §3 — one per failure mode, exported, instruction-shaped messages with
quoted interpolations. Missing-data classes extend `UnknownDataError` so the greedy scan skips the
candidate via `_try`; plan-level classes are thrown only from the validator and the state
transition. `UnsortedReallocationWithdrawalsError` gets no sibling.

### Implementation Phases

- **Phase 1 — ABI + address registry (`morpho-ts`).** Hand-pinned `bluePublicAllocatorAbi`; optional
  `ChainAddresses.bluePublicAllocator` with **no chain entries** (the contract is undeployed), so
  `getChainAddress` and `registerCustomAddresses` resolve it like any other key. Re-export from
  `blue-sdk-viem/src/abis.ts` and `morpho-sdk/src/abis.ts` — one definition, per root §1.
- **Phase 2 — shared cap formula (`blue-sdk`).** Extract the absolute+relative cap arithmetic already
  inside `AccrualVaultV2.maxDeposit` into a pure `VaultV2Utils.allocationHeadroom(allocation, firstTotalAssets)`
  and have `maxDeposit` delegate. Behavior-preserving, no signature change, endorsed by root §1
  ("class methods delegate to pure `*Utils` namespace functions"). This is the **only** touch to
  existing code in the whole change, and it exists so the cap formula cannot drift between
  `maxDeposit` and the simulation.
- **Phase 3 — fetcher (`blue-sdk-viem`).** Config interfaces in `blue-sdk/src/vault/v2/`; a new
  deployless query (`contracts/vault-v2/GetVaultV2PublicAllocatorConfig.sol` +
  `interfaces/IBluePublicAllocator.sol`) and three fetchers in `src/fetch/vault-v2/`, with
  `deployless = true` default and multicall fallback per package convention. The batched
  `fetchVaultV2PublicAllocatorData` is what the simulation calls: one `eth_call` deployless, versus
  `1 + 4V + 3C + 5·V·M` reads on multicall for V adapters, M markets each, C collateral tokens.
  Throws `MissingBluePublicAllocatorAddressError` when the registry key is unset.
- **Phase 4 — types + errors (`morpho-sdk`).** `src/types/sharedLiquidityVaultV2.ts` and the new
  error classes in `src/types/error.ts`.
- **Phase 5 — entity + planner (`morpho-sdk`).** `src/entities/reallocationDataVaultV2.ts`,
  `src/helpers/computeReallocationsVaultV2.ts`, `validateReallocationsVaultV2` in
  `src/helpers/validate.ts`, plus barrel and `src/utils.ts` exports mirroring V1's root/`utils`
  symmetry.
- **Phase 6 — tests.** Colocated units for the pure surface; mock-transport units for the fetchers
  (root §2 rule 6 permits `createMockClient` for shaped-response fetchers); Anvil fork tests for
  every path whose correctness depends on real on-chain state.
- **Phase 7 — docs + changesets.** `AGENTS.md` glossary and layer docs; minor changesets for
  `morpho-ts`, `blue-sdk`, `blue-sdk-viem`, `morpho-sdk`, plus the §7 dependent-bump audit. Also fix
  the JSDoc at `packages/wdk-protocol-lending-morpho-evm/src/morpho-protocol-evm.ts:159`, which
  already mislabels the **V1** `reallocations` field as "Morpho Vault V2 reallocations" — harmless
  today, actively misleading once a real V2 surface exists.

### Test strategy

Because `BluePublicAllocator` is undeployed, the fork test follows
[morpho-org/sdks#907](https://github.com/morpho-org/sdks/pull/907): an out-of-band-compiled artifact
committed under `test/fixtures/` with a provenance header (source repo @ commit SHA + path, solc
version, optimizer / viaIR / metadata / evmVersion settings, verbatim regeneration command, and a
"delete once deployed" note), deployed with the existing `client.deployContractWait`. No `.sol`
vendoring of the allocator into `contracts/`, and the ABI comes from `bluePublicAllocatorAbi` rather
than the fixture, so there is still one ABI definition.

Six invariants get a test that fails if the invariant is removed (root §5):

1. **Shared `collateralId` aliasing** — two sources and a target on the same collateral, with the
   `collateralId` capped so only the first fits.
2. **Shared ids are not cap-neutral** — an intra-adapter rotation with `allocation[adapterId]` at its
   cap must be rejected when `untracked_src + untracked_tgt` overflows it.
3. **`untracked` consumes target headroom** — fork at a block where
   `allocation(id) < expectedSupplyAssets`, then `simulateContract` the computed plan.
4. **`allocation[id]` does not bound the deallocate leg** — a full drain of a market whose
   `expectedSupplyAssets > allocation[id]` must succeed.
5. **`_totalAssets` / `firstTotalAssets` immutability** across the state transition, plus a
   multi-step plan where a relative cap binds to the wei.
6. **Fee arithmetic** — three withdrawals from one vault ⇒ `fee === 3n * nativePenalty`, and the
   returned state's `accruedNativePenalty` matches on-chain `vaultData(vault).accruedNativePenalty`
   after execution.

Plus: pair-vs-market exclusion in both directions, and two idle withdrawals not each claiming the
whole `assetBalance`.

## Considered Alternatives

### Alternative 1: extend `ReallocationData` with V2 support instead of a sibling class

Parameterize the existing class over vault version, or widen its maps to hold `AccrualVaultV2`
alongside `Vault`.

**Why rejected:** the two cap models share no arithmetic. V1 keys by `MarketId` and mutates
consumable `maxIn`/`maxOut`; V2 keys by a derived `bytes32`, mutates rebased aggregate allocations
across three aliasing ids, and has no flow budget at all. Every method body would fork on version
immediately. It would also mean retyping public maps on a shipped class — a major per root §7 — for
zero shared code. A sibling class keeps V1 byte-identical and makes the deferred v1/v2 dispatch a
straight swap at the call site.

### Alternative 2: flat one-entry-per-call result shape

Return `{ vault, deallocateAdapter, deallocateMarketParams, allocateAdapter, allocateMarketParams, assets, nativePenalty }[]`
— exactly 1:1 with the on-chain calls, since V2 has no batching.

**Why rejected:** it breaks the V1/V2 signature symmetry that root §6 makes a first-class
requirement ("Identical signatures across V1/V2 where protocols overlap"), and it pushes per-vault
fee aggregation onto every caller. The vault-grouped shape keeps `VaultReallocation` and
`VaultReallocationVaultV2` swappable, with `fee` already totalled. The flat shape is recoverable by
flattening `withdrawals`; the grouping is not recoverable from the flat shape without a regroup pass.

### Alternative 3: allocator-cap-only simulation

Simulate only `absoluteCap` / `canDeallocate` / `isActiveAdapter` / `canAllocateFromIdle`, and let
the vault's own absolute and relative caps revert on-chain.

**Why rejected:** it cuts the fetch cost by roughly `3·(V + C + V·M)` reads, but it emits
**fee-bearing plans that revert**. `computeReallocations` already refuses partial plans for an
unreachable operation precisely because the penalty is non-refundable
(`InsufficientSharedLiquidityError`); shipping a V2 planner that knowingly ignores half the binding
constraints would be a regression against V1, which does simulate vault caps and pending caps. The
deployless query collapses the read cost to a single `eth_call` anyway.

### Alternative 4: treat shared ids as netting to zero

Skip any target id that also appears among the source ids, on the reasoning that
`deallocate(−assets)` then `allocate(+assets)` cancels out.

**Why rejected:** **factually wrong**, and wrong in the unsafe direction. Because the adapter rebases
to `expectedSupplyAssets`, a shared id nets to `untracked_src + untracked_tgt`, which is strictly
positive whenever either market has accrued interest since its last touch. Since caps are checked
only on the allocate leg — after the deallocate leg has landed — an intra-adapter or same-collateral
rotation can revert on `AbsoluteCapExceeded` even though the principal is unchanged. Shared ids are
therefore modelled as feasibility gates, not as cancelled terms. This was caught only by reading
`VaultV2.allocateInternal` and `MorphoMarketV1AdapterV2.allocate` line by line; it is recorded here
because it is the least intuitive part of the design.

### Alternative 5: wire V2 reallocations into the transaction flows in the same change

Add `reallocations?` to `blueBorrow` / `blueSupplyCollateralBorrow` / `blueWithdraw` /
`blueRefinance` and a `bluePublicAllocatorReallocate` bundler encoder now.

**Why rejected:** the encoding question belongs to the blue bundles migration, which is deciding how
V1 and V2 reallocations coexist inside one bundle and how `tx.value` aggregates two penalty models.
Landing the encoder first would freeze that decision from the wrong end. Read + compute is
independently useful (dashboards and quoting need the metric, not calldata) and independently
reviewable — one concern per PR, root §8.

### Alternative 6: carry V1's deprecated utilization options into the V2 options type

Mirror `PublicAllocatorOptions` exactly, including `maxWithdrawalUtilization`,
`defaultMaxWithdrawalUtilization`, `supplyTargetUtilization`, `defaultSupplyTargetUtilization`.

**Why rejected:** all four are `@deprecated` and slated for removal in the next major. Adding them to
a brand-new type would create four public options with a scheduled death date and would make the V2
surface inherit a migration it never needed. The fixed 90%/90% policy plus an internal phase-2
parameter is the end state V1 is heading toward; V2 starts there.

## Assumptions & Constraints

- **The contract is one day old, unaudited, and undeployed.** The last commit touching it is
  `b41782590d3d33d8d836aedd233aaa72ac8b2aa2` ("rename"), and the surrounding commits that same
  morning were still restructuring folders and adding `multicall`. The ABI and the test fixture pin a
  commit SHA and must be regenerated together; nothing in CI detects upstream drift.
- **`ChainAddresses.bluePublicAllocator` is registered but empty.** Every fetcher throws
  `MissingBluePublicAllocatorAddressError` until a deployment lands. Fork tests register the
  fork-deployed address at runtime.
- **Simulation assumes one bundled transaction.** `firstTotalAssets` is transient, so a plan split
  across transactions gets a fresh denominator per transaction. Accrual only raises it, so the drift
  is safe-directional — the real transaction sees at least as much relative headroom as simulated.
- **`SharePriceAboveOne` (`mintedShares ≥ assets` on allocate) is not modelled.** Blue's virtual-share
  scaling keeps it true for any realistic market.
- **`getWithdrawToUtilization` is a policy bound, not a contract bound.** The contract permits a full
  drain; the 90% ceiling is the SDK's own conservatism, identical to V1's.
- Pass `options.timestamp` from the block used to fetch the state — same constraint as V1, where
  accrual otherwise falls back to the target market's `lastUpdate`.
- Additive public surface only. Semver: **minor** for the four touched packages. `viem` stays the
  only peer dependency of `morpho-sdk`; no new runtime dependencies.

## Dependencies

- `morpho-org/vault-v2` @ `4c7c110a9a3c3ce1ec545fff3b8a832f16cedfcc` (repo HEAD at drafting) —
  `BluePublicAllocator.sol`, `VaultV2.sol`, `MorphoMarketV1AdapterV2.sol`.
- Existing `blue-sdk` id derivation (`VaultV2MorphoMarketV1AdapterV2.adapterId` / `collateralId` /
  `marketParamsId`) and `AccrualVaultV2`.
- Existing fork harness: `@morpho-org/test`'s `createViemTest` / `AnvilTestClient.deployContractWait`,
  and `packages/blue-sdk-viem/test/utils.ts` (`deployVaultV2`, `deployMorphoMarketV1Adapter`,
  `submitAndAccept`).
- **Blocks:** the blue bundles migration project, which consumes this engine to build the actual
  reallocation bundles and the v1/v2 dispatch.

## Security

- **Non-refundable penalty.** `msg.value` must equal `nativePenalty` exactly — overpaying reverts,
  and a reverted `reallocate` still cost gas. The planner therefore refuses partial plans for an
  unreachable operation, mirroring V1's `InsufficientSharedLiquidityError`.
- **Front-runnable by anyone**, per the contract's own natspec: an allocate reverts if the vault cap
  is filled first, and a deallocate reverts if shares stop covering assets. Neither is an SDK bug;
  both must be surfaced in the JSDoc so integrators handle the revert rather than treat a computed
  plan as guaranteed.
- **`BluePublicAllocator` opens relative-cap manipulation through short-term deposits** (capital
  intensive, documented upstream). The SDK does not mitigate it; the simulation just uses
  `firstTotalAssets`, the same anti-flashloan denominator the contract uses.
- **Non-conforming adapters are skipped, not trusted.** Only `MorphoMarketV1AdapterV2` adapters are
  considered, because the contract's cap system is only sound for them. An `isActiveAdapter` adapter
  of any other class is silently ignored rather than simulated with the wrong cap model.
- **Read-only change.** No signing, no calldata, no new authorization surface in this PR.

## Future Considerations

- **Entity dispatch and the combined metric.** Once `MorphoBlue` can fetch both engines, a single
  "reallocatable liquidity" number spanning V1 and V2 vaults becomes the natural integrator-facing
  metric. Deferred here because it requires the entity change this TIB excludes.
- **Bundler encoding** (`bluePublicAllocatorReallocate`, `allocateFromIdle`) and the `reallocations?`
  parameters on the Blue flows — blue bundles migration.
- **Penalty-aware planning.** A plan pulling a dust amount from a fifth market pays a full extra
  penalty. Largest-first greedy already tends to minimize call count, so this is deliberately not
  optimized now; a `maxNativePenalty` budget or a dust floor is the obvious extension if real vaults
  set non-trivial penalties.
- **Delete the test fixture** once `BluePublicAllocator` is deployed and its address is registered;
  replace the runtime deploy with a pinned-block fork read.
- `packages/blue-sdk-viem/contracts/vault-v2/interfaces/IVaultV2.sol` has known drift from the pinned
  `vaultV2Abi` (`sharesGate` / `setIsAdapter` / `abdicateSubmit` versus `receiveSharesGate` /
  `addAdapter` / `abdicate`). It is inert for this change — those selectors are never called — and
  fixing it would rewrite the `GetVaultV2` and `GetAccrualVaultV2` artifacts. Worth its own PR.

## Open Questions

- Will `BluePublicAllocator` be deployed as a single cross-chain singleton at a deterministic
  address, or per-chain? The registry key is flat and per-chain either way, but a deterministic
  address would let the fixture's canonical constant match the real deployment.
- Should `getPublicReallocationLiquidityVaultV2` count idle by default? It is included here, on the
  grounds that idle is genuinely reallocatable and excluding it under-reports — but a dashboard
  showing "shared liquidity" may prefer to attribute idle separately.
- Should reallocation candidates be favored by penalty cost? Unlike PAV1's single per-vault fee,
  PAV2 charges a penalty per market moved, so a plan spread across many markets is proportionally
  more expensive for the borrower. This raises a product question: keep ranking candidates by size
  (as V1 does today), or rank by liquidity obtained per unit of penalty. @Foulks-Plb has made a
  first algorithm proposal to answer this and related product needs — the phase structure is
  unchanged (Phase 1 Friendly, then Phase 2 Aggressive); the only difference is that each
  reallocation is assigned a cost and the least-expensive reallocations are prioritized within each
  phase. The idea is currently under discussion with the product team — see the
  [Slack thread](https://morpholabs.slack.com/archives/C0AJMKR8VB9/p1785422085768909?thread_ts=1785398315.187139&cid=C0AJMKR8VB9).

## References

- [`BluePublicAllocator.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/periphery/blue-public-allocator/BluePublicAllocator.sol)
  and [`src/periphery/README.md`](https://github.com/morpho-org/vault-v2/blob/main/src/periphery/README.md)
- [`VaultV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol) `allocateInternal` / `deallocateInternal` — the cap checks and the `int256 change` application
- [`MorphoMarketV1AdapterV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/adapters/MorphoMarketV1AdapterV2.sol) `allocate` / `deallocate` / `ids` — the rebase semantics
- [morpho-org/sdks#907](https://github.com/morpho-org/sdks/pull/907) — the undeployed-contract fork-test pattern this change reuses
- [TIB-2026-06-16](./TIB-2026-06-16-shared-liquidity-target-utilization-metric.md) — the V1 read-only metrics being mirrored
- `packages/morpho-sdk/src/entities/reallocationData.ts`, `src/helpers/computeReallocations.ts`,
  `src/types/sharedLiquidity.ts` — the V1 engine
- `packages/blue-sdk/src/vault/v2/VaultV2.ts` (`AccrualVaultV2.maxDeposit`),
  `VaultV2MorphoMarketV1AdapterV2.ts` (`ids`) — the reused cap formula and id derivation
- `packages/blue-sdk-viem/src/fetch/VaultMarketPublicAllocatorConfig.ts` — the V1 fetcher being mirrored
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering, single source of truth), §2 (forbidden patterns),
  §3 (types, typed errors), §5 (testing, security invariants), §6 (JSDoc, V1/V2 signature parity),
  §7 (semver, changesets, pinned ABIs/addresses)
