# TIB-2026-07-29: Vault V2 public-allocator shared liquidity

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Status** | Accepted                                                         |
| **Date**   | 2026-07-29                                                       |
| **Author** | @foulques                                                        |
| **Scope**  | `morpho-sdk`, `liquidity-sdk-viem`, `blue-sdk-viem`, `blue-sdk`, and `morpho-ts` |

## Context

The SDK already models liquidity that a MetaMorpho Vault V1 can move into a
Morpho Blue market through PublicAllocator V1:

```text
MorphoBlue.getReallocationData()
  → VaultV1ReallocationData.computeVaultV1Reallocations()  # discovery
  → computeVaultV1Reallocations()                           # borrow/withdraw planner
  → VaultV1BlueReallocation[]
  → PublicAllocator.reallocateTo(...)
```

The historical V1 names `ReallocationData`, `InputReallocationData`,
`computeReallocations()`, `getMarketPublicReallocations()`, and
`VaultReallocation` remain as deprecated aliases for the prescribed
deprecation window.

Vault V2 has a distinct `BluePublicAllocator` that can move one source market
or the vault's idle assets into one target Morpho market per call. Its cap and
accounting model is different enough that it needs a separate state simulator,
but the resulting calls can use the Blue action and Bundler3 integration that
already exists in this branch.

This TIB freezes that Vault V2 design.

## Goals

- Add `VaultV2ReallocationData.computeVaultV2Reallocations(...)` for greedy,
  largest-first discovery.
- Add `computeVaultV2Reallocations(...)` for amount-aware borrow and withdraw
  planning.
- Return flat, action-ready `VaultV2BlueReallocation[]`; one entry is exactly
  one `reallocate(...)` or `allocateFromIdle(...)` call and pays one
  proportional vault-asset penalty.
- Keep `computeVaultV1Reallocations(...)` as the Vault V1 planner and make the
  versioned V1 discovery/type names canonical.
- Simulate the allocator target cap, all three Vault V2 allocation caps,
  source Blue liquidity and utilization, shared allocation IDs, untracked
  interest, adapter permissions, idle liquidity, and `uint128` bounds.
- Reuse one combined `validateReallocations(...)` for the action-ready V1/V2
  union.

## Non-goals

- No BluePublicAllocator address registry entry. The allocator contract is an
  explicit input to fetchers, state, and every returned call.
- No curator-facing setters such as `setAbsoluteCap`, `setCanPullFromMarket`,
  or `setPenalty`.
- No penalty-efficiency optimizer beyond an explicit maximum-penalty
  filter. Retained candidates are ranked by obtainable assets.

## Public API and naming

| Concern | Canonical symbol |
| --- | --- |
| V1 state | `VaultV1ReallocationData` / `InputVaultV1ReallocationData` |
| V1 state compatibility | `ReallocationData` / `InputReallocationData` (`@deprecated` aliases) |
| V1 discovery | `VaultV1ReallocationData.computeVaultV1Reallocations(marketId, options?)` |
| V1 discovery compatibility | `VaultV1ReallocationData.getMarketPublicReallocations(...)` (`@deprecated`) |
| V1 planner | `computeVaultV1Reallocations(...)` |
| V1 planner compatibility | `computeReallocations(...)` (`@deprecated` alias) |
| V1 action input | `VaultV1BlueReallocation` |
| V1 type compatibility | `VaultReallocation` (`@deprecated` alias) |
| V2 state | `VaultV2ReallocationData` / `InputVaultV2ReallocationData` |
| V2 discovery | `VaultV2ReallocationData.computeVaultV2Reallocations(marketId, options?)` |
| V2 planner | `computeVaultV2Reallocations(...)` |
| V2 action input | `VaultV2BlueReallocation` |
| V2 Bundler actions | `vaultV2BluePublicAllocatorReallocate`, `vaultV2BluePublicAllocatorAllocateFromIdle` |
| V2 allocator ABI | `vaultV2BluePublicAllocatorAbi` |
| Shared action union | `BlueReallocation` |
| V2 options | `VaultV2BluePublicAllocatorOptions` |
| V2 config | `VaultV2PublicAllocatorConfig`, `VaultV2MarketPublicAllocatorConfig` |
| Fetchers | `fetchVaultV2PublicAllocatorConfig`, `fetchVaultV2MarketPublicAllocatorConfig`, `fetchVaultV2PublicAllocatorData` |

`BluePublicAllocatorReallocation` was unreleased relative to `origin/main` and
is renamed directly to `VaultV2BlueReallocation`; it has no compatibility
alias. The former unversioned V2 state, planner, ABI, and Bundler action names
were also unreleased and are renamed directly without aliases.

The action-ready V2 shape is flat:

```ts
export type BluePublicAllocatorSource =
  | {
      readonly type: "market";
      readonly adapter: Address;
      readonly marketParams: MarketParams;
    }
  | { readonly type: "idle" };

export interface VaultV2BlueReallocation {
  readonly allocator: Address;
  readonly type: "bluePublicAllocator";
  readonly vault: Address;
  readonly from: BluePublicAllocatorSource;
  readonly to: { readonly adapter: Address };
  readonly assets: bigint;
  readonly penalty: bigint;
}
```

The target market parameters come from the enclosing Blue action. Existing
borrow, supply-collateral-borrow, loan-asset withdraw, and refinance builders
expand each V2 entry into an existing Bundler3 allocator action. The bundle's
native value includes only V1 fees. V2 penalty assets are pulled once in the
target loan token through GeneralAdapter1, then approved and spent from
Bundler3 per allocator call.

## Contract model

The ABI is pinned from `morpho-org/vault-v2` at the same upstream revision as
the fork fixture documented under Dependencies. The relevant read and write
surface is:

```solidity
struct VaultData {
    bool canPullFromIdle;
    uint64 penalty;
}

address public immutable vaultV2Factory;
mapping(address vault => mapping(bytes32 id => uint256)) public absoluteCap;
mapping(address vault => mapping(bytes32 id => bool)) public canPullFromMarket;
mapping(address vault => mapping(address adapter => bool)) public isActiveAdapter;
mapping(address vault => VaultData) public vaultData;

function reallocate(
    address vault,
    address deallocateAdapter,
    MarketParams calldata deallocateMarketParams,
    address allocateAdapter,
    MarketParams calldata allocateMarketParams,
    uint128 assets,
    uint64 penalty
) external;

function allocateFromIdle(
    address vault,
    address adapter,
    MarketParams calldata marketParams,
    uint128 assets,
    uint64 penalty
) external;
```

The write surface has two distinct authorization paths. The BluePublicAllocator
contract itself must be registered as a Vault V2 allocator so its downstream
`vault.deallocate(...)` and `vault.allocate(...)` calls are authorized.
`reallocate(...)` and `allocateFromIdle(...)` are otherwise permissionless to
their external caller and require the calldata `penalty` to equal the stored
rate. They pull `ceil(assets × penalty / WAD)` of the target loan token from
the caller directly to the vault before allocating. Configuration setters
require the external caller to satisfy `vault.isAllocator(msg.sender)` and
reject vaults not registered in the constructor-supplied Vault V2 factory.

One call has one source and one target. There is no V1-style withdrawal array,
ordering requirement, or multi-source fee refund. The proportional penalty is
rounded up and charged per call.

The allocator cap is a post-state ceiling on the target adapter's
`marketParamsId`, not a consumable flow budget. It must be non-zero before the
vault call. Source-side allocator state is only `canPullFromMarket`.

## Derived allocation IDs

`VaultV2MorphoMarketV1AdapterV2.ids(params)` returns:

1. `adapterId(address)` — shared by every market on the adapter;
2. `collateralId(collateralToken)` — shared across adapters for the same
   collateral;
3. `marketParamsId(adapter, params)` — unique to an adapter/market pair.

State is therefore keyed by `(vault, derivedId)`, not by a projected
`(vault, adapter, market)` tuple:

```ts
export interface InputVaultV2ReallocationData {
  readonly chainId: number;
  readonly allocator: Address;
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;
  readonly vaults?: Readonly<Record<Address, AccrualVaultV2 | undefined>>;
  readonly allocations?: Readonly<
    Record<Address, Readonly<Record<Hash, IVaultV2Allocation | undefined>>>
  >;
  readonly publicAllocatorConfigs?: Readonly<
    Record<Address, VaultV2PublicAllocatorConfig | undefined>
  >;
  readonly marketPublicAllocatorConfigs?: Readonly<
    Record<
      Address,
      Readonly<Record<Hash, VaultV2MarketPublicAllocatorConfig | undefined>>
    >
  >;
}
```

The readonly config projections are self-identifying. Vault-wide state carries
`allocator`, `vault`, `canPullFromIdle`, and `penalty`. Pair state also carries
`adapter`, `marketParamsId`, `absoluteCap`, `canPullFromMarket`, and
`isActiveAdapter`.

## Fetching

`vaultV2BluePublicAllocatorAbi` includes the three allocator mapping reads and
`vaultData`. Fetchers always take the allocator address explicitly:

- `fetchVaultV2PublicAllocatorConfig(allocator, vault, client, parameters?)`;
- `fetchVaultV2MarketPublicAllocatorConfig(allocator, vault, adapter,
  marketParamsId, client, parameters?)`;
- `fetchVaultV2PublicAllocatorData(allocator, hydratedVault, client,
  parameters?)`.

The batched fetcher derives every supported adapter/market request and every
unique allocation ID from the hydrated `AccrualVaultV2`. It defaults to one
deployless read and falls back to equivalent direct reads unless deployless
mode is forced. No chain-address lookup occurs.

Only `AccrualVaultV2MorphoMarketV1AdapterV2` adapters participate. Other
adapter classes are ignored even if an allocator reports them as active.

## Cap headroom

`VaultV2Utils.allocationHeadroom(allocation, firstTotalAssets)` is the single
pure implementation of Vault V2 absolute/relative-cap capacity:

```text
absolute = zeroFloorSub(absoluteCap, allocation)
relative = zeroFloorSub(mulDivDown(firstTotalAssets, relativeCap, WAD), allocation)
headroom = relativeCap == WAD ? absolute : min(absolute, relative)
```

It returns both the capacity and the binding `CapacityLimitReason`.
`AccrualVaultV2.maxDeposit` delegates to it, preserving its existing behavior.

## Accrual and untracked interest

Markets are first accrued to the supplied timestamp. For each vault, the first
simulated allocator call then follows contract order: transfer the penalty,
deallocate the source when present, and let `VaultV2.allocate()` perform the
vault's first accrual. The resulting `_totalAssets` becomes the plan's frozen
`firstTotalAssets` denominator. Later reallocation legs never change it.

For adapter `a` and market `m`:

```text
expectedSupplyAssets(a, m) = market.toSupplyAssets(adapter.supplyShares[m])
untracked(a, m) = zeroFloorSub(
  expectedSupplyAssets(a, m),
  allocation[marketParamsId(a, m)]
)
```

On first touch, the adapter rebases allocation state to expected assets. The
same signed change is applied to all three derived IDs. Untracked interest is
therefore relevant to target cap checks and to shared-ID feasibility even for
a very small principal move.

## Candidate gates and bounds

A candidate exists only when:

- the target and, for a market source, source adapters are supported
  `MorphoMarketV1AdapterV2` instances owned by the vault;
- both markets use the vault asset as loan token and the adapter's
  `adaptiveCurveIrm`;
- target/source adapters are active, source deallocation is permitted, or
  idle allocation is permitted;
- the vault's configured `penalty` does not exceed `options.maxPenalty` when
  that threshold is provided;
- all three target vault caps have a positive absolute cap;
- all three source allocations are non-zero for market sources;
- the source Blue market is not the target market. Moving liquidity between
  adapters of the same market creates no net market liquidity and is ignored.

For each allocation ID shared by the source and target, feasibility is checked
without principal cancellation:

```text
allocation[id] + sourceUntracked + targetUntracked
  <= min(absoluteCap[id], relativeCapAssets[id])
```

For non-shared target IDs, principal is bounded by cap headroom after target
untracked interest. A monotonic binary search applies each candidate amount to
a clone, then checks the exact post-accrual allocations against
`VaultV2Utils.allocationHeadroom({ ...allocation, allocation: 0n },
firstTotalAssets)`. This is necessary because the first penalty donation can
change `firstTotalAssets` as the candidate amount changes. The initial search
ceiling is the minimum of:

- `MathLib.MAX_UINT_128`;
- target Morpho market `uint128` supply headroom;
- allocator target-cap headroom;
- source expected supply assets;
- source Blue withdrawal capacity to the configured utilization ceiling; or
- the vault idle balance for an idle source.

Caps below live allocation use zero-floor subtraction. A source allocation is
only a non-zero gate; it does not bound deallocation assets.

## Greedy state transition

Discovery computes the largest obtainable call across vaults and sources,
applies it to cloned state, and repeats until no candidate remains. Market
sources are applied in contract order:

| State | market → market | idle → market |
| --- | --- | --- |
| source derived IDs | `+= sourceUntracked - assets` | unchanged |
| target derived IDs | `+= targetUntracked + assets` | same |
| source market/shares | withdraw first | unchanged |
| target market/shares | supply second | supply |
| vault idle balance | `+= penaltyAssets`, then `+= assets`, then `-= assets` | `+= penaltyAssets`, then `-= assets` |
| vault `_totalAssets` | first call accrues after penalty + deallocation; then frozen | first call accrues after penalty; then frozen |

Shared IDs are updated twice in that order. Penalties remain as direct vault
asset donations. The planner records them in the cloned idle balance but does
not recycle newly donated assets as another shared-liquidity source; otherwise
round-up dust could create a self-replenishing idle candidate. Source untracked
interest changes only the derived allocation IDs; it never becomes idle token
balance.

## Planner

`computeVaultV2Reallocations` uses the same operation algebra and target
utilization calculation as V1:

- borrow: `B' = B + amount`, `S' = S`;
- withdraw: `B' = B`, `S' = S - amount`.

If the post-operation utilization is at most the fixed 90% target, it returns
no calls. Otherwise it discovers friendly sources using the fixed 90% source
ceiling. If the operation would still have `borrow > supply`, it continues
from the friendly post-state with an internal 100% source ceiling. Both phases
ignore vaults above the configured `maxPenalty` threshold.

The flat calls are capped in discovery order to the required amount. Every
retained call keeps its configured `penalty`; its asset cost is recomputed from
the final capped `assets` amount. The planner throws:

- `ReallocationWithdrawExceedsMarketSupplyError` when a requested withdraw is
  impossible regardless of reallocations;
- `InsufficientSharedLiquidityError` when a fee-bearing partial plan cannot
  cover the operation's absolute liquidity shortfall.

## Validation and metrics

The existing `validateReallocations` validates the combined `BlueReallocation`
union. V2 penalties must be between zero and WAD (and therefore fit the
contract's `uint64`), and every call for the same explicit allocator-vault pair
must use one consistent penalty. A V2 market source is rejected whenever its
Blue market matches the target, regardless of adapter.

`VaultV2ReallocationData` exposes:

- `getPublicReallocationLiquidityVaultV2(...)`, which sums market and idle
  candidates; and
- `getAvailableLiquidityToUtilizationVaultV2(...)`, which uses the same
  target-utilization math as the V1 metric.

Idle is included by default because it is immediately reallocatable
liquidity.

## Alternatives rejected

### Group V2 calls by vault

Rejected because the contract accepts one source per call and charges one
penalty per call. A grouped SDK shape would require a second expansion model
and would obscure the exact transaction cost. Flat `VaultV2BlueReallocation`
is already accepted by the branch's Blue action builders.

### Add a V2 validator

Rejected because the action layer already consumes a discriminated V1/V2
union. One validator is the single source of truth for amount bounds, source
tags, and target-pair exclusion.

### Register a canonical allocator address

Rejected because there is no canonical per-chain deployment to register.
Identity is explicit in config data and action inputs.

### Copy V1's deprecated utilization options

Rejected. V2 starts at the intended fixed-policy end state: 90% friendly
source and target thresholds plus an internal 100% fallback.

## Compatibility and releases

- `getMarketPublicReallocations` delegates to
  `computeVaultV1Reallocations` and is marked deprecated.
- `VaultReallocation` aliases `VaultV1BlueReallocation` and is marked
  deprecated.
- `ReallocationData` and `InputReallocationData` alias
  `VaultV1ReallocationData` and `InputVaultV1ReallocationData`, respectively,
  and are marked deprecated.
- `computeReallocations` aliases `computeVaultV1Reallocations` and is marked
  deprecated.
- `BluePublicAllocatorReallocation` receives no alias because it was not part
  of the published surface relative to `origin/main`.
- The compatible `liquidity-sdk-viem` V1 type-name migration would be a patch
  in isolation. The new public Vault V2 loader makes this package a minor.
- The feature is minor for `morpho-ts`, `blue-sdk`, `blue-sdk-viem`,
  `morpho-sdk`, `liquidity-sdk-viem`, and
  `wdk-protocol-lending-morpho-evm`.
- `blue-sdk-viem` raises its `blue-sdk` peer range to the new minor.
- `liquidity-sdk-viem` raises its `blue-sdk`, `blue-sdk-viem`, `morpho-sdk`,
  and `morpho-ts` peer floors to the versions that introduce the V2 loader's
  runtime imports.

## Security and operational constraints

- A plan is a block-state simulation, not an execution guarantee. Allocator
  caps, shares, and market liquidity can be front-run.
- The user approves GeneralAdapter1 for the aggregate V2 penalty assets.
  `getRequirements()` emits a classic loan-token approval when needed;
  Bundler3 then grants the BluePublicAllocator an exact, non-skippable per-call
  allowance before each nonpayable allocator call.
- The calldata penalty protects against a curator changing the configured rate
  between transaction signing and execution: a mismatch reverts.
- The planner defaults to the latest `lastUpdate` in its snapshot. Loaders
  should pass the intended execution timestamp explicitly when simulating
  beyond that snapshot so every market and vault shares one reference point.
- Relative-cap arithmetic rounds down. Overstating by one wei can cause an
  on-chain revert.
- The upstream ABI and fork fixture must stay pinned to the same Vault V2
  revision; generated queries alone do not detect upstream drift.

## Dependencies

- `morpho-org/vault-v2` `BluePublicAllocator.sol` last-touch commit
  `a54e96c4cda93d5231df513f8e378653999c0e38` for the allocator interface and
  behavior described here.
- Existing `VaultV2MorphoMarketV1AdapterV2.ids`, `AccrualVaultV2`, Morpho Blue
  `Market`, and Bundler3 allocator encoders.
- Existing Anvil fork harness from `@morpho-org/test`.

## References

- [`BluePublicAllocator.sol`](https://github.com/morpho-org/vault-v2/blob/a54e96c4cda93d5231df513f8e378653999c0e38/src/periphery/blue-public-allocator/BluePublicAllocator.sol)
- [`VaultV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol)
- [`MorphoMarketV1AdapterV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/adapters/MorphoMarketV1AdapterV2.sol)
- [TIB-2026-06-16 shared-liquidity target-utilization metric](./TIB-2026-06-16-shared-liquidity-target-utilization-metric.md)
- `packages/morpho-sdk/src/entities/vaultV1ReallocationData.ts`
- `packages/morpho-sdk/src/entities/vaultV2ReallocationData.ts`
- `packages/morpho-sdk/src/helpers/computeVaultV1Reallocations.ts`
- `packages/blue-sdk/src/vault/v2/VaultV2Utils.ts`
- `packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2PublicAllocatorConfig.ts`
