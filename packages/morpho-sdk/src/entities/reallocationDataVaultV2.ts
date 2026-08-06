import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type IVaultV2Allocation,
  Market,
  type MarketId,
  MarketUtils,
  MathLib,
  UnknownDataError,
  type VaultV2MarketPublicAllocatorConfig,
  type VaultV2PublicAllocatorConfig,
  VaultV2Utils,
} from "@morpho-org/blue-sdk";
import { _try, bigIntComparator } from "@morpho-org/morpho-ts";
import { type Address, type Hash, isAddressEqual } from "viem";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "../helpers/constant.js";
import type {
  PublicAllocatorOptionsVaultV2,
  ReallocationComputeOptionsVaultV2,
  VaultV2BlueReallocation,
} from "../types/index.js";
import {
  ReallocationAdapterSupplySharesUnderflowError,
  ReallocationAllocationUnderflowError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
  UnknownReallocationVaultError,
} from "../types/index.js";

/** Input state required to simulate Vault V2 BluePublicAllocator reallocations. */
export interface InputReallocationDataVaultV2 {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;
  /** Explicit BluePublicAllocator contract used by every returned call. */
  readonly allocator: Address;
  /** Markets indexed by market id. */
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;
  /** Accrued Vault V2 entities indexed by vault address. */
  readonly vaults?: Readonly<Record<Address, AccrualVaultV2 | undefined>>;
  /** Vault cap state indexed by vault address and derived allocation id. */
  readonly allocations?: Readonly<
    Record<
      Address,
      Readonly<Record<Hash, IVaultV2Allocation | undefined>> | undefined
    >
  >;
  /** Vault-wide BluePublicAllocator configuration indexed by vault address. */
  readonly publicAllocatorConfigs?: Readonly<
    Record<Address, VaultV2PublicAllocatorConfig | undefined>
  >;
  /** Adapter-market BluePublicAllocator configuration indexed by vault and `marketParamsId`. */
  readonly marketPublicAllocatorConfigs?: Readonly<
    Record<
      Address,
      | Readonly<Record<Hash, VaultV2MarketPublicAllocatorConfig | undefined>>
      | undefined
    >
  >;
}

type TargetContext = {
  readonly adapter: AccrualVaultV2MorphoMarketV1AdapterV2;
  readonly ids: readonly [Hash, Hash, Hash];
  readonly allocations: readonly IVaultV2Allocation[];
  readonly marketPublicAllocatorConfig: VaultV2MarketPublicAllocatorConfig;
  readonly untracked: bigint;
};

const sameMarketId = (left: MarketId, right: MarketId) =>
  left.toLowerCase() === right.toLowerCase();

const cloneMarket = (market: Market) => new Market({ ...market });

const cloneAdapter = (adapter: AccrualVaultV2MorphoMarketV1AdapterV2) =>
  new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: adapter.address,
      parentVault: adapter.parentVault,
      skimRecipient: adapter.skimRecipient,
      marketIds: [...adapter.marketIds],
      adaptiveCurveIrm: adapter.adaptiveCurveIrm,
      supplyShares: { ...adapter.supplyShares },
    },
    adapter.markets.map(cloneMarket),
  );

const cloneVault = (vault: AccrualVaultV2) => {
  const adapters = vault.accrualAdapters.map((adapter) =>
    adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
      ? cloneAdapter(adapter)
      : adapter,
  );
  const liquidityAdapter =
    vault.accrualLiquidityAdapter == null
      ? undefined
      : (adapters.find((adapter) =>
          isAddressEqual(
            adapter.address,
            vault.accrualLiquidityAdapter!.address,
          ),
        ) ?? vault.accrualLiquidityAdapter);

  return new AccrualVaultV2(
    {
      ...vault,
      liquidityAllocations: vault.liquidityAllocations?.map((allocation) => ({
        ...allocation,
      })),
    },
    liquidityAdapter,
    adapters,
    vault.assetBalance,
    { ...vault.forceDeallocatePenalties },
  );
};

/**
 * Immutable-by-convention state container for Vault V2 BluePublicAllocator simulations.
 *
 * Constructor inputs are cloned. Every simulated reallocation returns a new
 * instance, while `firstTotalAssets` is represented by each accrued vault's
 * frozen `_totalAssets` value for the duration of a plan.
 *
 * @example
 * ```ts
 * import { ReallocationDataVaultV2 } from "@morpho-org/morpho-sdk/entities";
 *
 * const data = new ReallocationDataVaultV2(input);
 * ```
 */
export class ReallocationDataVaultV2 implements InputReallocationDataVaultV2 {
  /** Chain id associated with this snapshot. */
  public readonly chainId: number;
  /** Explicit BluePublicAllocator address used in returned calls. */
  public readonly allocator: Address;
  /** Markets indexed by market id. */
  public readonly markets: Record<MarketId, Market | undefined>;
  /** Vault V2 entities indexed by address. */
  public readonly vaults: Record<Address, AccrualVaultV2 | undefined>;
  /** Vault cap state indexed by vault and derived allocation id. */
  public readonly allocations: Record<
    Address,
    Record<Hash, IVaultV2Allocation | undefined> | undefined
  >;
  /** Vault-wide allocator configuration indexed by vault. */
  public readonly publicAllocatorConfigs: Record<
    Address,
    VaultV2PublicAllocatorConfig | undefined
  >;
  /** Adapter-market allocator configuration indexed by vault and market-params id. */
  public readonly marketPublicAllocatorConfigs: Record<
    Address,
    Record<Hash, VaultV2MarketPublicAllocatorConfig | undefined> | undefined
  >;

  /**
   * Creates a cloned Vault V2 reallocation snapshot.
   *
   * @param input - State fetched at one consistent block.
   */
  public constructor(input: InputReallocationDataVaultV2) {
    this.chainId = input.chainId;
    this.allocator = input.allocator;
    this.markets = {};
    this.vaults = {};
    this.allocations = {};
    this.publicAllocatorConfigs = {};
    this.marketPublicAllocatorConfigs = {};

    for (const [marketId, market] of Object.entries(input.markets ?? {}) as [
      MarketId,
      Market | undefined,
    ][]) {
      this.markets[marketId] = market == null ? undefined : cloneMarket(market);
    }

    for (const [address, vault] of Object.entries(input.vaults ?? {}) as [
      Address,
      AccrualVaultV2 | undefined,
    ][]) {
      const clonedVault = vault == null ? undefined : cloneVault(vault);
      this.vaults[address] = clonedVault;

      for (const adapter of clonedVault?.accrualAdapters ?? []) {
        if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
          continue;
        for (const market of adapter.markets) {
          this.markets[market.id] ??= cloneMarket(market);
        }
      }
    }

    for (const [vault, allocations] of Object.entries(
      input.allocations ?? {},
    ) as [
      Address,
      Readonly<Record<Hash, IVaultV2Allocation | undefined>> | undefined,
    ][]) {
      this.allocations[vault] = {};
      for (const [id, allocation] of Object.entries(allocations ?? {}) as [
        Hash,
        IVaultV2Allocation | undefined,
      ][]) {
        this.allocations[vault]![id] =
          allocation == null ? undefined : { ...allocation };
      }
    }

    for (const [vault, config] of Object.entries(
      input.publicAllocatorConfigs ?? {},
    ) as [Address, VaultV2PublicAllocatorConfig | undefined][]) {
      this.publicAllocatorConfigs[vault] =
        config == null ? undefined : { ...config };
    }

    for (const [vault, configs] of Object.entries(
      input.marketPublicAllocatorConfigs ?? {},
    ) as [
      Address,
      (
        | Readonly<Record<Hash, VaultV2MarketPublicAllocatorConfig | undefined>>
        | undefined
      ),
    ][]) {
      this.marketPublicAllocatorConfigs[vault] = {};
      for (const [id, config] of Object.entries(configs ?? {}) as [
        Hash,
        VaultV2MarketPublicAllocatorConfig | undefined,
      ][]) {
        this.marketPublicAllocatorConfigs[vault]![id] =
          config == null ? undefined : { ...config };
      }
    }
  }

  /**
   * Clones the complete simulation snapshot.
   *
   * @returns A deep clone of this simulation state.
   * @example
   * ```ts
   * const next = data.clone();
   * ```
   */
  public clone() {
    return new ReallocationDataVaultV2(this);
  }

  /**
   * Gets a market from this snapshot.
   *
   * @param marketId - Market id to read.
   * @returns The market state.
   * @throws {@link UnknownReallocationMarketError} when the market is absent.
   * @example
   * ```ts
   * const market = data.getMarket(marketId);
   * ```
   */
  public getMarket(marketId: MarketId) {
    const market = this.markets[marketId];
    if (market == null) throw new UnknownReallocationMarketError(marketId);
    return market;
  }

  /**
   * Gets a Vault V2 from this snapshot.
   *
   * @param vault - Vault V2 address.
   * @returns The accrued Vault V2 state.
   * @throws {@link UnknownReallocationVaultError} when the vault is absent.
   * @example
   * ```ts
   * const vault = data.getVault(vaultAddress);
   * ```
   */
  public getVault(vault: Address) {
    const data = this.vaults[vault];
    if (data == null) throw new UnknownReallocationVaultError(vault);
    return data;
  }

  /**
   * Gets one Vault V2 allocation record.
   *
   * @param vault - Vault V2 address.
   * @param id - Derived allocation id.
   * @returns The allocation and cap state.
   * @throws {@link UnknownReallocationAllocationError} when the record is absent.
   * @example
   * ```ts
   * const allocation = data.getAllocation(vaultAddress, allocationId);
   * ```
   */
  public getAllocation(vault: Address, id: Hash) {
    const allocation = this.allocations[vault]?.[id];
    if (allocation == null)
      throw new UnknownReallocationAllocationError(vault, id);
    return allocation;
  }

  /**
   * Gets one vault-wide BluePublicAllocator configuration.
   *
   * @param vault - Vault V2 address.
   * @returns The vault-wide allocator configuration.
   * @throws {@link UnknownReallocationPublicAllocatorConfigError} when it is absent.
   * @example
   * ```ts
   * const config = data.getPublicAllocatorConfig(vaultAddress);
   * ```
   */
  public getPublicAllocatorConfig(vault: Address) {
    const config = this.publicAllocatorConfigs[vault];
    if (config == null)
      throw new UnknownReallocationPublicAllocatorConfigError(vault);
    return config;
  }

  /**
   * Gets one adapter-market BluePublicAllocator configuration.
   *
   * @param vault - Vault V2 address.
   * @param marketParamsId - Adapter-scoped market-parameters id.
   * @returns The allocator cap and permissions.
   * @throws {@link UnknownReallocationMarketPublicAllocatorConfigError} when it is absent.
   * @example
   * ```ts
   * const config = data.getMarketPublicAllocatorConfig(vaultAddress, marketParamsId);
   * ```
   */
  public getMarketPublicAllocatorConfig(vault: Address, marketParamsId: Hash) {
    const config = this.marketPublicAllocatorConfigs[vault]?.[marketParamsId];
    if (config == null)
      throw new UnknownReallocationMarketPublicAllocatorConfigError(
        vault,
        marketParamsId,
      );
    return config;
  }

  /**
   * Gets a supported MorphoMarketV1AdapterV2 from a Vault V2.
   *
   * @param vault - Vault V2 address.
   * @param adapter - Adapter address.
   * @returns The accrued adapter state.
   * @throws {@link UnknownReallocationAdapterError} when it is absent or unsupported.
   * @example
   * ```ts
   * const adapter = data.getAdapter(vaultAddress, adapterAddress);
   * ```
   */
  public getAdapter(vault: Address, adapter: Address) {
    const data = this.getVault(vault).accrualAdapters.find(
      (candidate): candidate is AccrualVaultV2MorphoMarketV1AdapterV2 =>
        candidate instanceof AccrualVaultV2MorphoMarketV1AdapterV2 &&
        isAddressEqual(candidate.address, adapter),
    );
    if (data == null) throw new UnknownReallocationAdapterError(vault, adapter);
    return data;
  }

  /**
   * Computes every friendly Vault V2 BluePublicAllocator call currently
   * available for a target market.
   *
   * The algorithm ranks action-ready calls by obtainable assets, includes idle
   * liquidity, applies each winner to cloned state, and stops when every
   * candidate is exhausted. Source markets are held below the SDK's default
   * withdrawal-utilization ceiling.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional timestamp, enable flag, and vault allowlist.
   * @returns Flat action-ready reallocations and their post-simulation state.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * import { ReallocationDataVaultV2 } from "@morpho-org/morpho-sdk/entities";
   *
   * const data = new ReallocationDataVaultV2(input);
   * const result = data.computeVaultV2Reallocations(targetMarketId, { timestamp });
   * ```
   */
  public computeVaultV2Reallocations(
    marketId: MarketId,
    options: PublicAllocatorOptionsVaultV2 = {},
  ) {
    return this._computeVaultV2Reallocations({
      marketId,
      maxWithdrawalUtilization: DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      options,
    });
  }

  /**
   * Computes Vault V2 reallocations using an explicit internal source-utilization ceiling.
   *
   * @param marketId - Target market id.
   * @param maxWithdrawalUtilization - Source-market utilization ceiling.
   * @param options - Discovery options.
   * @returns Flat action-ready reallocations and post-simulation state.
   * @internal
   */
  public _computeVaultV2Reallocations({
    marketId,
    maxWithdrawalUtilization,
    options = {},
  }: {
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
    readonly options?: PublicAllocatorOptionsVaultV2;
  }): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: ReallocationDataVaultV2;
  } {
    if (options.enabled === false) return { reallocations: [], data: this };

    const timestamp = BigInt(
      options.timestamp ?? this.getMarket(marketId).lastUpdate,
    );
    let data = this.accrue(timestamp);
    const reallocations: VaultV2BlueReallocation[] = [];
    const configuredVaults = Object.keys(data.vaults) as Address[];
    const vaultKeyByLower = new Map(
      configuredVaults.map((vault) => [vault.toLowerCase(), vault]),
    );
    const vaults = Array.from(
      new Set(
        (options.reallocatableVaults ?? configuredVaults)
          .map((vault) => vaultKeyByLower.get(vault.toLowerCase()))
          .filter((vault): vault is Address => vault != null),
      ),
    );

    while (true) {
      const candidates = vaults
        .map((vault) =>
          data.getLargestVaultReallocation({
            vaultAddress: vault,
            marketId,
            maxWithdrawalUtilization,
          }),
        )
        .filter(
          (candidate): candidate is VaultV2BlueReallocation =>
            candidate != null,
        )
        .sort(bigIntComparator(({ assets }) => assets, "desc"));

      const largest = candidates[0];
      if (largest == null) return { reallocations, data };

      reallocations.push(largest);
      data = data.applyPublicReallocation({
        reallocation: largest,
        targetMarketId: marketId,
        timestamp,
      });
    }
  }

  /**
   * Sums friendly Vault V2 shared liquidity available to a target market.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional timestamp, enable flag, and vault allowlist.
   * @returns Reallocatable market and idle assets, or `0n` when none are available.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getPublicReallocationLiquidityVaultV2(targetMarketId);
   * ```
   */
  public getPublicReallocationLiquidityVaultV2(
    marketId: MarketId,
    options?: PublicAllocatorOptionsVaultV2,
  ) {
    return this.computeVaultV2Reallocations(
      marketId,
      options,
    ).reallocations.reduce((total, { assets }) => total + assets, 0n);
  }

  /**
   * Computes borrow liquidity to a target utilization, including friendly
   * Vault V2 public reallocations.
   *
   * @param marketId - Target Blue market id.
   * @param utilization - Desired utilization, scaled by WAD. Defaults to 90%.
   * @param options - Optional timestamp, enable flag, and vault allowlist.
   * @returns Borrowable assets while remaining at or below `utilization`.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getAvailableLiquidityToUtilizationVaultV2(targetMarketId);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: mirrors the existing V1 metric API
  public getAvailableLiquidityToUtilizationVaultV2(
    marketId: MarketId,
    utilization: bigint = DEFAULT_SUPPLY_TARGET_UTILIZATION,
    options?: ReallocationComputeOptionsVaultV2,
  ) {
    const market = this.getMarket(marketId).accrueInterest(options?.timestamp);
    if (DEFAULT_SUPPLY_TARGET_UTILIZATION > utilization)
      return market.getBorrowToUtilization(utilization);

    const availableLiquidity = this.getPublicReallocationLiquidityVaultV2(
      marketId,
      options,
    );
    return MarketUtils.getBorrowToUtilization(
      {
        totalSupplyAssets: market.totalSupplyAssets + availableLiquidity,
        totalBorrowAssets: market.totalBorrowAssets,
      },
      utilization,
    );
  }

  private accrue(timestamp: bigint) {
    const data = this.clone();

    for (const [marketId, market] of Object.entries(data.markets) as [
      MarketId,
      Market | undefined,
    ][]) {
      if (market != null)
        data.markets[marketId] = market.accrueInterest(timestamp);
    }

    for (const [address, vault] of Object.entries(data.vaults) as [
      Address,
      AccrualVaultV2 | undefined,
    ][]) {
      if (vault == null) continue;
      const accruedVault = vault.accrueInterest(timestamp).vault;
      for (const adapter of accruedVault.accrualAdapters) {
        if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
          continue;
        adapter.markets = adapter.markets.map((market) =>
          data.getMarket(market.id),
        );
      }
      data.vaults[address] = accruedVault;
    }

    return data;
  }

  private getLargestVaultReallocation({
    vaultAddress,
    marketId,
    maxWithdrawalUtilization,
  }: {
    readonly vaultAddress: Address;
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
  }) {
    return _try(() => {
      const vault = this.getVault(vaultAddress);
      const publicAllocatorConfig = this.getPublicAllocatorConfig(vaultAddress);
      if (
        !isAddressEqual(publicAllocatorConfig.allocator, this.allocator) ||
        !isAddressEqual(publicAllocatorConfig.vault, vaultAddress)
      )
        return;

      const targetMarket = this.getMarket(marketId);
      const targetSupplyHeadroom = MathLib.zeroFloorSub(
        MathLib.MAX_UINT_128,
        targetMarket.totalSupplyAssets,
      );
      const candidates: VaultV2BlueReallocation[] = [];

      for (const adapter of vault.accrualAdapters) {
        if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
          continue;
        if (!isAddressEqual(adapter.parentVault, vaultAddress)) continue;
        if (
          !isAddressEqual(targetMarket.params.loanToken, vault.asset) ||
          !isAddressEqual(targetMarket.params.irm, adapter.adaptiveCurveIrm)
        )
          continue;
        if (
          !adapter.markets.some((market) => sameMarketId(market.id, marketId))
        )
          continue;

        const targetContext = _try((): TargetContext | undefined => {
          const ids = adapter.ids(targetMarket.params);
          const marketPublicAllocatorConfig =
            this.getMarketPublicAllocatorConfig(vaultAddress, ids[2]);
          if (
            !isAddressEqual(
              marketPublicAllocatorConfig.allocator,
              this.allocator,
            ) ||
            !isAddressEqual(marketPublicAllocatorConfig.vault, vaultAddress) ||
            !isAddressEqual(
              marketPublicAllocatorConfig.adapter,
              adapter.address,
            ) ||
            !marketPublicAllocatorConfig.isActiveAdapter
          )
            return;

          const allocations = ids.map((id) =>
            this.getAllocation(vaultAddress, id),
          );
          if (allocations.some(({ absoluteCap }) => absoluteCap === 0n)) return;

          const expectedSupplyAssets = targetMarket.toSupplyAssets(
            adapter.supplyShares[marketId] ?? 0n,
          );
          const untracked = MathLib.zeroFloorSub(
            expectedSupplyAssets,
            allocations[2]!.allocation,
          );

          return {
            adapter,
            ids,
            allocations,
            marketPublicAllocatorConfig,
            untracked,
          };
        }, UnknownDataError);
        if (targetContext == null) continue;

        const targetMarketParamsAllocation = targetContext.allocations[2]!;
        const allocatorHeadroom = MathLib.zeroFloorSub(
          targetContext.marketPublicAllocatorConfig.absoluteCap,
          targetMarketParamsAllocation.allocation + targetContext.untracked,
        );

        const getTargetCapHeadroom = (
          sourceIds: ReadonlySet<Hash>,
          sourceUntracked: bigint,
        ) => {
          let headroom = MathLib.MAX_UINT_256;
          for (const [
            index,
            allocation,
          ] of targetContext.allocations.entries()) {
            const id = targetContext.ids[index]!;
            if (sourceIds.has(id)) {
              const postAllocation =
                allocation.allocation +
                sourceUntracked +
                targetContext.untracked;
              const capacity = VaultV2Utils.allocationHeadroom(
                allocation,
                vault._totalAssets,
              );
              if (postAllocation > allocation.allocation + capacity.value)
                return;
              continue;
            }

            headroom = MathLib.min(
              headroom,
              MathLib.zeroFloorSub(
                VaultV2Utils.allocationHeadroom(allocation, vault._totalAssets)
                  .value,
                targetContext.untracked,
              ),
            );
          }
          return headroom;
        };

        if (publicAllocatorConfig.canAllocateFromIdle) {
          const targetHeadroom = getTargetCapHeadroom(new Set(), 0n);
          if (targetHeadroom != null) {
            const assets = MathLib.min(
              MathLib.MAX_UINT_128,
              targetSupplyHeadroom,
              allocatorHeadroom,
              targetHeadroom,
              vault.assetBalance,
            );
            if (assets > 0n) {
              candidates.push({
                allocator: this.allocator,
                type: "bluePublicAllocator",
                vault: vaultAddress,
                from: { type: "idle" },
                to: { adapter: targetContext.adapter.address },
                assets,
                nativePenalty: publicAllocatorConfig.nativePenalty,
              });
            }
          }
        }

        for (const sourceAdapter of vault.accrualAdapters) {
          if (!(sourceAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
            continue;
          if (!isAddressEqual(sourceAdapter.parentVault, vaultAddress))
            continue;

          for (const sourceMarketReference of sourceAdapter.markets) {
            const sourceMarket = this.getMarket(sourceMarketReference.id);
            if (
              !isAddressEqual(sourceMarket.params.loanToken, vault.asset) ||
              !isAddressEqual(
                sourceMarket.params.irm,
                sourceAdapter.adaptiveCurveIrm,
              )
            )
              continue;
            if (
              sameMarketId(sourceMarket.id, marketId) &&
              isAddressEqual(
                sourceAdapter.address,
                targetContext.adapter.address,
              )
            )
              continue;

            const candidate = _try(() => {
              const sourceIds = sourceAdapter.ids(sourceMarket.params);
              const sourceConfig = this.getMarketPublicAllocatorConfig(
                vaultAddress,
                sourceIds[2],
              );
              if (
                !isAddressEqual(sourceConfig.allocator, this.allocator) ||
                !isAddressEqual(sourceConfig.vault, vaultAddress) ||
                !isAddressEqual(sourceConfig.adapter, sourceAdapter.address) ||
                !sourceConfig.isActiveAdapter ||
                !sourceConfig.canDeallocate
              )
                return;

              const sourceAllocations = sourceIds.map((id) =>
                this.getAllocation(vaultAddress, id),
              );
              if (sourceAllocations.some(({ allocation }) => allocation === 0n))
                return;

              const expectedSupplyAssets = sourceMarket.toSupplyAssets(
                sourceAdapter.supplyShares[sourceMarket.id] ?? 0n,
              );
              const sourceUntracked = MathLib.zeroFloorSub(
                expectedSupplyAssets,
                sourceAllocations[2]!.allocation,
              );
              const targetHeadroom = getTargetCapHeadroom(
                new Set(sourceIds),
                sourceUntracked,
              );
              if (targetHeadroom == null) return;

              const assets = MathLib.min(
                MathLib.MAX_UINT_128,
                sameMarketId(sourceMarket.id, marketId)
                  ? MathLib.MAX_UINT_128
                  : targetSupplyHeadroom,
                allocatorHeadroom,
                targetHeadroom,
                expectedSupplyAssets,
                sourceMarket.getWithdrawToUtilization(maxWithdrawalUtilization),
              );
              if (assets <= 0n) return;

              return {
                allocator: this.allocator,
                type: "bluePublicAllocator",
                vault: vaultAddress,
                from: {
                  type: "market",
                  adapter: sourceAdapter.address,
                  marketParams: sourceMarket.params,
                },
                to: { adapter: targetContext.adapter.address },
                assets,
                nativePenalty: publicAllocatorConfig.nativePenalty,
              } satisfies VaultV2BlueReallocation;
            }, UnknownDataError);
            if (candidate != null) candidates.push(candidate);
          }
        }
      }

      return candidates.sort(
        bigIntComparator(({ assets }) => assets, "desc"),
      )[0];
    }, UnknownDataError);
  }

  private applyPublicReallocation({
    reallocation,
    targetMarketId,
    timestamp,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly targetMarketId: MarketId;
    readonly timestamp: bigint;
  }) {
    const data = this.clone();
    const vault = data.getVault(reallocation.vault);
    const targetAdapter = data.getAdapter(
      reallocation.vault,
      reallocation.to.adapter,
    );
    const targetMarket = data.getMarket(targetMarketId);
    const targetIds = targetAdapter.ids(targetMarket.params);

    if (reallocation.from.type === "market") {
      const sourceAdapter = data.getAdapter(
        reallocation.vault,
        reallocation.from.adapter,
      );
      const sourceMarket = data.getMarket(reallocation.from.marketParams.id);
      const sourceIds = sourceAdapter.ids(sourceMarket.params);
      const currentSupplyShares =
        sourceAdapter.supplyShares[sourceMarket.id] ?? 0n;
      const withdrawal = sourceMarket.withdraw(
        reallocation.assets,
        0n,
        timestamp,
      );
      if (withdrawal.shares > currentSupplyShares) {
        throw new ReallocationAdapterSupplySharesUnderflowError({
          vault: reallocation.vault,
          adapter: sourceAdapter.address,
          marketId: sourceMarket.id,
          supplyShares: currentSupplyShares,
          withdrawnShares: withdrawal.shares,
        });
      }
      sourceAdapter.supplyShares[sourceMarket.id] =
        currentSupplyShares - withdrawal.shares;
      data.markets[sourceMarket.id] = withdrawal.market;
      data.setAdapterMarket(sourceAdapter, withdrawal.market);
      const sourceChange =
        withdrawal.market.toSupplyAssets(
          sourceAdapter.supplyShares[sourceMarket.id] ?? 0n,
        ) - data.getAllocation(reallocation.vault, sourceIds[2]).allocation;
      for (const id of sourceIds) {
        data.addAllocationChange({
          vault: reallocation.vault,
          id,
          change: sourceChange,
        });
      }
      vault.assetBalance += reallocation.assets;
    }

    const currentTargetMarket = data.getMarket(targetMarket.id);
    const oldTargetAllocation = data.getAllocation(
      reallocation.vault,
      targetIds[2],
    ).allocation;
    const supply = currentTargetMarket.supply(
      reallocation.assets,
      0n,
      timestamp,
    );
    const targetSupplyShares =
      (targetAdapter.supplyShares[targetMarket.id] ?? 0n) + supply.shares;
    targetAdapter.supplyShares[targetMarket.id] = targetSupplyShares;
    data.markets[targetMarket.id] = supply.market;
    data.setAdapterMarket(targetAdapter, supply.market);

    const targetChange =
      supply.market.toSupplyAssets(targetSupplyShares) - oldTargetAllocation;
    for (const id of targetIds) {
      data.addAllocationChange({
        vault: reallocation.vault,
        id,
        change: targetChange,
      });
    }

    vault.assetBalance -= reallocation.assets;
    return data;
  }

  private addAllocationChange({
    vault,
    id,
    change,
  }: {
    readonly vault: Address;
    readonly id: Hash;
    readonly change: bigint;
  }) {
    const allocation = this.getAllocation(vault, id);
    const nextAllocation = allocation.allocation + change;
    if (nextAllocation < 0n) {
      throw new ReallocationAllocationUnderflowError({
        vault,
        id,
        allocation: allocation.allocation,
        change,
      });
    }
    this.allocations[vault]![id] = {
      ...allocation,
      allocation: nextAllocation,
    };
  }

  private setAdapterMarket(
    adapter: AccrualVaultV2MorphoMarketV1AdapterV2,
    market: Market,
  ) {
    const index = adapter.markets.findIndex((candidate) =>
      sameMarketId(candidate.id, market.id),
    );
    if (index >= 0) adapter.markets[index] = market;
  }
}
