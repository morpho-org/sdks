import {
  _try,
  AccrualPosition,
  Market,
  type MarketId,
  MathLib,
  Position,
  UnknownDataError,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { bigIntComparator } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "../helpers/constant.js";
import { getSupplyTargetUtilization } from "../helpers/utilization.js";
import type {
  PublicAllocatorOptions,
  PublicReallocation,
  ReallocationComputeOptions,
} from "../types/index.js";
import {
  DisabledReallocationMarketError,
  MissingPublicAllocatorConfigError,
  UnknownReallocationMarketError,
  UnknownReallocationPositionError,
  UnknownReallocationVaultError,
  UnknownReallocationVaultMarketConfigError,
} from "../types/index.js";

/**
 * Input state required to construct {@link ReallocationData}.
 */
export interface InputReallocationData {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;

  /** Markets indexed by market id. */
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;

  /** Vaults indexed by vault address. */
  readonly vaults?: Readonly<Record<Address, Vault | undefined>>;

  /** Positions indexed by user or vault address, then by market id. */
  readonly positions?: Readonly<
    Record<Address, Readonly<Record<MarketId, Position | undefined>>>
  >;

  /** Vault market configs indexed by vault address, then by market id. */
  readonly vaultMarketConfigs?: Readonly<
    Record<Address, Readonly<Record<MarketId, VaultMarketConfig | undefined>>>
  >;
}

/**
 * Clones a market so simulated interest and liquidity changes never mutate caller input.
 *
 * @internal
 */
const cloneMarket = (market: Market) => new Market({ ...market });

/**
 * Clones a market position before simulated supply or withdrawal changes are applied.
 *
 * @internal
 */
const clonePosition = (position: Position) => new Position({ ...position });

/**
 * Clones vault state, including queue arrays and public allocator accounting.
 *
 * @internal
 */
const cloneVault = (vault: Vault) =>
  new Vault({
    ...vault,
    pendingTimelock: { ...vault.pendingTimelock },
    pendingGuardian: { ...vault.pendingGuardian },
    supplyQueue: [...vault.supplyQueue],
    withdrawQueue: [...vault.withdrawQueue],
    publicAllocatorConfig:
      vault.publicAllocatorConfig == null
        ? undefined
        : { ...vault.publicAllocatorConfig },
  });

/**
 * Clones a vault-market config, including nested public allocator limits.
 *
 * @internal
 */
const cloneVaultMarketConfig = (config: VaultMarketConfig) =>
  new VaultMarketConfig({
    ...config,
    pendingCap: { ...config.pendingCap },
    publicAllocatorConfig:
      config.publicAllocatorConfig == null
        ? undefined
        : new VaultMarketPublicAllocatorConfig({
            ...config.publicAllocatorConfig,
          }),
  });

/**
 * Narrow state container for computing public allocator reallocations.
 *
 * @remarks
 * The class owns only the market, vault, position, vault-market-config,
 * and chain data needed by the shared-liquidity algorithm. Constructor inputs
 * are cloned, and simulation steps return cloned `ReallocationData` instances
 * so fetched caller inputs are not mutated.
 *
 * Public records are exposed for inspection and snapshotting only. Treat
 * `markets`, `vaults`, `positions`, and `vaultMarketConfigs` as a read
 * contract keyed by market id or address; use the getters for typed absence
 * errors and use simulation methods to produce updated state.
 */
export class ReallocationData implements InputReallocationData {
  /** Chain id associated with the fetched reallocation data. */
  public readonly chainId: number;

  /** Markets indexed by market id. */
  public readonly markets: Record<MarketId, Market | undefined>;

  /** Vaults indexed by vault address. */
  public readonly vaults: Record<Address, Vault | undefined>;

  /** Positions indexed by user or vault address, then by market id. */
  public readonly positions: Record<
    Address,
    Record<MarketId, Position | undefined>
  >;

  /** Vault market configs indexed by vault address, then by market id. */
  public readonly vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;

  /**
   * Creates a cloned reallocation state from fetched market, vault, position,
   * and vault-market-config data.
   *
   * @param input - Reallocation input data fetched at a consistent chain state.
   */
  constructor(input: InputReallocationData) {
    const { chainId, markets, vaults, positions, vaultMarketConfigs } = input;

    this.chainId = chainId;
    this.markets = {};
    this.vaults = {};
    this.positions = {};
    this.vaultMarketConfigs = {};

    for (const [id, market] of Object.entries(markets ?? {}) as [
      MarketId,
      Market | undefined,
    ][]) {
      this.markets[id] = market == null ? undefined : cloneMarket(market);
    }

    for (const [address, vault] of Object.entries(vaults ?? {}) as [
      Address,
      Vault | undefined,
    ][]) {
      this.vaults[address] = vault == null ? undefined : cloneVault(vault);
    }

    for (const [user, byMarket] of Object.entries(positions ?? {}) as [
      Address,
      Record<MarketId, Position | undefined>,
    ][]) {
      this.positions[user] = {};

      for (const [id, position] of Object.entries(byMarket) as [
        MarketId,
        Position | undefined,
      ][]) {
        this.positions[user]![id] =
          position == null ? undefined : clonePosition(position);
      }
    }

    for (const [vault, byMarket] of Object.entries(
      vaultMarketConfigs ?? {},
    ) as [Address, Record<MarketId, VaultMarketConfig | undefined>][]) {
      this.vaultMarketConfigs[vault] = {};

      for (const [id, config] of Object.entries(byMarket) as [
        MarketId,
        VaultMarketConfig | undefined,
      ][]) {
        this.vaultMarketConfigs[vault]![id] =
          config == null ? undefined : cloneVaultMarketConfig(config);
      }
    }
  }

  /**
   * Creates a deep clone of this reallocation state.
   *
   * @returns A new `ReallocationData` instance with cloned entity objects.
   */
  public clone() {
    return new ReallocationData(this);
  }

  private forkAliasedState() {
    const data = new ReallocationData({ chainId: this.chainId });

    Object.assign(data.markets, this.markets);
    Object.assign(data.vaults, this.vaults);

    for (const [user, positions] of Object.entries(this.positions) as [
      Address,
      Record<MarketId, Position | undefined>,
    ][]) {
      data.positions[user] = positions;
    }

    for (const [vault, configs] of Object.entries(this.vaultMarketConfigs) as [
      Address,
      Record<MarketId, VaultMarketConfig | undefined>,
    ][]) {
      data.vaultMarketConfigs[vault] = configs;
    }

    return data;
  }

  /**
   * Gets a market by id.
   *
   * @param marketId - Market id to read.
   * @returns The cloned market data.
   * @throws {@link UnknownReallocationMarketError} when the market is absent.
   */
  public getMarket(marketId: MarketId) {
    const market = this.markets[marketId];

    if (market == null) throw new UnknownReallocationMarketError(marketId);

    return market;
  }

  /**
   * Gets a vault by address.
   *
   * @param vault - Vault address to read.
   * @returns The cloned vault data.
   * @throws {@link UnknownReallocationVaultError} when the vault is absent.
   */
  public getVault(vault: Address) {
    const data = this.vaults[vault];

    if (data == null) throw new UnknownReallocationVaultError(vault);

    return data;
  }

  /**
   * Gets a raw market position.
   *
   * @param user - Position owner address, usually a MetaMorpho vault.
   * @param marketId - Market id for the position.
   * @returns The cloned position data.
   * @throws {@link UnknownReallocationPositionError} when the position is absent.
   */
  public getPosition(user: Address, marketId: MarketId) {
    const position = this.positions[user]?.[marketId];

    if (position == null)
      throw new UnknownReallocationPositionError(user, marketId);

    return position;
  }

  /**
   * Gets a position wrapped with its market accrual helpers.
   *
   * @param user - Position owner address, usually a MetaMorpho vault.
   * @param marketId - Market id for the position.
   * @returns Accrual-aware position data.
   * @throws {@link UnknownReallocationPositionError} when the position is absent.
   * @throws {@link UnknownReallocationMarketError} when the market is absent.
   */
  public getAccrualPosition(user: Address, marketId: MarketId) {
    return new AccrualPosition(
      this.getPosition(user, marketId),
      this.getMarket(marketId),
    );
  }

  /**
   * Gets a vault-market config.
   *
   * @param vault - Vault address.
   * @param marketId - Market id configured by the vault.
   * @returns The cloned vault-market config.
   * @throws {@link UnknownReallocationVaultMarketConfigError} when the config is absent.
   */
  public getVaultMarketConfig(vault: Address, marketId: MarketId) {
    const config = this.vaultMarketConfigs[vault]?.[marketId];

    if (config == null)
      throw new UnknownReallocationVaultMarketConfigError(vault, marketId);

    return config;
  }

  /**
   * Calculates public reallocations that can supply liquidity to `marketId`.
   *
   * @remarks
   * The algorithm repeatedly chooses the single largest currently available
   * source-market withdrawal across reallocatable vaults, applies that
   * withdrawal to a cloned state, and repeats until no valid withdrawal remains.
   *
   * Pass `options.timestamp` to evaluate market interest and pending public
   * allocator caps at the same block as the fetched reallocation data.
   * This method does not add the legacy one-hour delay margin that
   * `SimulationState.getMarketPublicReallocations` applied before measuring
   * target-market vault headroom. If a transaction may land later than the
   * fetched block, pass a future `timestamp` or reserve your own headroom so
   * interest accrued before inclusion does not make `reallocateTo` exceed the
   * target market cap.
   * Returned `data` normalizes `vault.publicAllocatorConfig.accruedFee` to the
   * on-chain `reallocateTo` fee semantics: one fee charge per vault with at
   * least one computed withdrawal.
   *
   * @param marketId - Target market to supply with shared liquidity.
   * @param options - Optional allocator discovery options.
   * @returns Computed source-market withdrawals and the post-reallocation state.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   * @example
   * ```ts
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { markets, vaults } from "@morpho-org/morpho-test";
   * import {
   *   morphoViemExtension,
   *   type PublicReallocation,
   * } from "@morpho-org/morpho-sdk";
   * import type { ReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({
   *   chain: mainnet,
   *   transport: http(),
   * }).extend(morphoViemExtension());
   *
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const reallocationData = await market.getReallocationData({
   *   vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   *
   * const result: {
   *   withdrawals: readonly PublicReallocation[];
   *   data: ReallocationData;
   * } = reallocationData.getMarketPublicReallocations(marketParams.id, {
   *   timestamp: block.timestamp,
   * });
   * ```
   */
  public getMarketPublicReallocations(
    marketId: MarketId,
    options: PublicAllocatorOptions = {},
  ): {
    readonly withdrawals: readonly PublicReallocation[];
    data: ReallocationData;
  } {
    const {
      enabled = true,
      timestamp,
      reallocatableVaults,
      defaultMaxWithdrawalUtilization = DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      maxWithdrawalUtilization = {},
    } = options;

    if (!enabled) return { withdrawals: [], data: this };

    const accrualTimestamp = BigInt(
      timestamp ?? this.getMarket(marketId).lastUpdate,
    );

    const configuredVaults = Object.keys(this.vaultMarketConfigs) as Address[];
    const vaultKeyByLower = new Map<string, Address>(
      configuredVaults.map((vault) => [vault.toLowerCase(), vault]),
    );
    const vaults = Array.from(
      new Set(
        (reallocatableVaults ?? configuredVaults)
          .map((vault) => vaultKeyByLower.get(vault.toLowerCase()))
          .filter((vault): vault is Address => vault != null),
      ),
    ).filter((vault) => {
      const vaultMarketConfig = this.vaultMarketConfigs[vault]?.[marketId];

      return (
        vaultMarketConfig?.enabled === true &&
        this.vaults[vault]?.publicAllocatorConfig != null
      );
    });

    let data = this.clone();
    const withdrawals: PublicReallocation[] = [];

    while (true) {
      const vaultWithdrawals = vaults
        .map((vaultAddress) =>
          data.getLargestVaultWithdrawal({
            vault: vaultAddress,
            marketId,
            withdrawals,
            defaultMaxWithdrawalUtilization,
            maxWithdrawalUtilization,
            timestamp: accrualTimestamp,
          }),
        )
        .filter((withdrawal) => withdrawal?.largestWithdrawal != null)
        .sort(
          bigIntComparator(
            (withdrawal) => withdrawal!.largestWithdrawal!.assets,
            "desc",
          ),
        );

      const largestVaultWithdrawal = vaultWithdrawals[0];
      if (largestVaultWithdrawal?.largestWithdrawal == null) {
        const withdrawalCountsByVault = new Map<Address, number>();

        for (const { vault } of withdrawals) {
          withdrawalCountsByVault.set(
            vault,
            (withdrawalCountsByVault.get(vault) ?? 0) + 1,
          );
        }

        for (const [vault, count] of withdrawalCountsByVault) {
          if (count <= 1) continue;

          const vaultPublicAllocatorConfig =
            data.getVault(vault).publicAllocatorConfig;
          /* v8 ignore next: repeated withdrawals require a configured public allocator earlier in the flow. */
          if (vaultPublicAllocatorConfig == null)
            throw new MissingPublicAllocatorConfigError(vault);

          vaultPublicAllocatorConfig.accruedFee -=
            BigInt(count - 1) * vaultPublicAllocatorConfig.fee;
        }

        return { withdrawals, data };
      }

      const { vault, largestWithdrawal } = largestVaultWithdrawal;
      withdrawals.push({ ...largestWithdrawal, vault });
      data = data.applyPublicReallocation({
        vault,
        supplyMarketId: marketId,
        withdrawal: largestWithdrawal,
        timestamp: accrualTimestamp,
      });
    }
  }

  /**
   * Sums the public-allocator liquidity reallocatable into `marketId` from
   * sibling markets.
   *
   * Read-only metric — never throws on insufficiency (returns `0n`). Bounded by
   * each source market's withdrawal utilization cap and the target market's
   * vault supply-cap headroom. Pass `options.defaultMaxWithdrawalUtilization` to
   * widen the source ceiling (e.g. `MathLib.WAD` for the full drain).
   *
   * @param marketId - Target market that would receive the liquidity.
   * @param options - Optional allocator discovery options.
   * @returns Total reallocatable assets in loan-token units; `0n` when none is available.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   */
  public getAvailableLiquidity(
    marketId: MarketId,
    options?: PublicAllocatorOptions,
  ): bigint {
    const { withdrawals } = this.getMarketPublicReallocations(
      marketId,
      options,
    );

    return withdrawals.reduce((total, { assets }) => total + assets, 0n);
  }

  /**
   * Computes the liquidity available to bring `marketId` to `utilization`,
   * combining its own borrow headroom with the reallocatable public-allocator
   * liquidity.
   *
   * Read-only metric — never throws on insufficiency:
   * - returns only the own headroom when `supplyTargetUtilization > utilization`
   *   (reallocation would not trigger at that target);
   * - returns only the available liquidity when `utilization` equals the
   *   market's current utilization (no own headroom left);
   * - otherwise returns their sum.
   *
   * @param marketId - Target market to borrow from.
   * @param utilization - Utilization to bring the market to, scaled by WAD. Defaults to {@link DEFAULT_SUPPLY_TARGET_UTILIZATION}.
   * @param options - Optional reallocation options (supply target utilization trigger, timestamp, withdrawal caps).
   * @returns Available liquidity to the target utilization in loan-token units; `0n` when none is available.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   */
  // biome-ignore lint/complexity/useMaxParams: (marketId, utilization, options) is the metric's public API
  public getAvailableLiquidityToTargetUtilization(
    marketId: MarketId,
    utilization: bigint = DEFAULT_SUPPLY_TARGET_UTILIZATION,
    options?: ReallocationComputeOptions,
  ): bigint {
    const market = this.getMarket(marketId).accrueInterest(options?.timestamp);

    const ownHeadroom = market.getBorrowToUtilization(utilization);

    const supplyTargetUtilization = getSupplyTargetUtilization(
      marketId,
      options,
    );
    if (supplyTargetUtilization > utilization) return ownHeadroom;

    const availableLiquidity = this.getAvailableLiquidity(marketId, options);
    if (utilization === market.utilization) return availableLiquidity;

    return ownHeadroom + availableLiquidity;
  }

  /**
   * Gets the largest currently valid source-market withdrawal for a vault.
   *
   * @param params - Candidate vault, target market, prior withdrawals, and allocator limits.
   * @returns The largest withdrawal candidate, or `undefined` if required data is missing.
   *
   * @internal
   */
  private getLargestVaultWithdrawal({
    vault,
    marketId,
    withdrawals,
    defaultMaxWithdrawalUtilization,
    maxWithdrawalUtilization,
    timestamp,
  }: {
    readonly vault: Address;
    readonly marketId: MarketId;
    readonly withdrawals: readonly PublicReallocation[];
    readonly defaultMaxWithdrawalUtilization: bigint;
    readonly maxWithdrawalUtilization: Readonly<
      Record<MarketId, bigint | undefined>
    >;
    readonly timestamp: bigint;
  }):
    | {
        readonly vault: Address;
        readonly largestWithdrawal?: {
          readonly id: MarketId;
          readonly assets: bigint;
        };
      }
    | undefined {
    return _try(() => {
      const { cap, pendingCap, publicAllocatorConfig } =
        this.getVaultMarketConfig(vault, marketId);

      const validCap =
        pendingCap.validAt >= timestamp
          ? MathLib.min(pendingCap.value, cap)
          : cap;

      const suppliable = MathLib.zeroFloorSub(
        validCap,
        this.getAccrualPosition(vault, marketId).accrueInterest(timestamp)
          .supplyAssets,
      );

      const marketWithdrawals = this.getVault(vault)
        .withdrawQueue.filter(
          (srcMarketId) =>
            srcMarketId !== marketId &&
            !withdrawals.some(
              (withdrawal) =>
                withdrawal.id === srcMarketId && withdrawal.vault === vault,
            ),
        )
        .map((srcMarketId) => {
          const withdrawal = _try(() => {
            const srcPosition = this.getAccrualPosition(
              vault,
              srcMarketId,
            ).accrueInterest(timestamp);

            const targetUtilizationLiquidity =
              srcPosition.market.getWithdrawToUtilization(
                maxWithdrawalUtilization[srcMarketId] ??
                  defaultMaxWithdrawalUtilization,
              );

            const srcConfig = this.getVaultMarketConfig(vault, srcMarketId);
            if (!srcConfig.enabled) return { id: srcMarketId, assets: 0n };

            return {
              id: srcMarketId,
              assets: MathLib.min(
                srcPosition.supplyAssets,
                targetUtilizationLiquidity,
                suppliable,
                publicAllocatorConfig?.maxIn ?? 0n,
                srcConfig.publicAllocatorConfig?.maxOut ?? 0n,
              ),
            };
          }, UnknownDataError);

          return withdrawal ?? { id: srcMarketId, assets: 0n };
        })
        .filter(({ assets }) => assets > 0n)
        .sort(bigIntComparator(({ assets }) => assets, "desc"));

      return { vault, largestWithdrawal: marketWithdrawals[0] };
    }, UnknownDataError);
  }

  /**
   * Applies one public allocator withdrawal and corresponding target-market supply.
   *
   * @param vault - Vault performing the public reallocation.
   * @param supplyMarketId - Target market that receives the withdrawn assets.
   * @param withdrawal - Source market id and asset amount to withdraw.
   * @param timestamp - Timestamp used to accrue source and target positions.
   * @returns A cloned state after applying the simulated reallocation.
   * @throws {@link MissingPublicAllocatorConfigError} when the vault allocator config is absent.
   * @throws {@link UnknownReallocationVaultMarketConfigError} when source or target allocator limits are absent.
   *
   * @internal
   */
  protected applyPublicReallocation({
    vault,
    supplyMarketId,
    withdrawal,
    timestamp,
  }: {
    readonly vault: Address;
    readonly supplyMarketId: MarketId;
    readonly withdrawal: { readonly id: MarketId; readonly assets: bigint };
    readonly timestamp: bigint;
  }) {
    const data = this.forkAliasedState();
    data.vaults[vault] = cloneVault(this.getVault(vault));
    /* v8 ignore next: forkAliasedState keeps vault position buckets initialized for known vaults. */
    data.positions[vault] = { ...(this.positions[vault] ?? {}) };
    /* v8 ignore next: forkAliasedState keeps vault market config buckets initialized for known vaults. */
    data.vaultMarketConfigs[vault] = {
      ...(this.vaultMarketConfigs[vault] ?? {}),
    };

    const vaultPublicAllocatorConfig =
      data.getVault(vault).publicAllocatorConfig;
    if (vaultPublicAllocatorConfig == null)
      throw new MissingPublicAllocatorConfigError(vault);
    vaultPublicAllocatorConfig.accruedFee += vaultPublicAllocatorConfig.fee;

    const sourceConfig = cloneVaultMarketConfig(
      this.getVaultMarketConfig(vault, withdrawal.id),
    );
    data.vaultMarketConfigs[vault]![withdrawal.id] = sourceConfig;
    if (!sourceConfig.enabled)
      throw new DisabledReallocationMarketError(vault, withdrawal.id);

    const sourcePublicAllocatorConfig = sourceConfig.publicAllocatorConfig;
    if (sourcePublicAllocatorConfig == null)
      throw new UnknownReallocationVaultMarketConfigError(vault, withdrawal.id);

    const supplyConfig =
      supplyMarketId === withdrawal.id
        ? sourceConfig
        : cloneVaultMarketConfig(
            this.getVaultMarketConfig(vault, supplyMarketId),
          );
    data.vaultMarketConfigs[vault]![supplyMarketId] = supplyConfig;
    if (!supplyConfig.enabled)
      throw new DisabledReallocationMarketError(vault, supplyMarketId);

    const supplyPublicAllocatorConfig = supplyConfig.publicAllocatorConfig;
    if (supplyPublicAllocatorConfig == null)
      throw new UnknownReallocationVaultMarketConfigError(
        vault,
        supplyMarketId,
      );

    sourcePublicAllocatorConfig.maxIn += withdrawal.assets;
    sourcePublicAllocatorConfig.maxOut -= withdrawal.assets;
    supplyPublicAllocatorConfig.maxIn -= withdrawal.assets;
    supplyPublicAllocatorConfig.maxOut += withdrawal.assets;

    const { position: sourcePosition } = data
      .getAccrualPosition(vault, withdrawal.id)
      .withdraw(withdrawal.assets, 0n, timestamp);
    data.markets[withdrawal.id] = cloneMarket(sourcePosition.market);
    data.positions[vault] ??= {};
    data.positions[vault]![withdrawal.id] = clonePosition(sourcePosition);

    const { position: supplyPosition } = data
      .getAccrualPosition(vault, supplyMarketId)
      .supply(withdrawal.assets, 0n, timestamp);
    data.markets[supplyMarketId] = cloneMarket(supplyPosition.market);
    data.positions[vault]![supplyMarketId] = clonePosition(supplyPosition);

    void _try(() => {
      const vaultData = data.getVault(vault);
      vaultData.totalAssets = vaultData.withdrawQueue.reduce(
        (total, marketId) =>
          total + data.getAccrualPosition(vault, marketId).supplyAssets,
        0n,
      );
    }, UnknownDataError);

    return data;
  }
}
