import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  type IAccrualVaultV2Adapter,
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
  VaultV2BluePublicAllocatorOptions,
  VaultV2BlueReallocation,
} from "../types/index.js";
import {
  InsufficientSharedLiquidityError,
  NonPositiveInputError,
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
export interface InputVaultV2BlueReallocationData {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;
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
  /**
   * BluePublicAllocator-active adapters indexed by vault address.
   * Arrays, readonly arrays, sets, and other iterables are accepted and normalized to sets.
   */
  readonly activeAdapters?: Readonly<
    Record<Address, Iterable<Address> | undefined>
  >;
  /** Adapter-market BluePublicAllocator configuration indexed by vault and `adapterMarketCapId`. */
  readonly marketPublicAllocatorConfigs?: Readonly<
    Record<
      Address,
      | Readonly<Record<Hash, VaultV2MarketPublicAllocatorConfig | undefined>>
      | undefined
    >
  >;
}

const cloneMarket = (market: Market) => new Market({ ...market });

const getCanonicalMarket = (
  markets: Record<MarketId, Market | undefined>,
  market: Market,
) => (markets[market.id] ??= cloneMarket(market));

const clonePosition = (
  position: AccrualPosition,
  markets: Record<MarketId, Market | undefined>,
) =>
  new AccrualPosition(position, getCanonicalMarket(markets, position.market));

const cloneAccrualVault = (
  vault: AccrualVault,
  markets: Record<MarketId, Market | undefined>,
) =>
  new AccrualVault(
    {
      ...vault,
      pendingTimelock: { ...vault.pendingTimelock },
      pendingGuardian: { ...vault.pendingGuardian },
      supplyQueue: [...vault.supplyQueue],
      publicAllocatorConfig:
        vault.publicAllocatorConfig == null
          ? undefined
          : { ...vault.publicAllocatorConfig },
    },
    [...vault.allocations.values()].map(({ config, position }) => ({
      config: {
        ...config,
        pendingCap: { ...config.pendingCap },
        publicAllocatorConfig:
          config.publicAllocatorConfig == null
            ? undefined
            : { ...config.publicAllocatorConfig },
      },
      position: clonePosition(position, markets),
    })),
  );

const cloneAdapter = (
  adapter: IAccrualVaultV2Adapter,
  markets: Record<MarketId, Market | undefined>,
) => {
  const base = {
    address: adapter.address,
    parentVault: adapter.parentVault,
    skimRecipient: adapter.skimRecipient,
  };

  if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)
    return new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...base,
        marketIds: [...adapter.marketIds],
        adaptiveCurveIrm: adapter.adaptiveCurveIrm,
        supplyShares: { ...adapter.supplyShares },
      },
      // V2 adapters can retain the canonical instance directly, so every
      // adapter observes the same global Morpho market state.
      adapter.markets.map((market) => getCanonicalMarket(markets, market)),
    );

  if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter)
    return new AccrualVaultV2MorphoMarketV1Adapter(
      { ...base, marketParamsList: [...adapter.marketParamsList] },
      adapter.positions.map((position) => clonePosition(position, markets)),
    );

  if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter)
    return new AccrualVaultV2MorphoVaultV1Adapter(
      { ...base, morphoVaultV1: adapter.morphoVaultV1 },
      cloneAccrualVault(adapter.accrualVaultV1, markets),
      adapter.shares,
    );

  return adapter;
};

const cloneVault = (
  vault: AccrualVaultV2,
  markets: Record<MarketId, Market | undefined>,
) => {
  const adapters = vault.accrualAdapters.map((adapter) =>
    cloneAdapter(adapter, markets),
  );
  const liquidityAdapter =
    vault.accrualLiquidityAdapter == null
      ? undefined
      : (adapters.find((adapter) =>
          isAddressEqual(
            adapter.address,
            vault.accrualLiquidityAdapter!.address,
          ),
        ) ?? cloneAdapter(vault.accrualLiquidityAdapter, markets));

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
 * import { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
 *
 * const data = new VaultV2BlueReallocationData(input);
 * ```
 */
export class VaultV2BlueReallocationData
  implements InputVaultV2BlueReallocationData
{
  /** Penalty donations created by this simulation, excluded as fresh shared-liquidity sources. */
  private readonly donatedPenaltyAssets: Record<Address, bigint>;
  /** Transaction-frozen cap denominator for each vault touched by this plan. */
  private readonly firstTotalAssets: Record<Address, bigint>;
  /** Chain id associated with this snapshot. */
  public readonly chainId: number;
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
  /** BluePublicAllocator-active adapters indexed by vault address. */
  public readonly activeAdapters: Record<
    Address,
    ReadonlySet<Address> | undefined
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
  public constructor(input: InputVaultV2BlueReallocationData) {
    this.chainId = input.chainId;
    this.markets = {};
    this.vaults = {};
    this.allocations = {};
    this.publicAllocatorConfigs = {};
    this.activeAdapters = {};
    this.marketPublicAllocatorConfigs = {};
    this.donatedPenaltyAssets =
      input instanceof VaultV2BlueReallocationData
        ? { ...input.donatedPenaltyAssets }
        : {};
    this.firstTotalAssets =
      input instanceof VaultV2BlueReallocationData
        ? { ...input.firstTotalAssets }
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
      const clonedVault =
        vault == null ? undefined : cloneVault(vault, this.markets);
      this.vaults[address] = clonedVault;
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

    for (const [vault, adapters] of Object.entries(
      input.activeAdapters ?? {},
    ) as [Address, Iterable<Address> | undefined][]) {
      this.activeAdapters[vault] =
        adapters == null ? undefined : new Set(adapters);
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
    return new VaultV2BlueReallocationData(this);
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
   * @param adapterMarketCapId - Adapter-scoped market cap id.
   * @returns The allocator cap and permissions.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when it is absent.
   * @example
   * ```ts
   * const config = data.getMarketPublicAllocatorConfig(vaultAddress, adapterMarketCapId);
   * ```
   */
  public getMarketPublicAllocatorConfig(
    vault: Address,
    adapterMarketCapId: Hash,
  ) {
    const config =
      this.marketPublicAllocatorConfigs[vault]?.[adapterMarketCapId];
    if (config == null)
      throw new UnknownReallocationMarketPublicAllocatorConfigError(
        vault,
        adapterMarketCapId,
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
   * Computes Vault V2 BluePublicAllocator calls available for a target market.
   *
   * Without `options.operation`, discovers every friendly call. With an
   * operation, caps the calls to the amount required by that borrow or
   * loan-asset withdrawal and falls back to 100% source utilization only when
   * friendly liquidity cannot cover the absolute shortfall. Friendly source
   * utilization defaults to 90% and is configurable through
   * `options.maxWithdrawalUtilization`. Vaults whose configured penalty exceeds
   * `options.maxPenalty` are ignored.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional discovery controls and operation to support.
   * @returns Flat action-ready reallocations and their post-simulation state.
   * @throws {NonPositiveInputError} when the operation amount is not positive and planning is enabled.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the absolute shortfall.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdraw exceeds market supply.
   * @example
   * ```ts
   * import { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const data = new VaultV2BlueReallocationData(input);
   * const discovery = data.computeVaultV2BlueReallocations(targetMarketId, {
   *   timestamp,
   * });
   * const plan = data.computeVaultV2BlueReallocations(targetMarketId, {
   *   timestamp,
   *   operation: { type: "borrow", amount: 1_000_000n },
   * });
   * ```
   */
  public computeVaultV2BlueReallocations(
    marketId: MarketId,
    options: VaultV2BluePublicAllocatorOptions & {
      readonly operation?: {
        readonly type: "borrow" | "withdraw";
        readonly amount: bigint;
      };
    } = {},
  ): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  } {
    if (options.enabled === false) return { reallocations: [], data: this };

    const maxWithdrawalUtilization =
      options.maxWithdrawalUtilization ?? DEFAULT_WITHDRAWAL_TARGET_UTILIZATION;
    const operation = options.operation;
    if (operation == null)
      return this.computeVaultV2BlueReallocationsAtUtilization({
        marketId,
        maxWithdrawalUtilization,
        options,
      });

    const { amount, type } = operation;
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

    const timestamp =
      options.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    const normalizedOptions: VaultV2BluePublicAllocatorOptions = {
      ...options,
      timestamp,
      reallocatableVaults:
        options.reallocatableVaults == null
          ? undefined
          : [...options.reallocatableVaults],
    };
    const market = this.getMarket(marketId).accrueInterest(timestamp);
    if (type === "withdraw" && amount > market.totalSupplyAssets) {
      throw new ReallocationWithdrawExceedsMarketSupplyError({
        marketId,
        withdrawAmount: amount,
        totalSupplyAssets: market.totalSupplyAssets,
      });
    }

    const newTotalBorrowAssets =
      type === "borrow"
        ? market.totalBorrowAssets + amount
        : market.totalBorrowAssets;
    const newTotalSupplyAssets =
      type === "withdraw"
        ? market.totalSupplyAssets - amount
        : market.totalSupplyAssets;

    if (
      MarketUtils.getUtilization({
        totalSupplyAssets: newTotalSupplyAssets,
        totalBorrowAssets: newTotalBorrowAssets,
      }) <= DEFAULT_SUPPLY_TARGET_UTILIZATION
    )
      return { reallocations: [], data: this };

    let requiredAssets =
      MathLib.wDivUp(newTotalBorrowAssets, DEFAULT_SUPPLY_TARGET_UTILIZATION) -
      newTotalSupplyAssets;

    const friendly = this.computeVaultV2BlueReallocationsAtUtilization({
      marketId,
      maxWithdrawalUtilization,
      options: normalizedOptions,
    });
    const discovered = [...friendly.reallocations];
    const friendlyMarket = friendly.data.getMarket(marketId);
    const friendlyBorrow =
      type === "borrow"
        ? friendlyMarket.totalBorrowAssets + amount
        : friendlyMarket.totalBorrowAssets;
    const friendlySupply =
      type === "withdraw"
        ? friendlyMarket.totalSupplyAssets - amount
        : friendlyMarket.totalSupplyAssets;

    if (friendlyBorrow > friendlySupply) {
      requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;
      discovered.push(
        ...friendly.data.computeVaultV2BlueReallocationsAtUtilization({
          marketId,
          maxWithdrawalUtilization: MathLib.WAD,
          options: normalizedOptions,
        }).reallocations,
      );
    }

    if (requiredAssets <= 0n) return { reallocations: [], data: this };

    const absoluteShortfall =
      newTotalBorrowAssets > newTotalSupplyAssets
        ? newTotalBorrowAssets - newTotalSupplyAssets
        : 0n;
    const reallocations: VaultV2BlueReallocation[] = [];
    let remainingRequiredAssets = requiredAssets;

    for (const reallocation of discovered) {
      const assets = MathLib.min(reallocation.assets, remainingRequiredAssets);
      if (assets <= 0n) continue;

      reallocations.push({ ...reallocation, assets });
      remainingRequiredAssets -= assets;
      if (remainingRequiredAssets === 0n) break;
    }

    const reallocatedAssets = requiredAssets - remainingRequiredAssets;
    if (reallocatedAssets < absoluteShortfall) {
      throw new InsufficientSharedLiquidityError({
        marketId,
        shortfall: absoluteShortfall,
        available: reallocatedAssets,
      });
    }

    let data = this.clone();
    for (const currentMarket of Object.values(data.markets)) {
      if (currentMarket != null)
        data.setMarket(currentMarket.accrueInterest(timestamp));
    }
    for (const reallocation of reallocations) {
      data = data.cloneWithPublicReallocation({
        reallocation,
        targetMarketId: marketId,
        timestamp,
      });
    }

    return { reallocations, data };
  }

  private computeVaultV2BlueReallocationsAtUtilization({
    marketId,
    maxWithdrawalUtilization,
    options = {},
  }: {
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
    readonly options?: VaultV2BluePublicAllocatorOptions;
  }): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  } {
    if (options.enabled === false) return { reallocations: [], data: this };

    this.getMarket(marketId);
    const timestamp =
      options.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    let data = this.clone();
    for (const market of Object.values(data.markets)) {
      if (market != null) data.setMarket(market.accrueInterest(timestamp));
    }
    const reallocations: VaultV2BlueReallocation[] = [];
    const configuredVaults = Object.keys(data.vaults) as Address[];
    const vaultKeyByLower = new Map(
      configuredVaults.map((vault) => [vault.toLowerCase(), vault]),
    );
    const vaults = Array.from(
      new Set(
        [...(options.reallocatableVaults ?? configuredVaults)]
          .map((vault) => vaultKeyByLower.get(vault.toLowerCase()))
          .filter((vault): vault is Address => vault != null),
      ),
    );

    while (true) {
      const candidates = vaults
        .map((vaultAddress) => {
          const targetMarket = data.getMarket(marketId);
          return _try(() => {
            const vault = data.getVault(vaultAddress);
            const publicAllocatorConfig =
              data.getPublicAllocatorConfig(vaultAddress);
            if (
              !isAddressEqual(publicAllocatorConfig.vault, vaultAddress) ||
              (options.maxPenalty != null &&
                publicAllocatorConfig.penalty > options.maxPenalty)
            )
              return;
            const activeAdapters = data.activeAdapters[vaultAddress];
            if (activeAdapters == null) return;

            const targetSupplyHeadroom = MathLib.zeroFloorSub(
              MathLib.MAX_UINT_128,
              targetMarket.totalSupplyAssets,
            );
            const rawCandidates: VaultV2BlueReallocation[] = [];

            for (const adapter of vault.accrualAdapters) {
              if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
                continue;
              if (!isAddressEqual(adapter.parentVault, vaultAddress)) continue;
              if (
                !isAddressEqual(targetMarket.params.loanToken, vault.asset) ||
                !isAddressEqual(
                  targetMarket.params.irm,
                  adapter.adaptiveCurveIrm,
                )
              )
                continue;
              if (
                !adapter.markets.some(
                  (market) =>
                    market.id.toLowerCase() === marketId.toLowerCase(),
                )
              )
                continue;

              const targetContext = _try(() => {
                const ids = adapter.ids(targetMarket.params);
                const marketPublicAllocatorConfig =
                  data.getMarketPublicAllocatorConfig(vaultAddress, ids[2]);
                if (
                  !isAddressEqual(
                    marketPublicAllocatorConfig.vault,
                    vaultAddress,
                  ) ||
                  !isAddressEqual(
                    marketPublicAllocatorConfig.adapter,
                    adapter.address,
                  ) ||
                  !activeAdapters.has(adapter.address)
                )
                  return;

                const allocations = ids.map((id) =>
                  data.getAllocation(vaultAddress, id),
                );
                if (allocations.some(({ absoluteCap }) => absoluteCap === 0n))
                  return;

                const expectedSupplyAssets = targetMarket.toSupplyAssets(
                  adapter.supplyShares[marketId] ?? 0n,
                );
                const untracked = MathLib.zeroFloorSub(
                  expectedSupplyAssets,
                  allocations[2]!.allocation,
                );

                return {
                  adapter,
                  allocations,
                  marketPublicAllocatorConfig,
                  untracked,
                };
              }, UnknownDataError);
              if (targetContext == null) continue;

              const targetMarketParamsAllocation =
                targetContext.allocations[2]!;
              const allocatorHeadroom = MathLib.zeroFloorSub(
                targetContext.marketPublicAllocatorConfig.absoluteCap,
                targetMarketParamsAllocation.allocation +
                  targetContext.untracked,
              );

              if (publicAllocatorConfig.canPullFromIdle) {
                const assets = MathLib.min(
                  MathLib.MAX_UINT_128,
                  targetSupplyHeadroom,
                  allocatorHeadroom,
                  MathLib.zeroFloorSub(
                    vault.assetBalance,
                    data.donatedPenaltyAssets[vaultAddress] ?? 0n,
                  ),
                );
                if (assets > 0n) {
                  rawCandidates.push({
                    vault: vaultAddress,
                    from: { type: "idle" },
                    to: { adapter: targetContext.adapter.address },
                    assets,
                    penalty: publicAllocatorConfig.penalty,
                  });
                }
              }

              for (const sourceAdapter of vault.accrualAdapters) {
                if (
                  !(
                    sourceAdapter instanceof
                    AccrualVaultV2MorphoMarketV1AdapterV2
                  )
                )
                  continue;
                if (!isAddressEqual(sourceAdapter.parentVault, vaultAddress))
                  continue;

                for (const sourceMarketReference of sourceAdapter.markets) {
                  const sourceMarket = data.getMarket(sourceMarketReference.id);
                  if (
                    !isAddressEqual(
                      sourceMarket.params.loanToken,
                      vault.asset,
                    ) ||
                    !isAddressEqual(
                      sourceMarket.params.irm,
                      sourceAdapter.adaptiveCurveIrm,
                    )
                  )
                    continue;
                  if (sourceMarket.id.toLowerCase() === marketId.toLowerCase())
                    continue;

                  const candidate = _try(() => {
                    const sourceIds = sourceAdapter.ids(sourceMarket.params);
                    const sourceConfig = data.getMarketPublicAllocatorConfig(
                      vaultAddress,
                      sourceIds[2],
                    );
                    if (
                      !isAddressEqual(sourceConfig.vault, vaultAddress) ||
                      !isAddressEqual(
                        sourceConfig.adapter,
                        sourceAdapter.address,
                      ) ||
                      !activeAdapters.has(sourceAdapter.address) ||
                      !sourceConfig.canPullFromMarket
                    )
                      return;

                    const sourceAllocations = sourceIds.map((id) =>
                      data.getAllocation(vaultAddress, id),
                    );
                    if (
                      sourceAllocations.some(
                        ({ allocation }) => allocation === 0n,
                      )
                    )
                      return;

                    const expectedSupplyAssets = sourceMarket.toSupplyAssets(
                      sourceAdapter.supplyShares[sourceMarket.id] ?? 0n,
                    );
                    const assets = MathLib.min(
                      MathLib.MAX_UINT_128,
                      targetSupplyHeadroom,
                      allocatorHeadroom,
                      expectedSupplyAssets,
                      sourceMarket.getWithdrawToUtilization(
                        maxWithdrawalUtilization,
                      ),
                    );
                    if (assets <= 0n) return;

                    return {
                      vault: vaultAddress,
                      from: {
                        type: "market",
                        adapter: sourceAdapter.address,
                        marketParams: sourceMarket.params,
                      },
                      to: { adapter: targetContext.adapter.address },
                      assets,
                      penalty: publicAllocatorConfig.penalty,
                    } satisfies VaultV2BlueReallocation;
                  }, UnknownDataError);
                  if (candidate != null) rawCandidates.push(candidate);
                }
              }
            }

            const capCompatibleCandidates: VaultV2BlueReallocation[] = [];
            for (const reallocation of rawCandidates) {
              // Cap fit is monotonic but not linear in assets: the amount changes
              // penalty donations, firstTotalAssets, rounded shares, and possibly
              // shared allocation IDs. Binary search finds the exact largest fit.
              let lower = 0n;
              let upper = reallocation.assets;

              while (lower < upper) {
                const assets = (lower + upper + 1n) / 2n;
                const postState = data.cloneWithPublicReallocation({
                  reallocation: { ...reallocation, assets },
                  targetMarketId: marketId,
                  timestamp: targetMarket.lastUpdate,
                });
                const postVault = postState.getVault(reallocation.vault);
                const postAdapter = postState.getAdapter(
                  reallocation.vault,
                  reallocation.to.adapter,
                );
                const targetIds = postAdapter.ids(
                  postState.getMarket(marketId).params,
                );
                // Vault V2 checks relative caps against the transient firstTotalAssets,
                // which stays fixed after the vault's first allocation in a transaction.
                const firstTotalAssets =
                  postState.firstTotalAssets[reallocation.vault] ??
                  postVault._totalAssets;
                const withinCaps = targetIds.every((id) => {
                  const allocation = postState.getAllocation(
                    reallocation.vault,
                    id,
                  );
                  const capacity = VaultV2Utils.allocationHeadroom(
                    { ...allocation, allocation: 0n },
                    firstTotalAssets,
                  ).value;
                  return (
                    allocation.absoluteCap > 0n &&
                    allocation.allocation <= capacity
                  );
                });

                if (withinCaps) lower = assets;
                else upper = assets - 1n;
              }

              if (lower > 0n)
                capCompatibleCandidates.push({
                  ...reallocation,
                  assets: lower,
                });
            }

            return capCompatibleCandidates.sort(
              bigIntComparator(({ assets }) => assets, "desc"),
            )[0];
          }, UnknownDataError);
        })
        .filter(
          (candidate): candidate is VaultV2BlueReallocation =>
            candidate != null,
        )
        .sort(bigIntComparator(({ assets }) => assets, "desc"));

      const largest = candidates[0];
      if (largest == null) return { reallocations, data };

      reallocations.push(largest);
      data = data.cloneWithPublicReallocation({
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
   * @param options - Optional timestamp, enable flag, vault allowlist, source utilization ceiling, and maximum penalty.
   * @returns Reallocatable market and idle assets, or `0n` when none are available.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getPublicReallocationLiquidity(targetMarketId);
   * ```
   */
  public getPublicReallocationLiquidity(
    marketId: MarketId,
    options?: VaultV2BluePublicAllocatorOptions,
  ) {
    return this.computeVaultV2BlueReallocationsAtUtilization({
      marketId,
      maxWithdrawalUtilization:
        options?.maxWithdrawalUtilization ??
        DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      options,
    }).reallocations.reduce((total, { assets }) => total + assets, 0n);
  }

  /**
   * Computes borrow liquidity to a target utilization, including friendly
   * Vault V2 public reallocations.
   *
   * @param marketId - Target Blue market id.
   * @param utilization - Desired utilization, scaled by WAD. Defaults to 90%.
   * @param options - Optional timestamp, enable flag, vault allowlist, source utilization ceiling, and maximum penalty.
   * @returns Borrowable assets while remaining at or below `utilization`.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * const liquidity = data.getAvailableLiquidityToUtilization(targetMarketId);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: mirrors the existing V1 metric API
  public getAvailableLiquidityToUtilization(
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

    const availableLiquidity = this.getPublicReallocationLiquidity(marketId, {
      ...options,
      timestamp,
    });
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

  private cloneWithPublicReallocation({
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

    const penaltyAssets = MathLib.wMulUp(
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
      data.setMarket(withdrawal.market);
      const sourceChange =
        withdrawal.market.toSupplyAssets(
          sourceAdapter.supplyShares[sourceMarket.id] ?? 0n,
        ) - data.getAllocation(reallocation.vault, sourceIds[2]).allocation;
      for (const id of sourceIds) {
        const allocation = data.getAllocation(reallocation.vault, id);
        const nextAllocation = allocation.allocation + sourceChange;
        if (nextAllocation < 0n) {
          throw new ReallocationAllocationUnderflowError({
            vault: reallocation.vault,
            id,
            allocation: allocation.allocation,
            change: sourceChange,
          });
        }
        data.allocations[reallocation.vault]![id] = {
          ...allocation,
          allocation: nextAllocation,
        };
      }
      vault.assetBalance += reallocation.assets;
    }

    if (data.firstTotalAssets[reallocation.vault] == null) {
      // Vault V2's transient firstTotalAssets tracks the first allocation in a
      // transaction independently from elapsed time. Later allocations must not
      // recompute the denominator, even if their simulated balances have changed.
      if (timestamp === vault.lastUpdate) {
        // AccrualVaultV2 skips zero-elapsed accruals, but the contract's first
        // touch still reads real adapter assets. With zero elapsed time, its
        // growth clamp leaves only existing losses to recognize.
        const realAssets = vault.accrualAdapters.reduce(
          (assets, adapter) => assets + adapter.realAssets(timestamp),
          vault.assetBalance,
        );
        vault._totalAssets = MathLib.min(realAssets, vault._totalAssets);
      } else {
        vault = vault.accrueInterest(timestamp).vault;
      }
      data.vaults[reallocation.vault] = vault;
      data.firstTotalAssets[reallocation.vault] = vault._totalAssets;
    }

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
    data.setMarket(supply.market);

    const targetChange =
      supply.market.toSupplyAssets(targetSupplyShares) - oldTargetAllocation;
    for (const id of targetIds) {
      const allocation = data.getAllocation(reallocation.vault, id);
      const nextAllocation = allocation.allocation + targetChange;
      if (nextAllocation < 0n) {
        throw new ReallocationAllocationUnderflowError({
          vault: reallocation.vault,
          id,
          allocation: allocation.allocation,
          change: targetChange,
        });
      }
      data.allocations[reallocation.vault]![id] = {
        ...allocation,
        allocation: nextAllocation,
      };
    }

    vault.assetBalance -= reallocation.assets;
    return data;
  }

  private setMarket(market: Market) {
    this.markets[market.id] = market;

    // A Morpho market is global state shared by every vault position. Legacy
    // AccrualPosition constructors copy their Market, so rebuild those adapter
    // views as well as repointing V2 adapters whenever the canonical state moves.
    for (const vault of Object.values(this.vaults)) {
      if (vault == null) continue;
      const adapters = new Set(vault.accrualAdapters);
      if (vault.accrualLiquidityAdapter != null)
        adapters.add(vault.accrualLiquidityAdapter);

      for (const adapter of adapters) {
        if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
          adapter.markets = adapter.markets.map((adapterMarket) =>
            getCanonicalMarket(this.markets, adapterMarket),
          );
        } else if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
          adapter.positions = adapter.positions.map((position) =>
            clonePosition(position, this.markets),
          );
        } else if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
          adapter.accrualVaultV1 = cloneAccrualVault(
            adapter.accrualVaultV1,
            this.markets,
          );
        }
      }
    }
  }
}
