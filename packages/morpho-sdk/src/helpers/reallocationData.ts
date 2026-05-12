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
  InputReallocationData,
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

const DEFAULT_PUBLIC_ALLOCATOR_DELAY = 60n * 60n;

const cloneMarket = (market: Market) => new Market(market);

const clonePosition = (position: Position) => new Position(position);

const cloneHolding = (holding: Holding): Holding => new Holding(holding);

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
 * It owns only the market, vault, position, holding, vault-market-config, and
 * data needed by the shared-liquidity algorithm. Simulation steps return cloned
 * `ReallocationData` instances so fetched caller inputs are not mutated.
 */
export class ReallocationData implements InputReallocationData {
  public readonly chainId: number;
  public readonly markets: Record<MarketId, Market | undefined>;
  public readonly vaults: Record<Address, Vault | undefined>;
  public readonly positions: Record<
    Address,
    Record<MarketId, Position | undefined>
  >;
  public readonly holdings: Record<
    Address,
    Record<Address, Holding | undefined>
  >;
  public readonly vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;

  constructor({
    chainId,
    markets,
    vaults,
    positions,
    holdings,
    vaultMarketConfigs,
  }: InputReallocationData) {
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

  public clone() {
    return new ReallocationData(this);
  }

  public getMarket(marketId: MarketId) {
    const market = this.markets[marketId];

    if (market == null) throw new UnknownReallocationMarketError(marketId);

    return market;
  }

  public getVault(vault: Address) {
    const data = this.vaults[vault];

    if (data == null) throw new UnknownReallocationVaultError(vault);

    return data;
  }

  public getPosition(user: Address, marketId: MarketId) {
    const position = this.positions[user]?.[marketId];

    if (position == null)
      throw new UnknownReallocationPositionError(user, marketId);

    return position;
  }

  public getAccrualPosition(user: Address, marketId: MarketId) {
    return new AccrualPosition(
      this.getPosition(user, marketId),
      this.getMarket(marketId),
    );
  }

  public getHolding(user: Address, token: Address) {
    const holding = this.holdings[user]?.[token];

    if (holding == null) throw new UnknownReallocationHoldingError(user, token);

    return holding;
  }

  public getVaultMarketConfig(vault: Address, marketId: MarketId) {
    const config = this.vaultMarketConfigs[vault]?.[marketId];

    if (config == null)
      throw new UnknownReallocationVaultMarketConfigError(vault, marketId);

    return config;
  }

  /**
   * Calculates public reallocations that can supply liquidity to `marketId`.
   *
   * The algorithm repeatedly chooses the single largest currently available
   * source-market withdrawal across reallocatable vaults, applies that
   * withdrawal to a cloned state, and repeats until no valid withdrawal remains.
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
      delay = DEFAULT_PUBLIC_ALLOCATOR_DELAY,
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
            delay,
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

  private getLargestVaultWithdrawal({
    vault,
    marketId,
    withdrawals,
    defaultMaxWithdrawalUtilization,
    maxWithdrawalUtilization,
    delay,
    timestamp,
  }: {
    readonly vault: Address;
    readonly marketId: MarketId;
    readonly withdrawals: readonly PublicReallocation[];
    readonly defaultMaxWithdrawalUtilization: bigint;
    readonly maxWithdrawalUtilization: Readonly<
      Record<MarketId, bigint | undefined>
    >;
    readonly delay: bigint;
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
        this.getAccrualPosition(vault, marketId).accrueInterest(
          timestamp + delay,
        ).supplyAssets,
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
      throw new UnknownReallocationVaultMarketConfigError(
        vault,
        withdrawal.id,
      );

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
