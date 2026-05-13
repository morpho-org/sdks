import {
  AccrualPosition,
  type BigIntish,
  Holding,
  Market,
  type MarketId,
  MathLib,
  Position,
  UnknownDataError,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  _try,
} from "@morpho-org/blue-sdk";
import { bigIntComparator } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import type {
  PublicAllocatorOptions,
  PublicReallocation,
} from "../types/index.js";
import {
  MissingPublicAllocatorConfigError,
  UnknownReallocationHoldingError,
  UnknownReallocationMarketError,
  UnknownReallocationPositionError,
  UnknownReallocationVaultError,
  UnknownReallocationVaultMarketConfigError,
} from "../types/index.js";
import { DEFAULT_WITHDRAWAL_TARGET_UTILIZATION } from "./constant.js";

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

  /** Holdings indexed by user or vault address, then by token address. */
  readonly holdings?: Readonly<
    Record<Address, Readonly<Record<Address, Holding | undefined>>>
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
const cloneMarket = (market: Market) => new Market(market);

/**
 * Clones a market position before simulated supply or withdrawal changes are applied.
 *
 * @internal
 */
const clonePosition = (position: Position) => new Position(position);

/**
 * Clones a token holding before local state transitions update balances or allowances.
 *
 * @internal
 */
const cloneHolding = (holding: Holding): Holding => new Holding(holding);

/**
 * Clones vault state, including queue arrays and public allocator accounting.
 *
 * @internal
 */
const cloneVault = (vault: Vault) =>
  new Vault({
    address: vault.address,
    name: vault.name,
    symbol: vault.symbol,
    decimalsOffset: vault.decimalsOffset,
    asset: vault.asset,
    price: vault.price,
    eip5267Domain: vault.eip5267Domain,
    curator: vault.curator,
    owner: vault.owner,
    guardian: vault.guardian,
    fee: vault.fee,
    feeRecipient: vault.feeRecipient,
    skimRecipient: vault.skimRecipient,
    pendingTimelock: { ...vault.pendingTimelock },
    pendingGuardian: { ...vault.pendingGuardian },
    pendingOwner: vault.pendingOwner,
    timelock: vault.timelock,
    supplyQueue: [...vault.supplyQueue],
    withdrawQueue: [...vault.withdrawQueue],
    totalSupply: vault.totalSupply,
    totalAssets: vault.totalAssets,
    lastTotalAssets: vault.lastTotalAssets,
    lostAssets: vault.lostAssets,
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
    vault: config.vault,
    marketId: config.marketId,
    cap: config.cap,
    pendingCap: { ...config.pendingCap },
    removableAt: config.removableAt,
    enabled: config.enabled,
    publicAllocatorConfig:
      config.publicAllocatorConfig == null
        ? undefined
        : new VaultMarketPublicAllocatorConfig(config.publicAllocatorConfig),
  });

/**
 * Narrow state container for computing public allocator reallocations.
 *
 * @remarks
 * The class owns only the market, vault, position, holding, vault-market-config,
 * and chain data needed by the shared-liquidity algorithm. Constructor inputs
 * are cloned, and simulation steps return cloned `ReallocationData` instances
 * so fetched caller inputs are not mutated.
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

  /** Holdings indexed by user or vault address, then by token address. */
  public readonly holdings: Record<
    Address,
    Record<Address, Holding | undefined>
  >;

  /** Vault market configs indexed by vault address, then by market id. */
  public readonly vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;

  /**
   * Creates a cloned reallocation state from fetched market, vault, position,
   * holding, and vault-market-config data.
   *
   * @param input - Reallocation input data fetched at a consistent chain state.
   */
  constructor(input: InputReallocationData) {
    const {
      chainId,
      markets,
      vaults,
      positions,
      holdings,
      vaultMarketConfigs,
    } = input;

    this.chainId = chainId;
    this.markets = {};
    this.vaults = {};
    this.positions = {};
    this.holdings = {};
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

    for (const [user, byToken] of Object.entries(holdings ?? {}) as [
      Address,
      Record<Address, Holding | undefined>,
    ][]) {
      this.holdings[user] = {};

      for (const [token, holding] of Object.entries(byToken) as [
        Address,
        Holding | undefined,
      ][]) {
        this.holdings[user]![token] =
          holding == null ? undefined : cloneHolding(holding);
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
   * Gets a token holding for a user or vault.
   *
   * @param user - Holding owner address.
   * @param token - Token address.
   * @returns The cloned holding data.
   * @throws {@link UnknownReallocationHoldingError} when the holding is absent.
   */
  public getHolding(user: Address, token: Address) {
    const holding = this.holdings[user]?.[token];

    if (holding == null) throw new UnknownReallocationHoldingError(user, token);

    return holding;
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
   * @param marketId - Target market to supply with shared liquidity.
   * @param timestampOrOptions - Optional accrual timestamp or allocator options.
   * @param maybeOptions - Allocator options when the timestamp is passed separately.
   * @returns Computed source-market withdrawals and the post-reallocation state.
   * @throws {@link UnknownReallocationMarketError} when the target market is absent.
   */
  public getMarketPublicReallocations(
    marketId: MarketId,
    timestampOrOptions?: BigIntish | PublicAllocatorOptions,
    maybeOptions: PublicAllocatorOptions = {},
  ): {
    readonly withdrawals: readonly PublicReallocation[];
    data: ReallocationData;
  } {
    const options =
      typeof timestampOrOptions === "object"
        ? timestampOrOptions
        : maybeOptions;
    const timestampInput =
      typeof timestampOrOptions === "object"
        ? options.timestamp
        : (timestampOrOptions ?? options.timestamp);
    const {
      enabled = true,
      reallocatableVaults,
      defaultMaxWithdrawalUtilization = DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      maxWithdrawalUtilization = {},
    } = options;
    const accrualTimestamp = BigInt(
      timestampInput ?? this.getMarket(marketId).lastUpdate,
    );

    if (!enabled) return { withdrawals: [], data: this };

    const vaults = (
      reallocatableVaults ?? (Object.keys(this.vaultMarketConfigs) as Address[])
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
        .map((vault) =>
          data.getLargestVaultWithdrawal({
            vault,
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
      if (largestVaultWithdrawal?.largestWithdrawal == null)
        return { withdrawals, data };

      const { vault, largestWithdrawal } = largestVaultWithdrawal;
      withdrawals.push({ ...largestWithdrawal, vault });
      data = data.applyPublicReallocation(
        vault,
        marketId,
        largestWithdrawal,
        accrualTimestamp,
      );
    }
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

            const srcPublicAllocatorConfig = this.getVaultMarketConfig(
              vault,
              srcMarketId,
            ).publicAllocatorConfig;

            return {
              id: srcMarketId,
              assets: MathLib.min(
                srcPosition.supplyAssets,
                targetUtilizationLiquidity,
                suppliable,
                publicAllocatorConfig?.maxIn ?? 0n,
                srcPublicAllocatorConfig?.maxOut ?? 0n,
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
  private applyPublicReallocation(
    vault: Address,
    supplyMarketId: MarketId,
    withdrawal: { readonly id: MarketId; readonly assets: bigint },
    timestamp: bigint,
  ) {
    const data = this.clone();

    const vaultPublicAllocatorConfig =
      data.getVault(vault).publicAllocatorConfig;
    if (vaultPublicAllocatorConfig == null)
      throw new MissingPublicAllocatorConfigError(vault);
    vaultPublicAllocatorConfig.accruedFee += vaultPublicAllocatorConfig.fee;

    const sourceConfig = data.getVaultMarketConfig(vault, withdrawal.id);
    const sourcePublicAllocatorConfig = sourceConfig.publicAllocatorConfig;
    if (sourcePublicAllocatorConfig == null)
      throw new UnknownReallocationVaultMarketConfigError(vault, withdrawal.id);

    const supplyConfig = data.getVaultMarketConfig(vault, supplyMarketId);
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

    _try(() => {
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
