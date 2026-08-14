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
import { computeBluePublicAllocatorPenaltyAssets } from "../helpers/bluePublicAllocator.js";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "../helpers/constant.js";
import type {
  VaultV2BluePublicAllocatorOptions,
  VaultV2BlueReallocation,
} from "../types/index.js";
import {
  InsufficientSharedLiquidityError,
  ReallocationAdapterSupplySharesUnderflowError,
  ReallocationAllocationUnderflowError,
  ReallocationWithdrawExceedsMarketSupplyError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
  UnknownReallocationVaultError,
} from "../types/index.js";

/** Input state required to simulate Vault V2 BluePublicAllocator reallocations. */
export interface InputVaultV2ReallocationData {
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
 * instance. The first allocation for each vault accrues it in contract order
 * after the penalty donation and any source deallocation, then freezes that
 * `_totalAssets` value as `firstTotalAssets` for the rest of the plan.
 *
 * @example
 * ```ts
 * import { VaultV2ReallocationData } from "@morpho-org/morpho-sdk/entities";
 *
 * const data = new VaultV2ReallocationData(input);
 * ```
 */
export class VaultV2ReallocationData implements InputVaultV2ReallocationData {
  /** Penalty donations created by this simulation, excluded as fresh shared-liquidity sources. */
  private readonly donatedPenaltyAssets: Record<Address, bigint>;
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
  public constructor(input: InputVaultV2ReallocationData) {
    this.chainId = input.chainId;
    this.allocator = input.allocator;
    this.markets = {};
    this.vaults = {};
    this.allocations = {};
    this.publicAllocatorConfigs = {};
    this.marketPublicAllocatorConfigs = {};
    this.donatedPenaltyAssets =
      input instanceof VaultV2ReallocationData
        ? { ...input.donatedPenaltyAssets }
        : {};

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
    return new VaultV2ReallocationData(this);
  }

  /**
   * Gets a market from this snapshot.
   *
   * @param marketId - Market id to read.
   * @returns The market state.
   * @throws {UnknownReallocationMarketError} when the market is absent.
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
   * @throws {UnknownReallocationVaultError} when the vault is absent.
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
   * @throws {UnknownReallocationAllocationError} when the record is absent.
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
   * @throws {UnknownReallocationPublicAllocatorConfigError} when it is absent.
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
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when it is absent.
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
   * @throws {UnknownReallocationAdapterError} when it is absent or unsupported.
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
   * candidate is exhausted. Vaults whose configured penalty exceeds
   * `options.maxPenalty` are ignored. Source markets are held below the
   * SDK's default withdrawal-utilization ceiling.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional timestamp, enable flag, vault allowlist, and maximum penalty.
   * @returns Flat action-ready reallocations and their post-simulation state.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * import { VaultV2ReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const data = new VaultV2ReallocationData(input);
   * const result = data.computeVaultV2Reallocations(targetMarketId, { timestamp });
   * ```
   */
  public computeVaultV2Reallocations(
    marketId: MarketId,
    options: VaultV2BluePublicAllocatorOptions = {},
  ) {
    return this.computeVaultV2ReallocationsAtUtilization({
      marketId,
      maxWithdrawalUtilization: DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      options,
    });
  }

  /**
   * Computes the action-ready Vault V2 reallocations required by a Blue borrow
   * or loan-asset withdrawal.
   *
   * Friendly liquidity is considered first. When it cannot cover the absolute
   * liquidity shortfall, the planner continues from that post-state up to 100%
   * source utilization. Fee-bearing partial plans are rejected.
   *
   * @param params - Operation and discovery parameters.
   * @param params.marketId - Target Blue market id.
   * @param params.operation - Operation driving the reallocation.
   * @param params.amount - Borrow or withdraw amount.
   * @param params.options - Optional timestamp, enable flag, vault allowlist, and maximum penalty.
   * @returns Flat Vault V2 reallocations accepted directly by Blue action builders.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the absolute shortfall.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdraw exceeds market supply.
   * @example
   * ```ts
   * const reallocations = data.computeVaultV2ReallocationsForOperation({
   *   marketId: targetMarketId,
   *   operation: "borrow",
   *   amount: 1_000_000n,
   *   options: { timestamp },
   * });
   * ```
   */
  public computeVaultV2ReallocationsForOperation({
    marketId,
    operation,
    amount,
    options,
  }: {
    readonly marketId: MarketId;
    readonly operation: "borrow" | "withdraw";
    readonly amount: bigint;
    readonly options?: VaultV2BluePublicAllocatorOptions;
  }): readonly VaultV2BlueReallocation[] {
    if (options?.enabled === false) return [];

    const timestamp =
      options?.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    const normalizedOptions = { ...options, timestamp };
    const market = this.getMarket(marketId).accrueInterest(timestamp);
    if (operation === "withdraw" && amount > market.totalSupplyAssets) {
      throw new ReallocationWithdrawExceedsMarketSupplyError({
        marketId,
        withdrawAmount: amount,
        totalSupplyAssets: market.totalSupplyAssets,
      });
    }

    const newTotalBorrowAssets =
      operation === "borrow"
        ? market.totalBorrowAssets + amount
        : market.totalBorrowAssets;
    const newTotalSupplyAssets =
      operation === "withdraw"
        ? market.totalSupplyAssets - amount
        : market.totalSupplyAssets;

    if (
      MarketUtils.getUtilization({
        totalSupplyAssets: newTotalSupplyAssets,
        totalBorrowAssets: newTotalBorrowAssets,
      }) <= DEFAULT_SUPPLY_TARGET_UTILIZATION
    )
      return [];

    let requiredAssets =
      MathLib.wDivUp(newTotalBorrowAssets, DEFAULT_SUPPLY_TARGET_UTILIZATION) -
      newTotalSupplyAssets;

    const friendly = this.computeVaultV2Reallocations(
      marketId,
      normalizedOptions,
    );
    const discovered = [...friendly.reallocations];
    const friendlyMarket = friendly.data.getMarket(marketId);
    const friendlyBorrow =
      operation === "borrow"
        ? friendlyMarket.totalBorrowAssets + amount
        : friendlyMarket.totalBorrowAssets;
    const friendlySupply =
      operation === "withdraw"
        ? friendlyMarket.totalSupplyAssets - amount
        : friendlyMarket.totalSupplyAssets;

    if (friendlyBorrow > friendlySupply) {
      requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;
      discovered.push(
        ...friendly.data.computeVaultV2ReallocationsAtUtilization({
          marketId,
          maxWithdrawalUtilization: MathLib.WAD,
          options: normalizedOptions,
        }).reallocations,
      );
    }

    if (requiredAssets <= 0n) return [];

    const absoluteShortfall =
      newTotalBorrowAssets > newTotalSupplyAssets
        ? newTotalBorrowAssets - newTotalSupplyAssets
        : 0n;
    const reallocations: VaultV2BlueReallocation[] = [];
    let remainingRequiredAssets = requiredAssets;
    let totalReallocated = 0n;

    for (const reallocation of discovered) {
      const assets = MathLib.min(reallocation.assets, remainingRequiredAssets);
      if (assets <= 0n) continue;

      reallocations.push({ ...reallocation, assets });
      remainingRequiredAssets -= assets;
      totalReallocated += assets;
      if (remainingRequiredAssets === 0n) break;
    }

    if (totalReallocated < absoluteShortfall) {
      throw new InsufficientSharedLiquidityError({
        marketId,
        shortfall: absoluteShortfall,
        available: totalReallocated,
      });
    }

    return reallocations;
  }

  private computeVaultV2ReallocationsAtUtilization({
    marketId,
    maxWithdrawalUtilization,
    options = {},
  }: {
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
    readonly options?: VaultV2BluePublicAllocatorOptions;
  }): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2ReallocationData;
  } {
    if (options.enabled === false) return { reallocations: [], data: this };

    this.getMarket(marketId);
    const timestamp =
      options.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    let data = this.accrueMarkets(timestamp);
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
            maxPenalty: options.maxPenalty,
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
   * @param options - Optional timestamp, enable flag, vault allowlist, and maximum penalty.
   * @returns Reallocatable market and idle assets, or `0n` when none are available.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getPublicReallocationLiquidityVaultV2(targetMarketId);
   * ```
   */
  public getPublicReallocationLiquidityVaultV2(
    marketId: MarketId,
    options?: VaultV2BluePublicAllocatorOptions,
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
   * @param options - Optional timestamp, enable flag, vault allowlist, and maximum penalty.
   * @returns Borrowable assets while remaining at or below `utilization`.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getAvailableLiquidityToUtilizationVaultV2(targetMarketId);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: mirrors the existing V1 metric API
  public getAvailableLiquidityToUtilizationVaultV2(
    marketId: MarketId,
    utilization: bigint = DEFAULT_SUPPLY_TARGET_UTILIZATION,
    options?: VaultV2BluePublicAllocatorOptions,
  ) {
    const timestamp =
      options?.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    const market = this.getMarket(marketId).accrueInterest(timestamp);
    if (DEFAULT_SUPPLY_TARGET_UTILIZATION > utilization)
      return market.getBorrowToUtilization(utilization);

    const availableLiquidity = this.getPublicReallocationLiquidityVaultV2(
      marketId,
      { ...options, timestamp },
    );
    return MarketUtils.getBorrowToUtilization(
      {
        totalSupplyAssets: market.totalSupplyAssets + availableLiquidity,
        totalBorrowAssets: market.totalBorrowAssets,
      },
      utilization,
    );
  }

  private getLatestSnapshotTimestamp() {
    let timestamp = 0n;
    for (const market of Object.values(this.markets)) {
      if (market != null) timestamp = MathLib.max(timestamp, market.lastUpdate);
    }
    for (const vault of Object.values(this.vaults)) {
      if (vault != null) timestamp = MathLib.max(timestamp, vault.lastUpdate);
    }
    return timestamp;
  }

  private accrueMarkets(timestamp: bigint) {
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
      for (const adapter of vault.accrualAdapters) {
        if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
          continue;
        adapter.markets = adapter.markets.map((market) =>
          data.getMarket(market.id),
        );
      }
      data.vaults[address] = vault;
    }

    return data;
  }

  private getLargestVaultReallocation({
    vaultAddress,
    marketId,
    maxWithdrawalUtilization,
    maxPenalty,
  }: {
    readonly vaultAddress: Address;
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
    readonly maxPenalty?: bigint;
  }) {
    const targetMarket = this.getMarket(marketId);
    return _try(() => {
      const vault = this.getVault(vaultAddress);
      const publicAllocatorConfig = this.getPublicAllocatorConfig(vaultAddress);
      if (
        !isAddressEqual(publicAllocatorConfig.allocator, this.allocator) ||
        !isAddressEqual(publicAllocatorConfig.vault, vaultAddress) ||
        (maxPenalty != null && publicAllocatorConfig.penalty > maxPenalty)
      )
        return;

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

        if (publicAllocatorConfig.canPullFromIdle) {
          const maxAssets = MathLib.min(
            MathLib.MAX_UINT_128,
            targetSupplyHeadroom,
            allocatorHeadroom,
            MathLib.zeroFloorSub(
              vault.assetBalance,
              this.donatedPenaltyAssets[vaultAddress] ?? 0n,
            ),
          );
          const reallocation = {
            allocator: this.allocator,
            type: "bluePublicAllocator",
            vault: vaultAddress,
            from: { type: "idle" },
            to: { adapter: targetContext.adapter.address },
            assets: maxAssets,
            penalty: publicAllocatorConfig.penalty,
          } satisfies VaultV2BlueReallocation;
          const assets = this.getMaxCapCompatibleAssets({
            reallocation,
            targetMarketId: marketId,
            timestamp: targetMarket.lastUpdate,
          });
          if (assets > 0n) {
            candidates.push({ ...reallocation, assets });
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
            if (sameMarketId(sourceMarket.id, marketId)) continue;

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
                !sourceConfig.canPullFromMarket
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
              const maxAssets = MathLib.min(
                MathLib.MAX_UINT_128,
                targetSupplyHeadroom,
                allocatorHeadroom,
                expectedSupplyAssets,
                sourceMarket.getWithdrawToUtilization(maxWithdrawalUtilization),
              );
              const reallocation = {
                allocator: this.allocator,
                type: "bluePublicAllocator",
                vault: vaultAddress,
                from: {
                  type: "market",
                  adapter: sourceAdapter.address,
                  marketParams: sourceMarket.params,
                },
                to: { adapter: targetContext.adapter.address },
                assets: maxAssets,
                penalty: publicAllocatorConfig.penalty,
              } satisfies VaultV2BlueReallocation;
              const assets = this.getMaxCapCompatibleAssets({
                reallocation,
                targetMarketId: marketId,
                timestamp: targetMarket.lastUpdate,
              });
              if (assets <= 0n) return;

              return { ...reallocation, assets };
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

  private getMaxCapCompatibleAssets({
    reallocation,
    targetMarketId,
    timestamp,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly targetMarketId: MarketId;
    readonly timestamp: bigint;
  }) {
    let lower = 0n;
    let upper = reallocation.assets;

    while (lower < upper) {
      const assets = (lower + upper + 1n) / 2n;
      const postState = this.applyPublicReallocation({
        reallocation: { ...reallocation, assets },
        targetMarketId,
        timestamp,
      });
      const vault = postState.getVault(reallocation.vault);
      const adapter = postState.getAdapter(
        reallocation.vault,
        reallocation.to.adapter,
      );
      const targetIds = adapter.ids(postState.getMarket(targetMarketId).params);
      const withinCaps = targetIds.every((id) => {
        const allocation = postState.getAllocation(reallocation.vault, id);
        const capacity = VaultV2Utils.allocationHeadroom(
          { ...allocation, allocation: 0n },
          vault._totalAssets,
        ).value;
        return allocation.absoluteCap > 0n && allocation.allocation <= capacity;
      });

      if (withinCaps) lower = assets;
      else upper = assets - 1n;
    }

    return lower;
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
    let vault = data.getVault(reallocation.vault);
    const targetMarket = data.getMarket(targetMarketId);

    const penaltyAssets = computeBluePublicAllocatorPenaltyAssets(
      reallocation.assets,
      reallocation.penalty,
    );
    vault.assetBalance += penaltyAssets;
    data.donatedPenaltyAssets[reallocation.vault] =
      (data.donatedPenaltyAssets[reallocation.vault] ?? 0n) + penaltyAssets;

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

    vault = vault.accrueInterest(timestamp).vault;
    data.vaults[reallocation.vault] = vault;

    const targetAdapter = data.getAdapter(
      reallocation.vault,
      reallocation.to.adapter,
    );
    const targetIds = targetAdapter.ids(targetMarket.params);

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

/**
 * Computes action-ready Vault V2 BluePublicAllocator reallocations for a Blue
 * borrow or loan-asset withdraw.
 *
 * @param params.reallocationData - Vault V2 reallocation state fetched at one block.
 * @param params.marketId - Target Blue market id.
 * @param params.operation - Operation driving the reallocation.
 * @param params.amount - Borrow or withdraw amount.
 * @param params.options - Optional timestamp, enable flag, vault allowlist, and maximum penalty.
 * @returns Flat Vault V2 reallocations accepted directly by Blue action builders.
 * @throws {UnknownReallocationMarketError} when the target market is absent.
 * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the absolute shortfall.
 * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdraw exceeds market supply.
 * @example
 * ```ts
 * import { Market, MarketParams } from "@morpho-org/blue-sdk";
 * import {
 *   computeVaultV2Reallocations,
 *   type VaultV2BlueReallocation,
 * } from "@morpho-org/morpho-sdk";
 * import { VaultV2ReallocationData } from "@morpho-org/morpho-sdk/entities";
 *
 * const timestamp = 1_700_000_000n;
 * const marketParams = new MarketParams({
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralToken: "0x0000000000000000000000000000000000000002",
 *   oracle: "0x0000000000000000000000000000000000000003",
 *   irm: "0x0000000000000000000000000000000000000004",
 *   lltv: 860_000_000_000_000_000n,
 * });
 * const market = new Market({
 *   params: marketParams,
 *   totalSupplyAssets: 1_000_000n,
 *   totalBorrowAssets: 500_000n,
 *   totalSupplyShares: 1_000_000n,
 *   totalBorrowShares: 500_000n,
 *   lastUpdate: timestamp,
 *   fee: 0n,
 * });
 * const reallocationData = new VaultV2ReallocationData({
 *   chainId: 1,
 *   allocator: "0x0000000000000000000000000000000000000005",
 *   markets: { [marketParams.id]: market },
 * });
 *
 * const reallocations: readonly VaultV2BlueReallocation[] =
 *   computeVaultV2Reallocations({
 *     reallocationData,
 *     marketId: marketParams.id,
 *     operation: "borrow",
 *     amount: 100_000n,
 *     options: { timestamp },
 *   });
 *
 * console.log(reallocations); // [] — projected utilization remains below 90%.
 * ```
 */
export const computeVaultV2Reallocations = ({
  reallocationData,
  ...params
}: {
  readonly reallocationData: VaultV2ReallocationData;
  readonly marketId: MarketId;
  readonly operation: "borrow" | "withdraw";
  readonly amount: bigint;
  readonly options?: VaultV2BluePublicAllocatorOptions;
}): readonly VaultV2BlueReallocation[] =>
  reallocationData.computeVaultV2ReallocationsForOperation(params);
