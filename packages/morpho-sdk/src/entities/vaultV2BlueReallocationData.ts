import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  type IAccrualVaultV2Adapter,
  type IVaultV2Allocation,
  type IVaultV2BlueMarketPublicAllocatorConfig,
  type IVaultV2BluePublicAllocatorConfig,
  Market,
  type MarketId,
  MarketUtils,
  MathLib,
  UnknownDataError,
  UnsupportedVaultV2AdapterError,
  VaultV2BlueMarketPublicAllocatorConfig,
  VaultV2BluePublicAllocatorConfig,
  VaultV2BluePublicAllocatorConfigUtils,
  VaultV2Utils,
} from "@morpho-org/blue-sdk";
import { _try, bigIntComparator } from "@morpho-org/morpho-ts";
import { type Address, type Hash, isAddressEqual } from "viem";
import {
  DEFAULT_MAX_REALLOCATION_PENALTY,
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
  MAX_REALLOCATION_PENALTY,
} from "../helpers/constant.js";
import type {
  VaultV2BluePublicAllocatorOptions,
  VaultV2BlueReallocation,
} from "../types/index.js";
import {
  InputExceedsMaxError,
  InsufficientSharedLiquidityError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationAdapterSupplySharesUnderflowError,
  ReallocationAllocationUnderflowError,
  ReallocationWithdrawExceedsMarketSupplyError,
  UnknownReallocationActiveAdaptersError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
  UnknownReallocationVaultError,
} from "../types/index.js";

type ReadonlyMarketSnapshot = Readonly<Market>;

type ReadonlyAdapterSnapshot = Readonly<IAccrualVaultV2Adapter>;

type ReadonlyMarketAdapterSnapshot = Readonly<
  Omit<
    AccrualVaultV2MorphoMarketV1AdapterV2,
    "marketIds" | "supplyShares" | "markets"
  >
> & {
  readonly marketIds: readonly MarketId[];
  readonly supplyShares: Readonly<Record<MarketId, bigint>>;
  readonly markets: readonly ReadonlyMarketSnapshot[];
};

type ReadonlyVaultSnapshot = Readonly<
  Omit<
    AccrualVaultV2,
    | "adapters"
    | "liquidityAllocations"
    | "accrualLiquidityAdapter"
    | "accrualAdapters"
    | "forceDeallocatePenalties"
  >
> & {
  readonly adapters: readonly Address[];
  readonly liquidityAllocations:
    | readonly Readonly<IVaultV2Allocation>[]
    | undefined;
  readonly accrualLiquidityAdapter: ReadonlyAdapterSnapshot | undefined;
  readonly accrualAdapters: readonly ReadonlyAdapterSnapshot[];
  readonly forceDeallocatePenalties: Readonly<Record<Address, bigint>>;
};

type AdapterIds = ReturnType<AccrualVaultV2MorphoMarketV1AdapterV2["ids"]>;

/** Input state required to simulate Vault V2 BluePublicAllocator reallocations. */
export interface InputVaultV2BlueReallocationData {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;
  /** Markets indexed by market id. */
  readonly markets?: Readonly<
    Record<MarketId, ReadonlyMarketSnapshot | undefined>
  >;
  /** Accrued Vault V2 entities indexed by vault address. */
  readonly vaults?: Readonly<
    Record<Address, ReadonlyVaultSnapshot | undefined>
  >;
  /** Vault cap state indexed by vault address and derived allocation id. */
  readonly allocations?: Readonly<
    Record<
      Address,
      Readonly<Record<Hash, IVaultV2Allocation | undefined>> | undefined
    >
  >;
  /** Vault-wide BluePublicAllocator configuration indexed by vault address. */
  readonly publicAllocatorConfigs?: Readonly<
    Record<Address, IVaultV2BluePublicAllocatorConfig | undefined>
  >;
  /**
   * BluePublicAllocator-active adapters indexed by vault address.
   * Arrays, readonly arrays, sets, and other iterables are copied to sets
   * without changing address casing.
   */
  readonly activeAdapters?: Readonly<
    Record<Address, Iterable<Address> | undefined>
  >;
  /** Adapter-market BluePublicAllocator configuration indexed by vault and `adapterMarketCapId`. */
  readonly marketPublicAllocatorConfigs?: Readonly<
    Record<
      Address,
      | Readonly<
          Record<Hash, IVaultV2BlueMarketPublicAllocatorConfig | undefined>
        >
      | undefined
    >
  >;
}

const cloneMarket = (market: ReadonlyMarketSnapshot) =>
  new Market({ ...market });

/**
 * Finds an address key without changing its supplied casing.
 *
 * @param record - Address-keyed record to search.
 * @param address - Address to match case-insensitively.
 * @returns The stored key, or `undefined` when no address matches.
 * @internal
 */
const findAddressKey = <T>(
  record: Readonly<Record<Address, T>>,
  address: Address,
) => {
  if (Object.hasOwn(record, address)) return address;
  return (Object.keys(record) as Address[]).find((key) =>
    isAddressEqual(key, address),
  );
};

/**
 * Returns cached allocation ids for one adapter-market pair.
 *
 * @param cache - Per-planning-call adapter id cache.
 * @param adapter - Adapter that derives the allocation ids.
 * @param market - Market whose params identify the allocations.
 * @returns The adapter, collateral, and adapter-market cap ids.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: cache lookup requires both adapter and market identity.
const getAdapterIds = (
  cache: Map<string, AdapterIds>,
  adapter: ReadonlyMarketAdapterSnapshot,
  market: ReadonlyMarketSnapshot,
) => {
  const key = `${adapter.address}:${market.id}`;
  const cached = cache.get(key);
  if (cached != null) return cached;

  const ids = adapter.ids(market.params);
  cache.set(key, ids);
  return ids;
};

const resolveMaxWithdrawalUtilization = (value: bigint | undefined) => {
  const utilization = value ?? DEFAULT_WITHDRAWAL_TARGET_UTILIZATION;
  if (utilization < 0n)
    throw new NegativeInputError("maxWithdrawalUtilization", utilization);
  if (utilization > MathLib.WAD)
    throw new InputExceedsMaxError({
      field: "maxWithdrawalUtilization",
      value: utilization,
      max: MathLib.WAD,
    });
  return utilization;
};

const resolveMaxPenalty = (value: bigint | undefined) => {
  const penalty = value ?? DEFAULT_MAX_REALLOCATION_PENALTY;
  if (penalty < 0n) throw new NegativeInputError("maxPenalty", penalty);
  if (penalty > MAX_REALLOCATION_PENALTY)
    throw new InputExceedsMaxError({
      field: "maxPenalty",
      value: penalty,
      max: MAX_REALLOCATION_PENALTY,
    });
  return penalty;
};

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

  throw new UnsupportedVaultV2AdapterError(adapter.address);
};

const cloneVault = (
  vault: ReadonlyVaultSnapshot,
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
 * Address keys and values retain their supplied casing; lookups compare them
 * case-insensitively.
 *
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() })
 *   .extend(morphoViemExtension());
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const market = client.morpho.blue(marketParams, mainnet.id);
 * const block = await client.getBlock();
 * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
 * const data: VaultV2BlueReallocationData =
 *   await market.getVaultV2BlueReallocationData({
 *     vaultAddresses: [keyrockUsdcVaultV2],
 *     block: { number: block.number, timestamp: block.timestamp },
 *   });
 * ```
 */
export class VaultV2BlueReallocationData
  implements InputVaultV2BlueReallocationData
{
  /** Mutable market state used only by cloned simulation transitions. */
  private readonly mutableMarkets: Record<MarketId, Market | undefined>;
  /** Mutable vault state used only by cloned simulation transitions. */
  private readonly mutableVaults: Record<Address, AccrualVaultV2 | undefined>;
  /** Mutable allocation state used only by cloned simulation transitions. */
  private readonly mutableAllocations: Record<
    Address,
    Record<Hash, IVaultV2Allocation | undefined> | undefined
  >;
  /** Penalty donations created by this simulation, excluded as fresh shared-liquidity sources. */
  private readonly donatedPenaltyAssets: Record<Address, bigint>;
  /** Transaction-frozen cap denominator for each vault touched by this plan. */
  private readonly firstTotalAssets: Record<Address, bigint>;
  /** Chain id associated with this snapshot. */
  public readonly chainId: number;
  /** Markets indexed by market id. */
  public readonly markets: Readonly<
    Record<MarketId, ReadonlyMarketSnapshot | undefined>
  >;
  /** Vault V2 entities indexed by address. */
  public readonly vaults: Readonly<
    Record<Address, ReadonlyVaultSnapshot | undefined>
  >;
  /** Vault cap state indexed by vault and derived allocation id. */
  public readonly allocations: Readonly<
    Record<
      Address,
      | Readonly<Record<Hash, Readonly<IVaultV2Allocation> | undefined>>
      | undefined
    >
  >;
  /** Vault-wide allocator configuration indexed by vault. */
  public readonly publicAllocatorConfigs: Readonly<
    Record<Address, VaultV2BluePublicAllocatorConfig | undefined>
  >;
  /** BluePublicAllocator-active adapters indexed by vault address, preserving vault and adapter casing. */
  public readonly activeAdapters: Readonly<
    Record<Address, ReadonlySet<Address> | undefined>
  >;
  /** Adapter-market allocator configuration indexed by vault and market-params id. */
  public readonly marketPublicAllocatorConfigs: Readonly<
    Record<
      Address,
      | Readonly<
          Record<Hash, VaultV2BlueMarketPublicAllocatorConfig | undefined>
        >
      | undefined
    >
  >;

  /**
   * Creates a cloned Vault V2 reallocation snapshot.
   *
   * @param input - State fetched at one consistent block.
   * @throws {UnsupportedVaultV2AdapterError} when a vault contains an unsupported adapter type.
   */
  public constructor(input: InputVaultV2BlueReallocationData) {
    const isClone = input instanceof VaultV2BlueReallocationData;
    this.chainId = input.chainId;
    this.mutableMarkets = {};
    this.mutableVaults = {};
    this.mutableAllocations = {};
    this.markets = this.mutableMarkets;
    this.vaults = this.mutableVaults;
    this.allocations = this.mutableAllocations;
    if (isClone) {
      this.publicAllocatorConfigs = input.publicAllocatorConfigs;
      this.activeAdapters = input.activeAdapters;
      this.marketPublicAllocatorConfigs = input.marketPublicAllocatorConfigs;
      this.donatedPenaltyAssets = { ...input.donatedPenaltyAssets };
      this.firstTotalAssets = { ...input.firstTotalAssets };
    } else {
      const publicAllocatorConfigs: Record<
        Address,
        VaultV2BluePublicAllocatorConfig | undefined
      > = {};
      this.publicAllocatorConfigs = publicAllocatorConfigs;
      const activeAdapters: Record<Address, ReadonlySet<Address> | undefined> =
        {};
      this.activeAdapters = activeAdapters;
      const marketPublicAllocatorConfigs: Record<
        Address,
        | Record<Hash, VaultV2BlueMarketPublicAllocatorConfig | undefined>
        | undefined
      > = {};
      this.marketPublicAllocatorConfigs = marketPublicAllocatorConfigs;
      this.donatedPenaltyAssets = {};
      this.firstTotalAssets = {};

      for (const [vault, config] of Object.entries(
        input.publicAllocatorConfigs ?? {},
      ) as [Address, IVaultV2BluePublicAllocatorConfig | undefined][]) {
        publicAllocatorConfigs[vault] =
          config == null
            ? undefined
            : new VaultV2BluePublicAllocatorConfig(config);
      }

      for (const [vault, adapters] of Object.entries(
        input.activeAdapters ?? {},
      ) as [Address, Iterable<Address> | undefined][]) {
        activeAdapters[vault] =
          adapters == null ? undefined : new Set(adapters);
      }

      for (const [vault, configs] of Object.entries(
        input.marketPublicAllocatorConfigs ?? {},
      ) as [
        Address,
        (
          | Readonly<
              Record<Hash, IVaultV2BlueMarketPublicAllocatorConfig | undefined>
            >
          | undefined
        ),
      ][]) {
        marketPublicAllocatorConfigs[vault] = {};
        for (const [id, config] of Object.entries(configs ?? {}) as [
          Hash,
          IVaultV2BlueMarketPublicAllocatorConfig | undefined,
        ][]) {
          marketPublicAllocatorConfigs[vault]![id] =
            config == null
              ? undefined
              : new VaultV2BlueMarketPublicAllocatorConfig(config);
        }
      }
    }

    for (const [marketId, market] of Object.entries(input.markets ?? {}) as [
      MarketId,
      ReadonlyMarketSnapshot | undefined,
    ][]) {
      this.mutableMarkets[marketId] =
        market == null ? undefined : cloneMarket(market);
    }

    for (const [address, vault] of Object.entries(input.vaults ?? {}) as [
      Address,
      ReadonlyVaultSnapshot | undefined,
    ][]) {
      const clonedVault =
        vault == null ? undefined : cloneVault(vault, this.mutableMarkets);
      this.mutableVaults[address] = clonedVault;
    }

    for (const [vault, allocations] of Object.entries(
      input.allocations ?? {},
    ) as [
      Address,
      Readonly<Record<Hash, IVaultV2Allocation | undefined>> | undefined,
    ][]) {
      if (isClone) {
        this.mutableAllocations[vault] = { ...allocations };
        continue;
      }
      this.mutableAllocations[vault] = {};
      for (const [id, allocation] of Object.entries(allocations ?? {}) as [
        Hash,
        IVaultV2Allocation | undefined,
      ][]) {
        this.mutableAllocations[vault]![id] =
          allocation == null ? undefined : { ...allocation };
      }
    }
  }

  /**
   * Clones the complete simulation snapshot.
   *
   * @returns A deep clone of this simulation state.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const cloned: VaultV2BlueReallocationData = data.clone();
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const targetMarket: ReturnType<
   *   VaultV2BlueReallocationData["getMarket"]
   * > = data.getMarket(marketParams.id);
   * ```
   */
  public getMarket(marketId: MarketId): ReadonlyMarketSnapshot {
    const market = this.mutableMarkets[marketId];
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const vault: ReturnType<VaultV2BlueReallocationData["getVault"]> =
   *   data.getVault(keyrockUsdcVaultV2);
   * ```
   */
  public getVault(vault: Address): ReadonlyVaultSnapshot {
    return this.getMutableVault(vault);
  }

  private getMutableVault(vault: Address) {
    const key = findAddressKey(this.mutableVaults, vault);
    const data = key == null ? undefined : this.mutableVaults[key];
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, type Hash } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const [allocationId] = Object.keys(
   *   data.allocations[keyrockUsdcVaultV2] ?? {},
   * ) as Hash[];
   * const allocation: ReturnType<
   *   VaultV2BlueReallocationData["getAllocation"]
   * > = data.getAllocation(keyrockUsdcVaultV2, allocationId!);
   * ```
   */
  public getAllocation(vault: Address, id: Hash) {
    const key = findAddressKey(this.allocations, vault);
    const allocation = key == null ? undefined : this.allocations[key]?.[id];
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const config: ReturnType<
   *   VaultV2BlueReallocationData["getPublicAllocatorConfig"]
   * > = data.getPublicAllocatorConfig(keyrockUsdcVaultV2);
   * ```
   */
  public getPublicAllocatorConfig(vault: Address) {
    const config = this.getOptionalPublicAllocatorConfig(vault);
    if (config == null)
      throw new UnknownReallocationPublicAllocatorConfigError(vault);
    return config;
  }

  /**
   * Gets fetched allocator authorization state, including an explicit absent value.
   *
   * @param vault - Vault V2 address.
   * @returns The allocator config, or `undefined` when the fetched vault has not authorized it.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when the fetch state is absent.
   */
  private getOptionalPublicAllocatorConfig(vault: Address) {
    const key = findAddressKey(this.publicAllocatorConfigs, vault);
    if (key == null)
      throw new UnknownReallocationPublicAllocatorConfigError(vault);
    return this.publicAllocatorConfigs[key];
  }

  /**
   * Gets the BluePublicAllocator-active adapters for a Vault V2.
   *
   * @param vault - Vault V2 address.
   * @returns The active adapter addresses in their supplied casing, or an empty set when none are active.
   * @throws {UnknownReallocationActiveAdaptersError} when the active-adapter state is absent.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, type Address } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const activeAdapters: ReadonlySet<Address> =
   *   data.getActiveAdapters(keyrockUsdcVaultV2);
   * ```
   */
  public getActiveAdapters(vault: Address): ReadonlySet<Address> {
    const key = findAddressKey(this.activeAdapters, vault);
    const adapters = key == null ? undefined : this.activeAdapters[key];
    if (adapters == null)
      throw new UnknownReallocationActiveAdaptersError(vault);
    return adapters;
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, type Hash } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const [adapterMarketCapId] = Object.keys(
   *   data.marketPublicAllocatorConfigs[keyrockUsdcVaultV2] ?? {},
   * ) as Hash[];
   * const config: ReturnType<
   *   VaultV2BlueReallocationData["getMarketPublicAllocatorConfig"]
   * > = data.getMarketPublicAllocatorConfig(
   *   keyrockUsdcVaultV2,
   *   adapterMarketCapId!,
   * );
   * ```
   */
  public getMarketPublicAllocatorConfig(
    vault: Address,
    adapterMarketCapId: Hash,
  ) {
    const key = findAddressKey(this.marketPublicAllocatorConfigs, vault);
    const config =
      key == null
        ? undefined
        : this.marketPublicAllocatorConfigs[key]?.[adapterMarketCapId];
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
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const [adapterAddress] = data.activeAdapters[keyrockUsdcVaultV2] ?? [];
   * const adapter: ReturnType<VaultV2BlueReallocationData["getAdapter"]> =
   *   data.getAdapter(keyrockUsdcVaultV2, adapterAddress!);
   * ```
   */
  public getAdapter(
    vault: Address,
    adapter: Address,
  ): ReadonlyMarketAdapterSnapshot {
    return this.getMutableAdapter(vault, adapter);
  }

  private getMutableAdapter(vault: Address, adapter: Address) {
    const data = this.getMutableVault(vault).accrualAdapters.find(
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
   * `options.maxPenalty` are ignored. By default, only zero-penalty vaults are
   * considered.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional discovery controls and operation to support.
   * @returns Flat action-ready reallocations and their post-simulation state.
   * @throws {NegativeInputError} when `maxWithdrawalUtilization` or `maxPenalty` is negative.
   * @throws {InputExceedsMaxError} when `maxWithdrawalUtilization` or `maxPenalty` exceeds WAD.
   * @throws {NonPositiveInputError} when the operation amount is not positive and planning is enabled.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the absolute shortfall.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdraw exceeds market supply.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import {
   *   morphoViemExtension,
   *   type VaultV2BlueReallocation,
   * } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const result: {
   *   readonly reallocations: readonly VaultV2BlueReallocation[];
   *   readonly data: VaultV2BlueReallocationData;
   * } = data.computeVaultV2BlueReallocations(marketParams.id, {
   *   timestamp: block.timestamp,
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

    const maxWithdrawalUtilization = resolveMaxWithdrawalUtilization(
      options.maxWithdrawalUtilization,
    );
    const maxPenalty = resolveMaxPenalty(options.maxPenalty);
    const resolvedOptions = { ...options, maxPenalty };
    const operation = options.operation;
    if (operation == null)
      return this.computeVaultV2BlueReallocationsAtUtilization({
        marketId,
        maxWithdrawalUtilization,
        options: resolvedOptions,
      });

    const { amount, type } = operation;
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

    const timestamp =
      options.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    const normalizedOptions: VaultV2BluePublicAllocatorOptions = {
      ...resolvedOptions,
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
    data.setMarkets(
      Object.values(data.markets)
        .filter(
          (currentMarket): currentMarket is ReadonlyMarketSnapshot =>
            currentMarket != null,
        )
        .map((currentMarket) => currentMarket.accrueInterest(timestamp)),
    );
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
    data.setMarkets(
      Object.values(data.markets)
        .filter((market): market is ReadonlyMarketSnapshot => market != null)
        .map((market) => market.accrueInterest(timestamp)),
    );
    const reallocations: VaultV2BlueReallocation[] = [];
    const configuredVaults = Object.keys(data.vaults) as Address[];
    const vaults = Array.from(
      new Set(
        [...(options.reallocatableVaults ?? configuredVaults)]
          .map((vault) => findAddressKey(data.vaults, vault))
          .filter((vault): vault is Address => vault != null),
      ),
    );
    const normalizedMarketId = marketId.toLowerCase();
    const adapterIdsCache = new Map<string, AdapterIds>();

    while (true) {
      const candidates = vaults
        .map((vaultAddress) => {
          const targetMarket = data.getMarket(marketId);
          const publicAllocatorConfig =
            data.getOptionalPublicAllocatorConfig(vaultAddress);
          if (publicAllocatorConfig == null) return;
          const vault = data.getVault(vaultAddress);
          if (
            !isAddressEqual(publicAllocatorConfig.vault, vaultAddress) ||
            publicAllocatorConfig.penalty >
              (options.maxPenalty ?? DEFAULT_MAX_REALLOCATION_PENALTY)
          )
            return;
          const activeAdapters = [...data.getActiveAdapters(vaultAddress)];

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
              !isAddressEqual(targetMarket.params.irm, adapter.adaptiveCurveIrm)
            )
              continue;

            const targetContext = _try(() => {
              const [adapterCapId, collateralCapId, adapterMarketCapId] =
                getAdapterIds(adapterIdsCache, adapter, targetMarket);
              const marketPublicAllocatorConfig =
                data.getMarketPublicAllocatorConfig(
                  vaultAddress,
                  adapterMarketCapId,
                );
              if (
                !isAddressEqual(
                  marketPublicAllocatorConfig.vault,
                  vaultAddress,
                ) ||
                !isAddressEqual(
                  marketPublicAllocatorConfig.adapter,
                  adapter.address,
                ) ||
                !activeAdapters.some((activeAdapter) =>
                  isAddressEqual(activeAdapter, adapter.address),
                )
              )
                return;

              const adapterCapAllocation = data.getAllocation(
                vaultAddress,
                adapterCapId,
              );
              const collateralCapAllocation = data.getAllocation(
                vaultAddress,
                collateralCapId,
              );
              const adapterMarketCapAllocation = data.getAllocation(
                vaultAddress,
                adapterMarketCapId,
              );
              if (
                [
                  adapterCapAllocation,
                  collateralCapAllocation,
                  adapterMarketCapAllocation,
                ].some(({ absoluteCap }) => absoluteCap === 0n)
              )
                return;

              const expectedSupplyAssets = targetMarket.toSupplyAssets(
                adapter.supplyShares[marketId] ?? 0n,
              );
              const untracked = MathLib.zeroFloorSub(
                expectedSupplyAssets,
                adapterMarketCapAllocation.allocation,
              );

              return {
                adapter,
                adapterMarketCapAllocation,
                marketPublicAllocatorConfig,
                untracked,
              };
            }, UnknownDataError);
            if (targetContext == null) continue;

            const allocatorHeadroom =
              targetContext.marketPublicAllocatorConfig.getMaxIn(
                targetContext.adapterMarketCapAllocation.allocation +
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
                  sourceAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
                )
              )
                continue;
              if (!isAddressEqual(sourceAdapter.parentVault, vaultAddress))
                continue;
              if (
                !activeAdapters.some((activeAdapter) =>
                  isAddressEqual(activeAdapter, sourceAdapter.address),
                )
              )
                continue;

              for (const sourceMarketReference of sourceAdapter.markets) {
                const sourceMarket = data.getMarket(sourceMarketReference.id);
                if (
                  !isAddressEqual(sourceMarket.params.loanToken, vault.asset) ||
                  !isAddressEqual(
                    sourceMarket.params.irm,
                    sourceAdapter.adaptiveCurveIrm,
                  )
                )
                  continue;
                if (sourceMarket.id.toLowerCase() === normalizedMarketId)
                  continue;

                const candidate = _try(() => {
                  const sourceIds = getAdapterIds(
                    adapterIdsCache,
                    sourceAdapter,
                    sourceMarket,
                  );
                  const [, , sourceAdapterMarketCapId] = sourceIds;
                  const sourceConfig = data.getMarketPublicAllocatorConfig(
                    vaultAddress,
                    sourceAdapterMarketCapId,
                  );
                  if (
                    !isAddressEqual(sourceConfig.vault, vaultAddress) ||
                    !isAddressEqual(
                      sourceConfig.adapter,
                      sourceAdapter.address,
                    ) ||
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
            // MorphoMarketV1AdapterV2 rejects supplies that mint fewer shares than assets.
            if (
              targetMarket.toSupplyShares(reallocation.assets, "Down") <
              reallocation.assets
            )
              continue;

            // Cap fit is monotonic but not linear in assets: the amount changes
            // penalty donations, firstTotalAssets, rounded shares, and possibly
            // shared allocation IDs. Binary search finds the exact largest fit.
            let lower = 0n;
            let upper = reallocation.assets;
            let probeUpper = true;
            const reallocationAdapter = data.getAdapter(
              reallocation.vault,
              reallocation.to.adapter,
            );
            const targetIds = getAdapterIds(
              adapterIdsCache,
              reallocationAdapter,
              targetMarket,
            );

            while (lower < upper) {
              const assets = probeUpper ? upper : (lower + upper + 1n) / 2n;
              probeUpper = false;
              const postState = _try(
                () =>
                  data.cloneWithPublicReallocation({
                    reallocation: { ...reallocation, assets },
                    targetMarketId: marketId,
                    timestamp: targetMarket.lastUpdate,
                    adapterIdsCache,
                    probe: true,
                  }),
                ReallocationAllocationUnderflowError,
                ReallocationAdapterSupplySharesUnderflowError,
              );
              if (postState == null) {
                upper = assets - 1n;
                continue;
              }
              const postVault = postState.getVault(reallocation.vault);
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
        adapterIdsCache,
      });
    }
  }

  /**
   * Sums friendly Vault V2 shared liquidity available to a target market.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional timestamp, enable flag, vault allowlist, source utilization ceiling, and maximum penalty.
   * @returns Reallocatable market and idle assets, or `0n` when none are available.
   * @throws {NegativeInputError} when `maxWithdrawalUtilization` or `maxPenalty` is negative.
   * @throws {InputExceedsMaxError} when `maxWithdrawalUtilization` or `maxPenalty` exceeds WAD.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const liquidity: bigint = data.getPublicReallocationLiquidity(
   *   marketParams.id,
   *   { timestamp: block.timestamp },
   * );
   * ```
   */
  public getPublicReallocationLiquidity(
    marketId: MarketId,
    options?: VaultV2BluePublicAllocatorOptions,
  ) {
    if (options?.enabled === false) return 0n;

    const maxPenalty = resolveMaxPenalty(options?.maxPenalty);

    return this.computeVaultV2BlueReallocationsAtUtilization({
      marketId,
      maxWithdrawalUtilization: resolveMaxWithdrawalUtilization(
        options?.maxWithdrawalUtilization,
      ),
      options: { ...options, maxPenalty },
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
   * @throws {NegativeInputError} when `maxWithdrawalUtilization` or `maxPenalty` is negative.
   * @throws {InputExceedsMaxError} when `maxWithdrawalUtilization` or `maxPenalty` exceeds WAD.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, parseEther } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const marketParams = markets[mainnet.id].usdc_wbtc;
   * const market = client.morpho.blue(marketParams, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const data = await market.getVaultV2BlueReallocationData({
   *   vaultAddresses: [keyrockUsdcVaultV2],
   *   block: { number: block.number, timestamp: block.timestamp },
   * });
   * const liquidity: bigint = data.getAvailableLiquidityToUtilization(
   *   marketParams.id,
   *   parseEther("0.9"),
   *   { timestamp: block.timestamp },
   * );
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
    if (
      options?.enabled === false ||
      DEFAULT_SUPPLY_TARGET_UTILIZATION > utilization
    )
      return market.getBorrowToUtilization(utilization);

    const availableLiquidity =
      this.computeVaultV2BlueReallocationsAtUtilization({
        marketId,
        maxWithdrawalUtilization: resolveMaxWithdrawalUtilization(
          options?.maxWithdrawalUtilization,
        ),
        options: {
          ...options,
          timestamp,
          maxPenalty: resolveMaxPenalty(options?.maxPenalty),
        },
      }).reallocations.reduce((total, { assets }) => total + assets, 0n);
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
    adapterIdsCache = new Map(),
    probe = false,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly targetMarketId: MarketId;
    readonly timestamp: bigint;
    readonly adapterIdsCache?: Map<string, AdapterIds>;
    readonly probe?: boolean;
  }) {
    const sourceVaultKey = findAddressKey(
      this.mutableVaults,
      reallocation.vault,
    );
    const sourceAllocationsKey = findAddressKey(
      this.mutableAllocations,
      reallocation.vault,
    );
    const data = probe
      ? new VaultV2BlueReallocationData({
          chainId: this.chainId,
          markets: { [targetMarketId]: this.getMarket(targetMarketId) },
          vaults:
            sourceVaultKey == null
              ? {}
              : { [sourceVaultKey]: this.mutableVaults[sourceVaultKey] },
          allocations:
            sourceAllocationsKey == null
              ? {}
              : {
                  [sourceAllocationsKey]:
                    this.mutableAllocations[sourceAllocationsKey],
                },
        })
      : this.clone();
    if (probe) {
      const sourceDonationKey = findAddressKey(
        this.donatedPenaltyAssets,
        reallocation.vault,
      );
      if (sourceDonationKey != null)
        data.donatedPenaltyAssets[sourceDonationKey] =
          this.donatedPenaltyAssets[sourceDonationKey]!;
      const sourceFirstTotalAssetsKey = findAddressKey(
        this.firstTotalAssets,
        reallocation.vault,
      );
      if (sourceFirstTotalAssetsKey != null)
        data.firstTotalAssets[sourceFirstTotalAssetsKey] =
          this.firstTotalAssets[sourceFirstTotalAssetsKey]!;
    }

    const vaultKey =
      findAddressKey(data.mutableVaults, reallocation.vault) ??
      reallocation.vault;
    const allocationsKey =
      findAddressKey(data.mutableAllocations, reallocation.vault) ??
      reallocation.vault;
    const donationKey =
      findAddressKey(data.donatedPenaltyAssets, reallocation.vault) ?? vaultKey;
    const firstTotalAssetsKey =
      findAddressKey(data.firstTotalAssets, reallocation.vault) ?? vaultKey;
    let vault = data.getMutableVault(vaultKey);
    const targetMarket = data.getMarket(targetMarketId);

    const penaltyAssets =
      VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
        reallocation,
        reallocation.assets,
      );
    vault.assetBalance += penaltyAssets;
    data.donatedPenaltyAssets[donationKey] =
      (data.donatedPenaltyAssets[donationKey] ?? 0n) + penaltyAssets;

    if (reallocation.from.type === "market") {
      const sourceAdapter = data.getMutableAdapter(
        reallocation.vault,
        reallocation.from.adapter,
      );
      const sourceMarket = data.getMarket(reallocation.from.marketParams.id);
      const sourceIds = getAdapterIds(
        adapterIdsCache,
        sourceAdapter,
        sourceMarket,
      );
      const [, , sourceAdapterMarketCapId] = sourceIds;
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
        ) -
        data.getAllocation(reallocation.vault, sourceAdapterMarketCapId)
          .allocation;
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
        data.mutableAllocations[allocationsKey]![id] = {
          ...allocation,
          allocation: nextAllocation,
        };
      }
      vault.assetBalance += reallocation.assets;
    }

    if (data.firstTotalAssets[firstTotalAssetsKey] == null) {
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
      data.mutableVaults[vaultKey] = vault;
      data.firstTotalAssets[firstTotalAssetsKey] = vault._totalAssets;
    }

    const targetAdapter = data.getMutableAdapter(
      reallocation.vault,
      reallocation.to.adapter,
    );
    const targetIds = getAdapterIds(
      adapterIdsCache,
      targetAdapter,
      targetMarket,
    );
    const [, , targetAdapterMarketCapId] = targetIds;

    const currentTargetMarket = data.getMarket(targetMarket.id);
    const oldTargetAllocation = data.getAllocation(
      reallocation.vault,
      targetAdapterMarketCapId,
    ).allocation;
    const supply = currentTargetMarket.supply(
      reallocation.assets,
      0n,
      timestamp,
    );
    const targetSupplyShares =
      (targetAdapter.supplyShares[targetMarket.id] ?? 0n) + supply.shares;
    targetAdapter.supplyShares[targetMarket.id] = targetSupplyShares;
    if (!targetAdapter.marketIds.includes(targetMarket.id))
      targetAdapter.marketIds.push(targetMarket.id);
    if (!targetAdapter.markets.some(({ id }) => id === targetMarket.id))
      targetAdapter.markets.push(supply.market);
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
      data.mutableAllocations[allocationsKey]![id] = {
        ...allocation,
        allocation: nextAllocation,
      };
    }

    vault.assetBalance -= reallocation.assets;
    return data;
  }

  /** Updates one canonical market and its dependent adapter views. */
  private setMarket(market: Market) {
    this.setMarkets([market]);
  }

  /** Updates canonical markets in bulk and refreshes only dependent adapter views. */
  private setMarkets(markets: Iterable<Market>) {
    const changedMarketIds = new Set<MarketId>();
    for (const market of markets) {
      this.mutableMarkets[market.id] = market;
      changedMarketIds.add(market.id);
    }
    if (changedMarketIds.size === 0) return;

    // A Morpho market is global state shared by every vault position. Legacy
    // AccrualPosition constructors copy their Market, so rebuild those adapter
    // views as well as repointing V2 adapters whenever the canonical state moves.
    for (const vault of Object.values(this.mutableVaults)) {
      if (vault == null) continue;
      const adapters = new Set(vault.accrualAdapters);
      if (vault.accrualLiquidityAdapter != null)
        adapters.add(vault.accrualLiquidityAdapter);

      for (const adapter of adapters) {
        if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
          if (!adapter.markets.some(({ id }) => changedMarketIds.has(id)))
            continue;
          adapter.markets = adapter.markets.map((adapterMarket) =>
            getCanonicalMarket(this.mutableMarkets, adapterMarket),
          );
        } else if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
          if (
            !adapter.positions.some(({ marketId }) =>
              changedMarketIds.has(marketId),
            )
          )
            continue;
          adapter.positions = adapter.positions.map((position) =>
            clonePosition(position, this.mutableMarkets),
          );
        } else if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
          if (
            ![...adapter.accrualVaultV1.allocations.keys()].some((marketId) =>
              changedMarketIds.has(marketId),
            )
          )
            continue;
          adapter.accrualVaultV1 = cloneAccrualVault(
            adapter.accrualVaultV1,
            this.mutableMarkets,
          );
        }
      }
    }
  }
}
