import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  type BigIntish,
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
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1ReferralFeeAssets,
} from "../actions/blue/common.js";
import {
  DEFAULT_MAX_REALLOCATION_PENALTY,
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  MAX_REALLOCATION_PENALTY,
} from "../helpers/constant.js";
import {
  resolveAllocatorCapHeadroom,
  resolveCapAccrualBuffer,
  resolveMaxWithdrawalUtilization,
} from "../helpers/utilization.js";
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
  ReferralFeePctExceededError,
  UnknownReallocationActiveAdaptersError,
  UnknownReallocationAdapterError,
  UnknownReallocationAllocationError,
  UnknownReallocationMarketError,
  UnknownReallocationMarketPublicAllocatorConfigError,
  UnknownReallocationPublicAllocatorConfigError,
  UnknownReallocationVaultError,
} from "../types/index.js";

type ReadonlyMarketSnapshot = Readonly<Market>;

const MAX_SHARED_CAP_SEARCH_STEPS = 1_024n;

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

/**
 * A vault adapter-market position whose pre-plan interest accrual is reserved
 * on the cap ids it contributes to.
 * @internal
 */
interface CapReservePair {
  readonly key: string;
  readonly ids: AdapterIds;
  readonly reserve: (reserves: CapReserveState) => bigint;
}

interface ReallocationCandidate {
  readonly reallocation: VaultV2BlueReallocation;
  readonly targetPair: CapReservePair;
  readonly sourcePair?: CapReservePair;
  /** Allocator max-in for the target, net of the kept cap headroom. */
  readonly allocatorHeadroom: bigint;
}

/** Plan-scoped, deliberately mutable reserve state shared by every planner pass. @internal */
interface CapReserveState {
  readonly initialMarkets: Readonly<Record<MarketId, Market | undefined>>;
  readonly marketAccruals: Map<MarketId, readonly [Market, Market]>;
  readonly touchedPairs: Map<string, Map<string, CapReservePair>>;
  readonly reserveByPairKey: Map<string, bigint>;
}

const createCapReserveState = (
  markets: CapReserveState["initialMarkets"],
): CapReserveState => ({
  initialMarkets: { ...markets },
  marketAccruals: new Map(),
  touchedPairs: new Map(),
  reserveByPairKey: new Map(),
});

const cloneCapReserveState = (state: CapReserveState): CapReserveState => {
  const touchedPairs = new Map<string, Map<string, CapReservePair>>();
  for (const [vault, pairs] of state.touchedPairs) {
    touchedPairs.set(vault, new Map(pairs));
  }

  return {
    initialMarkets: { ...state.initialMarkets },
    marketAccruals: new Map(state.marketAccruals),
    touchedPairs,
    reserveByPairKey: new Map(state.reserveByPairKey),
  };
};

/** Transaction-scoped state shared by transitions in one simulated call. @internal */
interface SimulationContext {
  readonly donatedPenaltyAssets: Readonly<Record<Address, bigint>>;
  readonly firstTotalAssets: Readonly<Record<Address, bigint>>;
}

/** Creates isolated transaction-scoped state for one simulation. @internal */
const createSimulationContext = (): SimulationContext => ({
  donatedPenaltyAssets: {},
  firstTotalAssets: {},
});

/** Input state required to simulate Vault V2 BluePublicAllocator reallocations. */
export interface InputVaultV2BlueReallocationData {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;
  /**
   * Timestamp of the block the state was fetched at. When present, this is the
   * default planning timestamp when `options.timestamp` is omitted, never
   * earlier than the latest market/vault `lastUpdate`; when absent, planning
   * defaults to the latest market/vault `lastUpdate`.
   */
  readonly timestamp?: BigIntish;
  /**
   * Morpho Blue's ERC-20 balances at the snapshot block, indexed by token address.
   * Explicit balances increase with idle-sourced reallocations in returned
   * post-states. Sizing has zero margin over the snapshot balance, so activity
   * on other Blue markets with the same loan token can make a plan revert;
   * refetch close to submission. A missing token uses summed non-negative
   * snapshot-market supply-minus-borrow only to size plans; balance-based
   * rejection requires an explicit balance.
   */
  readonly blueBalances?: Readonly<Record<Address, BigIntish | undefined>>;
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
  if (Object.hasOwn(record, address)) {
    return address;
  }
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
  if (cached != null) {
    return cached;
  }

  const ids = adapter.ids(market.params);
  cache.set(key, ids);
  return ids;
};

const resolveMaxPenalty = (value: bigint | undefined) => {
  const penalty = value ?? DEFAULT_MAX_REALLOCATION_PENALTY;
  if (penalty < 0n) {
    throw new NegativeInputError("maxPenalty", penalty);
  }
  if (penalty > MAX_REALLOCATION_PENALTY) {
    throw new InputExceedsMaxError({
      field: "maxPenalty",
      value: penalty,
      max: MAX_REALLOCATION_PENALTY,
    });
  }
  return penalty;
};

const getCanonicalMarket = (
  markets: Record<MarketId, Market | undefined>,
  market: Market,
) => (markets[market.id] ??= new Market({ ...market }));

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
    },
    [...vault.allocations.values()].map(({ config, position }) => ({
      config: {
        ...config,
        pendingCap: { ...config.pendingCap },
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

  if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
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
  }

  if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
    return new AccrualVaultV2MorphoMarketV1Adapter(
      { ...base, marketParamsList: [...adapter.marketParamsList] },
      adapter.positions.map((position) => clonePosition(position, markets)),
    );
  }

  if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
    return new AccrualVaultV2MorphoVaultV1Adapter(
      {
        ...base,
        morphoVaultV1: adapter.morphoVaultV1,
        parentAllocation: adapter.parentAllocation,
      },
      cloneAccrualVault(adapter.accrualVaultV1, markets),
      adapter.shares,
    );
  }

  throw new UnsupportedVaultV2AdapterError(adapter.address);
};

const cloneVault = (
  vault: ReadonlyVaultSnapshot,
  {
    markets,
    adapterKeysToClone,
  }: {
    readonly markets: Record<MarketId, Market | undefined>;
    readonly adapterKeysToClone?: ReadonlySet<string>;
  },
) => {
  const adapters = vault.accrualAdapters.map((adapter) =>
    adapterKeysToClone == null ||
    adapterKeysToClone.has(adapter.address.toLowerCase())
      ? cloneAdapter(adapter, markets)
      : adapter,
  );
  const accrualLiquidityAdapter = vault.accrualLiquidityAdapter;
  const liquidityAdapter =
    accrualLiquidityAdapter == null
      ? undefined
      : (adapters.find((adapter) =>
          isAddressEqual(adapter.address, accrualLiquidityAdapter.address),
        ) ??
        (adapterKeysToClone == null ||
        adapterKeysToClone.has(accrualLiquidityAdapter.address.toLowerCase())
          ? cloneAdapter(accrualLiquidityAdapter, markets)
          : accrualLiquidityAdapter));

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
 * instance. Planning keeps the transaction-scoped `firstTotalAssets`
 * denominator outside the durable snapshot while applying reallocations in
 * contract order. Penalty donations update simulated vault accounting but are
 * excluded from same-plan idle liquidity so round-up dust cannot create
 * self-replenishing candidates.
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
 * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
  /** Mutable Blue token balances used only by cloned simulation transitions. */
  private readonly mutableBlueBalances: Record<Address, bigint | undefined>;
  /** Chain id associated with this snapshot. */
  public readonly chainId: number;
  /** Timestamp of the block the state was fetched at. */
  public readonly timestamp?: bigint;
  /**
   * Morpho Blue's ERC-20 balances at the snapshot block, indexed by token address.
   * Explicit balances increase with idle-sourced reallocations in returned
   * post-states. Sizing has zero margin over the snapshot balance, so activity
   * on other Blue markets with the same loan token can make a plan revert;
   * refetch close to submission. A missing token uses summed non-negative
   * snapshot-market supply-minus-borrow only to size plans; balance-based
   * rejection requires an explicit balance.
   */
  public readonly blueBalances: Readonly<Record<Address, bigint | undefined>>;
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
   * @throws {UnsupportedBlueVaultV2AdapterError} when a vault contains an unsupported adapter type.
   */
  public constructor(input: InputVaultV2BlueReallocationData) {
    const isClone = input instanceof VaultV2BlueReallocationData;
    this.chainId = input.chainId;
    this.timestamp =
      input.timestamp == null ? undefined : BigInt(input.timestamp);
    this.mutableMarkets = {};
    this.mutableVaults = {};
    this.mutableAllocations = {};
    this.mutableBlueBalances = {};
    this.markets = this.mutableMarkets;
    this.vaults = this.mutableVaults;
    this.allocations = this.mutableAllocations;
    this.blueBalances = this.mutableBlueBalances;
    if (isClone) {
      this.publicAllocatorConfigs = input.publicAllocatorConfigs;
      this.activeAdapters = input.activeAdapters;
      this.marketPublicAllocatorConfigs = input.marketPublicAllocatorConfigs;
    } else {
      const configurations = cloneAllocatorConfigurations(input);
      this.publicAllocatorConfigs = configurations.publicAllocatorConfigs;
      this.activeAdapters = configurations.activeAdapters;
      this.marketPublicAllocatorConfigs =
        configurations.marketPublicAllocatorConfigs;
    }

    for (const [marketId, market] of Object.entries(input.markets ?? {}) as [
      MarketId,
      ReadonlyMarketSnapshot | undefined,
    ][]) {
      this.mutableMarkets[marketId] =
        market == null ? undefined : new Market({ ...market });
    }

    for (const [token, balance] of Object.entries(input.blueBalances ?? {}) as [
      Address,
      BigIntish | undefined,
    ][]) {
      this.mutableBlueBalances[token] =
        balance == null ? undefined : BigInt(balance);
    }

    for (const [address, vault] of Object.entries(input.vaults ?? {}) as [
      Address,
      ReadonlyVaultSnapshot | undefined,
    ][]) {
      const clonedVault =
        vault == null
          ? undefined
          : cloneVault(vault, { markets: this.mutableMarkets });
      this.mutableVaults[address] = clonedVault;
    }

    // Populate the instance's allocation snapshots after cloning vault views.
    this.copyAllocationSnapshots(input, isClone);
  }

  /** Copies allocation entries, retaining the clone path's shallow-copy semantics. @internal */
  private copyAllocationSnapshots(
    input: InputVaultV2BlueReallocationData,
    isClone: boolean,
  ): void {
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
      const clonedAllocations: Record<Hash, IVaultV2Allocation | undefined> =
        {};
      this.mutableAllocations[vault] = clonedAllocations;
      for (const [id, allocation] of Object.entries(allocations ?? {}) as [
        Hash,
        IVaultV2Allocation | undefined,
      ][]) {
        clonedAllocations[id] =
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (market == null) {
      throw new UnknownReallocationMarketError(marketId);
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (data == null) {
      throw new UnknownReallocationVaultError(vault);
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (allocation == null) {
      throw new UnknownReallocationAllocationError(vault, id);
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (config == null) {
      throw new UnknownReallocationPublicAllocatorConfigError(vault);
    }
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
    if (key == null) {
      throw new UnknownReallocationPublicAllocatorConfigError(vault);
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (adapters == null) {
      throw new UnknownReallocationActiveAdaptersError(vault);
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (config == null) {
      throw new UnknownReallocationMarketPublicAllocatorConfigError(
        vault,
        adapterMarketCapId,
      );
    }
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (data == null) {
      throw new UnknownReallocationAdapterError(vault, adapter);
    }
    return data;
  }

  /**
   * Computes Vault V2 BluePublicAllocator calls available for a target market.
   *
   * Without `options.operation`, discovers every friendly call. With an
   * operation, penalty tiers are considered ascending, starting with free
   * vaults. The free tier aims to bring the target market back to 90%
   * utilization; positive tiers cover the remaining absolute shortfall or,
   * when larger, Blue's loan-token balance deficit while the penalty is
   * flash-loaned. Within each tier, source markets go to the
   * friendly source utilization (90% by default) before 100%. Free capacity
   * inside `allocatorCapHeadroom` is kept unused, so a penalized leg can cover
   * it instead. Discovery and liquidity getters still count every vault up to
   * `options.maxPenalty`. A shared relative-cap lower bound may require one call
   * to exceed the targeted amount. For `refinance`, compute the plan on the
   * destination-market handle (for example,
   * `client.morpho.blue(destination.marketParams, chainId)`), not the source
   * handle. Pass the source position's `borrowAssets` accrued to
   * `max(now, source.lastUpdate, destination.lastUpdate) + 2h` as
   * `operation.amount`; the optional `operation.referralFeePct` is WAD-scaled.
   * The planner includes the referral fee and its allocator-leg penalties in
   * destination debt, so penalized legs also cover their own penalty.
   * Refinance never uses vaults with a 100% penalty.
   * BlueBundlesV1 flash-loans the plan's penalty from Blue before executing
   * reallocation legs. When an explicit `blueBalances` value is supplied, plans
   * throw `InsufficientSharedLiquidityError` if Blue cannot fund that flash
   * loan or a market-sourced leg's withdrawal before later idle legs arrive.
   * Legs are not reordered. A missing balance falls back to summed snapshot-
   * market liquidity only to size plans and may make them larger; it cannot
   * cause rejection for Blue-balance constraints.
   * Sizing has zero margin over the snapshot balance; activity on other Blue
   * markets with the same loan token can make a plan revert. Refetch close to
   * submission; there is no balance-buffer option.
   * Friendly source utilization defaults to 90% and is configurable through
   * `options.maxWithdrawalUtilization`. Market/vault state and the returned
   * post-state stay at `timestamp`. An enabled operation that needs no
   * reallocation still returns a clone accrued to `timestamp`. Only
   * target-market cap checks reserve interest the vault's existing allocation
   * would accrue through `timestamp + capAccrualBuffer`
   * (two hours by default; `0n` disables it). When an operation's plan would
   * come within `allocatorCapHeadroom` (1% of the cap by default) of a target
   * BluePublicAllocator cap, the plan is reduced to the larger of the
   * operation's absolute shortfall and what unbound legs moved (legs that
   * neither come within the headroom of an allocator cap nor take nearly all
   * of their source vault's idle). The kept headroom absorbs other allocations
   * up to that share of the cap landing before inclusion. The plan uses the
   * full cap only when the shortfall needs it, and can then still revert if
   * another allocation lands first.
   * Idle legs that together leave at most `allocatorCapHeadroom` of a source
   * vault's starting idle are bound the same way, so an operation without
   * shortfall whose plan draws only on such idle plans no reallocation.
   * A plan of only the shortfall leaves the market fully utilized, so a
   * competing borrow or withdraw landing first can also make it revert. For
   * market-source reallocations
   * the source position's interest is also reserved on cap ids shared with the
   * target, and reserves persist across every leg of a plan. Targets with no remaining supply
   * or allocator capacity are skipped before projecting source interest. The
   * adapter's minimum share minting requirement, supply-share limits, and target
   * absolute or zero relative caps are checked against a one-asset deposit.
   * Shared cap IDs that a source withdrawal can reduce remain eligible. Each
   * accepted leg counts at least its requested `assets` against the target cap
   * IDs, so a leg sized to a cap leaves no rounding headroom.
   *
   * Shared-cap discovery is conservative. Operation planning searches at most
   * 1,024 base units above its targeted amount for the nearest executable fit.
   * Full-liquidity discovery omits a candidate when its non-shared maximum
   * violates a shared cap instead of scanning smaller base-unit amounts. These
   * bounds can understate executable liquidity in rounding-only edge cases.
   * With an explicit Blue balance, a paid operation may retry the same search
   * from a physical-funding budget and keep a strictly cheaper feasible plan.
   * This bounded refinement does not guarantee globally minimal penalties.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional discovery controls and operation to support.
   * Market/vault state and returned post-state stay at `timestamp`; only
   * target-market cap checks reserve interest on the vault's existing allocation
   * through `timestamp + capAccrualBuffer` (two hours by default; `0n` disables).
   * For market-source reallocations the source position's interest is also
   * reserved on cap ids shared with the target, and reserves persist across
   * every leg of a plan.
   * @returns Flat action-ready reallocations and their post-simulation state.
   * @throws {UnsupportedBlueMarketIrmError} when a market with positive debt uses an unsupported IRM.
   * @throws {NegativeInputError} when `capAccrualBuffer`, `allocatorCapHeadroom`, `maxWithdrawalUtilization`, `maxPenalty`, or `referralFeePct` is negative.
   * @throws {InputExceedsMaxError} when `allocatorCapHeadroom`, `maxWithdrawalUtilization`, or `maxPenalty` exceeds WAD, or an enabled borrow/withdraw plan otherwise covers its shortfall but its planned penalty exceeds the operation amount.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {NonPositiveInputError} when the operation amount is not positive and planning is enabled.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the operation shortfall or refinance penalties, or an explicit Blue balance cannot fund the penalty flash loan, an earlier market-sourced withdrawal, or the final operation transfer.
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
      readonly operation?:
        | {
            readonly type: "borrow" | "withdraw";
            readonly amount: bigint;
          }
        | {
            readonly type: "refinance";
            readonly amount: bigint;
            readonly referralFeePct?: bigint;
          };
    } = {},
  ): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  } {
    if (options.enabled === false) {
      return { reallocations: [], data: this };
    }

    const maxWithdrawalUtilization = resolveMaxWithdrawalUtilization(
      options.maxWithdrawalUtilization,
    );
    const maxPenalty = resolveMaxPenalty(options.maxPenalty);
    const capAccrualBuffer = resolveCapAccrualBuffer(options.capAccrualBuffer);
    const allocatorCapHeadroom = resolveAllocatorCapHeadroom(
      options.allocatorCapHeadroom,
    );
    const resolvedOptions = { ...options, maxPenalty };
    const operation = options.operation;
    if (operation == null) {
      const { reallocations, data } =
        this.clone().computeVaultV2BlueReallocationsAtUtilizationInPlace({
          context: createSimulationContext(),
          reserves: createCapReserveState(this.mutableMarkets),
          marketId,
          maxWithdrawalUtilization,
          capAccrualBuffer,
          options: resolvedOptions,
        });
      return { reallocations, data };
    }

    const { amount, type } = operation;
    const feeAssets = resolveOperationFeeAssets(operation);

    const { normalizedOptions, market, hasExplicitBlueBalance, blueBalance } =
      this.resolveOperationSnapshot({ marketId, options, resolvedOptions });

    const { newTotalBorrowAssets, newTotalSupplyAssets } =
      getOperationMarketTotals({ market, marketId, type, amount, feeAssets });

    const requiredAssets =
      MathLib.wDivUp(newTotalBorrowAssets, DEFAULT_SUPPLY_TARGET_UTILIZATION) -
      newTotalSupplyAssets;
    if (
      MarketUtils.getUtilization({
        totalSupplyAssets: newTotalSupplyAssets,
        totalBorrowAssets: newTotalBorrowAssets,
      }) <= DEFAULT_SUPPLY_TARGET_UTILIZATION ||
      requiredAssets <= 0n
    ) {
      const data = this.clone();
      data.setMarkets([market]);
      return { reallocations: [], data };
    }

    const absoluteShortfall =
      newTotalBorrowAssets > newTotalSupplyAssets
        ? newTotalBorrowAssets - newTotalSupplyAssets
        : 0n;
    const penaltyTiers = [
      0n,
      ...new Set(
        Object.values(this.publicAllocatorConfigs).flatMap((config) =>
          config != null && config.penalty > 0n && config.penalty <= maxPenalty
            ? [config.penalty]
            : [],
        ),
      ),
    ].sort(bigIntComparator((tier) => tier));
    const plan = (
      maxAssets: bigint,
      {
        headroom,
        usePhysicalBalance = false,
      }: { readonly headroom: bigint; readonly usePhysicalBalance?: boolean },
    ) =>
      planVaultOperation({
        maxAssets,
        headroom,
        usePhysicalBalance,
        absoluteShortfall,
        penaltyTiers,
        type,
        maxWithdrawalUtilization,
        amount,
        feeAssets,
        blueBalance,
        capAccrualBuffer,
        normalizedOptions,
        hasExplicitBlueBalance,
        marketId,
        initialData: this,
        initialMarkets: this.mutableMarkets,
        runUtilizationPass: (data, args) =>
          data.computeVaultV2BlueReallocationsAtUtilizationInPlace(args),
      });

    return selectOperationPlan({
      plan,
      requiredAssets,
      allocatorCapHeadroom,
      absoluteShortfall,
      hasExplicitBlueBalance,
      marketId,
      type,
      amount,
      blueBalance,
      feeAssets,
    });
  }

  /** Resolves the operation's accrued market and shared-Blue liquidity snapshot. @internal */
  private resolveOperationSnapshot({
    marketId,
    options,
    resolvedOptions,
  }: {
    readonly marketId: MarketId;
    readonly options: VaultV2BluePublicAllocatorOptions;
    readonly resolvedOptions: VaultV2BluePublicAllocatorOptions;
  }) {
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
    const blueBalanceKey = findAddressKey(
      this.mutableBlueBalances,
      market.params.loanToken,
    );
    const explicitBlueBalance =
      blueBalanceKey == null
        ? undefined
        : this.mutableBlueBalances[blueBalanceKey];
    const hasExplicitBlueBalance = explicitBlueBalance !== undefined;
    const blueBalance =
      explicitBlueBalance ??
      Object.values(this.mutableMarkets).reduce(
        (total, snapshotMarket) =>
          snapshotMarket != null &&
          isAddressEqual(
            snapshotMarket.params.loanToken,
            market.params.loanToken,
          )
            ? total +
              MathLib.zeroFloorSub(
                snapshotMarket.totalSupplyAssets,
                snapshotMarket.totalBorrowAssets,
              )
            : total,
        0n,
      );

    return { normalizedOptions, market, hasExplicitBlueBalance, blueBalance };
  }

  private computeVaultV2BlueReallocationsAtUtilizationInPlace({
    context,
    reserves,
    marketId,
    maxWithdrawalUtilization,
    maxAssets,
    capAccrualBuffer,
    allocatorCapHeadroom = 0n,
    penalty,
    options = {},
  }: {
    readonly context: SimulationContext;
    readonly reserves: CapReserveState;
    readonly marketId: MarketId;
    readonly maxWithdrawalUtilization: bigint;
    readonly maxAssets?: bigint;
    readonly capAccrualBuffer: bigint;
    readonly allocatorCapHeadroom?: bigint;
    readonly penalty?: bigint;
    readonly options?: VaultV2BluePublicAllocatorOptions;
  }): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
    readonly context: SimulationContext;
    /** Lowercased `vault:targetAdapter` keys of accepted legs reaching their allocator max-in net of the kept headroom. */
    readonly allocatorCapBoundTargets: ReadonlySet<string>;
    /** Lowercased vault addresses whose accepted idle legs together leave at most `allocatorCapHeadroom` of the vault's starting idle. */
    readonly idleBoundVaults: ReadonlySet<string>;
  } {
    if (options.enabled === false) {
      return {
        reallocations: [],
        data: this,
        context,
        allocatorCapBoundTargets: new Set(),
        idleBoundVaults: new Set(),
      };
    }

    this.getMarket(marketId);
    const timestamp =
      options.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    let data: VaultV2BlueReallocationData = this;
    let simulationContext = context;
    data.setMarkets([data.getMarket(marketId).accrueInterest(timestamp)]);
    const reallocations: VaultV2BlueReallocation[] = [];
    const configuredVaults = Object.keys(data.vaults) as Address[];
    const vaultKeyByLower = new Map<string, Address>(
      configuredVaults.map((vault) => [vault.toLowerCase(), vault]),
    );
    const vaults = Array.from(
      new Set(
        [...(options.reallocatableVaults ?? configuredVaults)]
          .map((vault) => vaultKeyByLower.get(vault.toLowerCase()))
          .filter((vault): vault is Address => vault != null),
      ),
    );
    const normalizedMarketId = marketId.toLowerCase();
    const adapterIdsCache = new Map<string, AdapterIds>();
    const activeAdaptersCache = new Map<Address, ReadonlySet<string>>();
    let remainingAssets = maxAssets;
    const allocatorCapBoundTargets = new Set<string>();
    const idleBoundVaults = new Set<string>();
    const initialIdleAssets = new Map<string, bigint>();
    const idleTakenAssets = new Map<string, bigint>();
    const { getPair, capReserve } = createCapReserveResolvers({
      reserves,
      adapterIdsCache,
      timestamp,
      capAccrualBuffer,
    });

    while (remainingAssets == null || remainingAssets > 0n) {
      const candidates = vaults
        .map((vaultAddress) => {
          const params = {
            vaultAddress,
            data,
            marketId,
            penalty,
            options,
            simulationContext,
            normalizedMarketId,
            adapterIdsCache,
            getPair,
            capReserve,
            reserves,
            allocatorCapHeadroom,
            timestamp,
            maxWithdrawalUtilization,
            remainingAssets,
            getOptionalPublicAllocatorConfig:
              data.getOptionalPublicAllocatorConfig.bind(data),
            setMarkets: data.setMarkets.bind(data),
            applyPublicReallocation: data.applyPublicReallocation.bind(data),
          };
          return planCachedVaultCandidate({
            ...params,
            initialIdleAssets,
            activeAdaptersCache,
          });
        })
        .filter(
          (candidate): candidate is ReallocationCandidate => candidate != null,
        )
        .sort(
          bigIntComparator(({ reallocation }) => reallocation.assets, "desc"),
        );

      const largest = candidates[0];
      if (largest == null) {
        return {
          reallocations,
          data,
          context: simulationContext,
          allocatorCapBoundTargets,
          idleBoundVaults,
        };
      }

      const updates = getAcceptedCandidateUpdates({
        candidate: largest,
        idleTakenAssets,
        initialIdleAssets,
        allocatorCapHeadroom,
        reserves,
      });
      updates.allocatorCapBoundTargets.forEach((key) =>
        allocatorCapBoundTargets.add(key),
      );
      updates.idleTakenAssets.forEach(([key, assets]) =>
        idleTakenAssets.set(key, assets),
      );
      updates.idleBoundVaults.forEach((key) => idleBoundVaults.add(key));
      updates.touchedVaultEntries.forEach(([key, pairs]) =>
        reserves.touchedPairs.set(key, pairs),
      );
      updates.touchedPairEntries.forEach(([key, pair]) =>
        updates.touchedVaultPairs.set(key, pair),
      );
      const { reallocation: acceptedReallocation } = largest;
      reallocations.push(acceptedReallocation);
      const transition = data.applyPublicReallocation({
        context: simulationContext,
        reallocation: acceptedReallocation,
        targetMarketId: marketId,
        timestamp,
        adapterIdsCache,
      });
      data = transition.data;
      simulationContext = transition.context;
      if (remainingAssets != null) {
        remainingAssets -= acceptedReallocation.assets;
      }
    }

    return {
      reallocations,
      data,
      context: simulationContext,
      allocatorCapBoundTargets,
      idleBoundVaults,
    };
  }

  /**
   * Sums friendly Vault V2 shared liquidity available to a target market.
   * Market/vault state and returned post-state stay at `timestamp`; only
   * target-market cap checks reserve interest on the vault's existing allocation
   * through `timestamp + capAccrualBuffer` (two hours by default; `0n` disables).
   * For market-source reallocations the source position's interest is also
   * reserved on cap ids shared with the target, and reserves persist across
   * every leg of a plan.
   *
   * @param marketId - Target Blue market id.
   * @param options - Optional timestamp, cap-accrual buffer, enable flag, vault
   * allowlist, source utilization ceiling, and maximum penalty.
   * @returns Reallocatable market and idle assets, or `0n` when none are available; rounding-only shared-cap fits may be conservatively omitted.
   * @throws {UnsupportedBlueMarketIrmError} when a market with positive debt uses an unsupported IRM.
   * @throws {NegativeInputError} when `capAccrualBuffer`, `maxWithdrawalUtilization`, or `maxPenalty` is negative.
   * @throws {InputExceedsMaxError} when `maxWithdrawalUtilization` or `maxPenalty` exceeds WAD.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    if (options?.enabled === false) {
      return 0n;
    }

    const capAccrualBuffer = resolveCapAccrualBuffer(options?.capAccrualBuffer);
    const maxPenalty = resolveMaxPenalty(options?.maxPenalty);

    return this.clone()
      .computeVaultV2BlueReallocationsAtUtilizationInPlace({
        context: createSimulationContext(),
        reserves: createCapReserveState(this.mutableMarkets),
        marketId,
        maxWithdrawalUtilization: resolveMaxWithdrawalUtilization(
          options?.maxWithdrawalUtilization,
        ),
        capAccrualBuffer,
        options: { ...options, maxPenalty },
      })
      .reallocations.reduce((total, { assets }) => total + assets, 0n);
  }

  /**
   * Computes borrow liquidity to a target utilization, including friendly
   * Vault V2 public reallocations. Market/vault state and returned post-state
   * stay at `timestamp`; only target-market cap checks reserve interest on the
   * vault's existing allocation through `timestamp + capAccrualBuffer` (two
   * hours by default; `0n` disables). For market-source reallocations the
   * source position's interest is also reserved on cap ids shared with the
   * target, and reserves persist across every leg of a plan.
   *
   * @param marketId - Target Blue market id.
   * @param utilization - Desired utilization, scaled by WAD. Defaults to 90%.
   * @param options - Optional timestamp, cap-accrual buffer, enable flag, vault
   * allowlist, source utilization ceiling, and maximum penalty.
   * @returns Borrowable assets while remaining at or below `utilization`; rounding-only shared-cap fits may be conservatively omitted.
   * @throws {UnsupportedBlueMarketIrmError} when a market with positive debt uses an unsupported IRM.
   * @throws {NegativeInputError} when `capAccrualBuffer`, `maxWithdrawalUtilization`, or `maxPenalty` is negative.
   * @throws {InputExceedsMaxError} when `maxWithdrawalUtilization` or `maxPenalty` exceeds WAD.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent for a vault.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
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
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
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
    const capAccrualBuffer = resolveCapAccrualBuffer(options?.capAccrualBuffer);
    const timestamp =
      options?.timestamp == null
        ? this.getLatestSnapshotTimestamp()
        : BigInt(options.timestamp);
    const market = this.getMarket(marketId).accrueInterest(timestamp);
    if (
      options?.enabled === false ||
      DEFAULT_SUPPLY_TARGET_UTILIZATION > utilization
    ) {
      return market.getBorrowToUtilization(utilization);
    }

    const availableLiquidity = this.clone()
      .computeVaultV2BlueReallocationsAtUtilizationInPlace({
        context: createSimulationContext(),
        reserves: createCapReserveState(this.mutableMarkets),
        marketId,
        maxWithdrawalUtilization: resolveMaxWithdrawalUtilization(
          options?.maxWithdrawalUtilization,
        ),
        capAccrualBuffer,
        options: {
          ...options,
          timestamp,
          maxPenalty: resolveMaxPenalty(options?.maxPenalty),
        },
      })
      .reallocations.reduce((total, { assets }) => total + assets, 0n);
    return MarketUtils.getBorrowToUtilization(
      {
        totalSupplyAssets: market.totalSupplyAssets + availableLiquidity,
        totalBorrowAssets: market.totalBorrowAssets,
      },
      utilization,
    );
  }

  private getLatestSnapshotTimestamp() {
    let timestamp = this.timestamp ?? 0n;
    for (const market of Object.values(this.markets)) {
      if (market != null) {
        timestamp = MathLib.max(timestamp, market.lastUpdate);
      }
    }
    for (const vault of Object.values(this.vaults)) {
      if (vault != null) {
        timestamp = MathLib.max(timestamp, vault.lastUpdate);
      }
    }
    return timestamp;
  }

  private applyPublicReallocation({
    context,
    reallocation,
    targetMarketId,
    timestamp,
    adapterIdsCache = new Map(),
    probe = false,
  }: {
    readonly context: SimulationContext;
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
    const sourceVault =
      sourceVaultKey == null ? undefined : this.mutableVaults[sourceVaultKey];
    let data: VaultV2BlueReallocationData = this;
    if (probe) {
      data = this.cloneReallocationProbe({
        reallocation,
        targetMarketId,
        adapterIdsCache,
        sourceVaultKey,
        sourceVault,
        sourceAllocationsKey,
      });
    }

    const vaultKey =
      findAddressKey(data.mutableVaults, reallocation.vault) ??
      reallocation.vault;
    const allocationsKey =
      findAddressKey(data.mutableAllocations, reallocation.vault) ??
      reallocation.vault;
    const firstTotalAssetsKey =
      findAddressKey(context.firstTotalAssets, reallocation.vault) ?? vaultKey;
    let firstTotalAssets = context.firstTotalAssets[firstTotalAssetsKey];
    let nextContext = context;
    let vault = data.getMutableVault(vaultKey);
    const targetMarket = data.getMarket(targetMarketId);

    const penaltyAssets =
      VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
        reallocation,
        reallocation.assets,
      );
    vault.assetBalance += penaltyAssets;
    if (penaltyAssets > 0n) {
      const donatedPenaltyAssetsKey =
        findAddressKey(context.donatedPenaltyAssets, reallocation.vault) ??
        vaultKey;
      // Track the donation separately so its rounded dust cannot replenish
      // same-plan idle candidates while remaining in simulated post-state.
      nextContext = {
        ...nextContext,
        donatedPenaltyAssets: {
          ...nextContext.donatedPenaltyAssets,
          [donatedPenaltyAssetsKey]:
            (nextContext.donatedPenaltyAssets[donatedPenaltyAssetsKey] ?? 0n) +
            penaltyAssets,
        },
      };
    }

    if (reallocation.from.type === "market") {
      // Book the source withdrawal and cap deltas before supplying the target.
      data.withdrawReallocationSource({
        reallocation,
        source: reallocation.from,
        timestamp,
        adapterIdsCache,
        allocationsKey,
        vault,
      });
    }

    // Idle allocations also credit the instance's explicit Blue liquidity balance.
    if (reallocation.from.type === "idle") {
      data.creditIdleReallocationBalance(reallocation, targetMarket);
    }

    if (firstTotalAssets == null) {
      const firstAllocation = data.accrueReallocationFirstAllocation({
        vault,
        vaultKey,
        timestamp,
        context: nextContext,
        firstTotalAssetsKey,
      });
      vault = firstAllocation.vault;
      firstTotalAssets = firstAllocation.firstTotalAssets;
      nextContext = firstAllocation.context;
    }

    // Book the target shares and cap deltas in the working state.
    data.supplyReallocationTarget({
      reallocation,
      adapterIdsCache,
      targetMarket,
      timestamp,
      probe,
      allocationsKey,
    });
    vault.assetBalance -= reallocation.assets;
    return { data, context: nextContext, firstTotalAssets };
  }

  /** Supplies the target position and books its rounded allocation changes. @internal */
  private supplyReallocationTarget({
    reallocation,
    adapterIdsCache,
    targetMarket,
    timestamp,
    probe,
    allocationsKey,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly adapterIdsCache: Map<string, AdapterIds>;
    readonly targetMarket: ReadonlyMarketSnapshot;
    readonly timestamp: bigint;
    readonly probe: boolean;
    readonly allocationsKey: Address;
  }): void {
    const targetAdapter = this.getMutableAdapter(
      reallocation.vault,
      reallocation.to.adapter,
    );
    const targetIds = getAdapterIds(
      adapterIdsCache,
      targetAdapter,
      targetMarket,
    );
    const [, , targetAdapterMarketCapId] = targetIds;

    const currentTargetMarket = this.getMarket(targetMarket.id);
    const oldTargetAllocation = this.getAllocation(
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
    if (!targetAdapter.marketIds.includes(targetMarket.id)) {
      targetAdapter.marketIds.push(targetMarket.id);
    }
    if (!targetAdapter.markets.some(({ id }) => id === targetMarket.id)) {
      targetAdapter.markets.push(supply.market);
    }
    this.setMarkets([supply.market], probe ? [targetAdapter] : undefined);

    const simulatedChange =
      supply.market.toSupplyAssets(targetSupplyShares) - oldTargetAllocation;
    // The adapter's rounded expected-assets delta can differ by one wei at inclusion,
    // so cap tracking assumes each accepted leg adds at least its requested assets.
    const targetChange = MathLib.max(simulatedChange, reallocation.assets);
    for (const id of targetIds) {
      const allocation = this.getAllocation(reallocation.vault, id);
      const allocations = this.mutableAllocations[allocationsKey];
      if (allocations == null) {
        throw new UnknownReallocationAllocationError(reallocation.vault, id);
      }
      allocations[id] = {
        ...allocation,
        allocation: allocation.allocation + targetChange,
      };
    }
  }

  /** Credits shared Blue liquidity when an idle allocation enters the target market. @internal */
  private creditIdleReallocationBalance(
    reallocation: VaultV2BlueReallocation,
    targetMarket: ReadonlyMarketSnapshot,
  ): void {
    const blueBalanceKey = findAddressKey(
      this.mutableBlueBalances,
      targetMarket.params.loanToken,
    );
    if (blueBalanceKey == null) {
      return;
    }
    const blueBalance = this.mutableBlueBalances[blueBalanceKey];
    if (blueBalance != null) {
      this.mutableBlueBalances[blueBalanceKey] =
        blueBalance + reallocation.assets;
    }
  }

  /** Builds the isolated markets, adapter views and caps used by a transition probe. @internal */
  private cloneReallocationProbe({
    reallocation,
    targetMarketId,
    adapterIdsCache,
    sourceVaultKey,
    sourceVault,
    sourceAllocationsKey,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly targetMarketId: MarketId;
    readonly adapterIdsCache: Map<string, AdapterIds>;
    readonly sourceVaultKey: Address | undefined;
    readonly sourceVault: AccrualVaultV2 | undefined;
    readonly sourceAllocationsKey: Address | undefined;
  }) {
    const probeMarkets: Record<MarketId, ReadonlyMarketSnapshot | undefined> = {
      [targetMarketId]: this.getMarket(targetMarketId),
    };
    const adapterKeysToClone = new Set<string>([
      reallocation.to.adapter.toLowerCase(),
    ]);
    const allocationIdsToClone = new Set<Hash>(
      getAdapterIds(
        adapterIdsCache,
        this.getMutableAdapter(reallocation.vault, reallocation.to.adapter),
        this.getMarket(targetMarketId),
      ),
    );

    if (reallocation.from.type === "market") {
      const sourceMarket = this.getMarket(reallocation.from.marketParams.id);
      probeMarkets[sourceMarket.id] = sourceMarket;
      adapterKeysToClone.add(reallocation.from.adapter.toLowerCase());
      for (const key of getDependentProbeAdapterKeys(
        sourceVault,
        sourceMarket.id,
      )) {
        adapterKeysToClone.add(key);
      }
      for (const id of getAdapterIds(
        adapterIdsCache,
        this.getMutableAdapter(reallocation.vault, reallocation.from.adapter),
        sourceMarket,
      )) {
        allocationIdsToClone.add(id);
      }
    }

    const data = new VaultV2BlueReallocationData({
      chainId: this.chainId,
      timestamp: this.timestamp,
      markets: probeMarkets,
    });
    if (sourceVaultKey != null) {
      data.mutableVaults[sourceVaultKey] =
        sourceVault == null
          ? undefined
          : cloneVault(sourceVault, {
              markets: data.mutableMarkets,
              adapterKeysToClone,
            });
    }
    if (sourceAllocationsKey != null) {
      const sourceAllocations = this.mutableAllocations[sourceAllocationsKey];
      const allocations: Record<Hash, IVaultV2Allocation | undefined> = {};
      for (const id of allocationIdsToClone) {
        allocations[id] = sourceAllocations?.[id];
      }
      data.mutableAllocations[sourceAllocationsKey] = allocations;
    }
    return data;
  }

  /** Withdraws the source market position and books its cap changes before target supply. @internal */
  private withdrawReallocationSource({
    reallocation,
    source,
    timestamp,
    adapterIdsCache,
    allocationsKey,
    vault,
  }: {
    readonly reallocation: VaultV2BlueReallocation;
    readonly source: Extract<
      VaultV2BlueReallocation["from"],
      { readonly type: "market" }
    >;
    readonly timestamp: bigint;
    readonly adapterIdsCache: Map<string, AdapterIds>;
    readonly allocationsKey: Address;
    readonly vault: AccrualVaultV2;
  }): void {
    const sourceAdapter = this.getMutableAdapter(
      reallocation.vault,
      source.adapter,
    );
    const sourceMarket = this.getMarket(source.marketParams.id);
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
    this.setMarkets([withdrawal.market]);
    const sourceChange =
      withdrawal.market.toSupplyAssets(
        sourceAdapter.supplyShares[sourceMarket.id] ?? 0n,
      ) -
      this.getAllocation(reallocation.vault, sourceAdapterMarketCapId)
        .allocation;
    for (const id of sourceIds) {
      const allocation = this.getAllocation(reallocation.vault, id);
      const nextAllocation = allocation.allocation + sourceChange;
      if (nextAllocation < 0n) {
        throw new ReallocationAllocationUnderflowError({
          vault: reallocation.vault,
          id,
          allocation: allocation.allocation,
          change: sourceChange,
        });
      }
      const allocations = this.mutableAllocations[allocationsKey] as Record<
        Hash,
        IVaultV2Allocation | undefined
      >;
      allocations[id] = {
        ...allocation,
        allocation: nextAllocation,
      };
    }
    vault.assetBalance += reallocation.assets;
  }

  /** Books the vault's first-allocation denominator once per simulated transaction. @internal */
  private accrueReallocationFirstAllocation({
    vault: initialVault,
    vaultKey,
    timestamp,
    context,
    firstTotalAssetsKey,
  }: {
    readonly vault: AccrualVaultV2;
    readonly vaultKey: Address;
    readonly timestamp: bigint;
    readonly context: SimulationContext;
    readonly firstTotalAssetsKey: Address;
  }) {
    let vault = initialVault;

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
    this.mutableVaults[vaultKey] = vault;
    const firstTotalAssets = vault._totalAssets;
    const nextContext = {
      ...context,
      firstTotalAssets: {
        ...context.firstTotalAssets,
        [firstTotalAssetsKey]: firstTotalAssets,
      },
    };
    return { vault, firstTotalAssets, context: nextContext };
  }

  /** Updates canonical markets in bulk and refreshes only dependent adapter views. */
  private setMarkets(
    markets: Iterable<Market>,
    adaptersToRefresh?: Iterable<IAccrualVaultV2Adapter>,
  ) {
    const changedMarketIds = new Set<MarketId>();
    for (const market of markets) {
      this.mutableMarkets[market.id] = market;
      changedMarketIds.add(market.id);
    }
    if (changedMarketIds.size === 0) {
      return;
    }

    const adapters = collectAdaptersToRefresh(
      this.mutableVaults,
      adaptersToRefresh,
    );
    for (const adapter of adapters) {
      const update = refreshAdapterMarkets(adapter, {
        markets: this.mutableMarkets,
        changedMarketIds,
      });
      if (update != null) {
        Object.assign(adapter, update);
      }
    }
  }
}

/** Collects the adapters whose views may depend on changed canonical markets. @internal */
function collectAdaptersToRefresh(
  vaults: Readonly<Record<Address, AccrualVaultV2 | undefined>>,
  adaptersToRefresh: Iterable<IAccrualVaultV2Adapter> | undefined,
) {
  const adapters = new Set<IAccrualVaultV2Adapter>();
  if (adaptersToRefresh == null) {
    // A Morpho market is global state shared by every vault position. Legacy
    // AccrualPosition constructors copy their Market, so rebuild those adapter
    // views as well as repointing V2 adapters whenever the canonical state moves.
    for (const vault of Object.values(vaults)) {
      if (vault == null) {
        continue;
      }
      for (const adapter of vault.accrualAdapters) {
        adapters.add(adapter);
      }
      if (vault.accrualLiquidityAdapter != null) {
        adapters.add(vault.accrualLiquidityAdapter);
      }
    }
  } else {
    for (const adapter of adaptersToRefresh) {
      adapters.add(adapter);
    }
  }

  return adapters;
}

/** Computes one adapter's dependent market views after a canonical state change. @internal */
function refreshAdapterMarkets(
  adapter: IAccrualVaultV2Adapter,
  {
    markets,
    changedMarketIds,
  }: {
    readonly markets: Readonly<Record<MarketId, Market | undefined>>;
    readonly changedMarketIds: ReadonlySet<MarketId>;
  },
) {
  if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
    if (!adapter.markets.some(({ id }) => changedMarketIds.has(id))) {
      return;
    }
    return {
      markets: adapter.markets.map((adapterMarket) =>
        getCanonicalMarket(markets, adapterMarket),
      ),
    };
  }
  if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
    if (
      !adapter.positions.some(({ marketId }) => changedMarketIds.has(marketId))
    ) {
      return;
    }
    return {
      positions: adapter.positions.map((position) =>
        clonePosition(position, markets),
      ),
    };
  }
  if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
    if (
      ![...adapter.accrualVaultV1.allocations.keys()].some((marketId) =>
        changedMarketIds.has(marketId),
      )
    ) {
      return;
    }
    return {
      accrualVaultV1: cloneAccrualVault(adapter.accrualVaultV1, markets),
    };
  }
}

/** Clones allocator authorization records without sharing caller-owned iterables. @internal */
function cloneAllocatorConfigurations(input: InputVaultV2BlueReallocationData) {
  const publicAllocatorConfigs: Record<
    Address,
    VaultV2BluePublicAllocatorConfig | undefined
  > = {};
  const activeAdapters: Record<Address, ReadonlySet<Address> | undefined> = {};
  const marketPublicAllocatorConfigs: Record<
    Address,
    Record<Hash, VaultV2BlueMarketPublicAllocatorConfig | undefined> | undefined
  > = {};

  for (const [vault, config] of Object.entries(
    input.publicAllocatorConfigs ?? {},
  ) as [Address, IVaultV2BluePublicAllocatorConfig | undefined][]) {
    publicAllocatorConfigs[vault] =
      config == null ? undefined : new VaultV2BluePublicAllocatorConfig(config);
  }

  for (const [vault, adapters] of Object.entries(
    input.activeAdapters ?? {},
  ) as [Address, Iterable<Address> | undefined][]) {
    activeAdapters[vault] = adapters == null ? undefined : new Set(adapters);
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
    marketPublicAllocatorConfigs[vault] =
      cloneMarketAllocatorConfigurations(configs);
  }
  return {
    publicAllocatorConfigs,
    activeAdapters,
    marketPublicAllocatorConfigs,
  };
}

/** Clones one vault's adapter-market allocator configurations. @internal */
function cloneMarketAllocatorConfigurations(
  configs: NonNullable<
    InputVaultV2BlueReallocationData["marketPublicAllocatorConfigs"]
  >[Address],
) {
  const cloned: Record<
    Hash,
    VaultV2BlueMarketPublicAllocatorConfig | undefined
  > = {};
  for (const [id, config] of Object.entries(configs ?? {}) as [
    Hash,
    IVaultV2BlueMarketPublicAllocatorConfig | undefined,
  ][]) {
    cloned[id] =
      config == null
        ? undefined
        : new VaultV2BlueMarketPublicAllocatorConfig(config);
  }
  return cloned;
}

/** Finds adapter views that a source-market transition must isolate for probing. @internal */
function getDependentProbeAdapterKeys(
  sourceVault: AccrualVaultV2 | undefined,
  sourceMarketId: MarketId,
) {
  const keys = new Set<string>();
  if (sourceVault == null) {
    return keys;
  }
  const adapters = new Set(sourceVault.accrualAdapters);
  if (sourceVault.accrualLiquidityAdapter != null) {
    adapters.add(sourceVault.accrualLiquidityAdapter);
  }
  for (const adapter of adapters) {
    if (adapterReferencesMarket(adapter, sourceMarketId)) {
      keys.add(adapter.address.toLowerCase());
    }
  }
  return keys;
}

/** Tests whether an adapter view depends on one canonical Blue market. @internal */
function adapterReferencesMarket(
  adapter: IAccrualVaultV2Adapter,
  marketId: MarketId,
): boolean {
  return (
    (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2 &&
      adapter.markets.some(({ id }) => id === marketId)) ||
    (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter &&
      adapter.positions.some((position) => position.marketId === marketId)) ||
    (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter &&
      adapter.accrualVaultV1.allocations.has(marketId))
  );
}

/** Computes the accepted leg's liquidity bounds and shared cap reserve entries. @internal */
function getAcceptedCandidateUpdates({
  candidate: largest,
  idleTakenAssets,
  initialIdleAssets,
  allocatorCapHeadroom,
  reserves,
}: {
  readonly candidate: ReallocationCandidate;
  readonly idleTakenAssets: ReadonlyMap<string, bigint>;
  readonly initialIdleAssets: ReadonlyMap<string, bigint>;
  readonly allocatorCapHeadroom: bigint;
  readonly reserves: CapReserveState;
}) {
  const allocatorCapBoundTargets: string[] = [];
  const idleBoundVaults: string[] = [];
  const idleTakenEntries: (readonly [string, bigint])[] = [];
  const {
    reallocation: acceptedReallocation,
    targetPair: acceptedTargetPair,
    sourcePair: acceptedSourcePair,
    allocatorHeadroom: acceptedAllocatorHeadroom,
  } = largest;
  if (acceptedReallocation.assets >= acceptedAllocatorHeadroom) {
    // BluePublicAllocator caps are per vault and target adapter.
    allocatorCapBoundTargets.push(
      `${acceptedReallocation.vault.toLowerCase()}:${acceptedReallocation.to.adapter.toLowerCase()}`,
    );
  }
  if (acceptedReallocation.from.type === "idle") {
    const vaultKey = acceptedReallocation.vault.toLowerCase();
    const taken =
      (idleTakenAssets.get(vaultKey) ?? 0n) + acceptedReallocation.assets;
    idleTakenEntries.push([vaultKey, taken]);
    // Candidates always record this; a missing entry counts the vault as bound.
    const initial = initialIdleAssets.get(vaultKey) ?? 0n;
    if (
      taken >=
      MathLib.zeroFloorSub(
        initial,
        MathLib.wMulUp(initial, allocatorCapHeadroom),
      )
    ) {
      idleBoundVaults.push(vaultKey);
    }
  }
  const touchedVaultKey = acceptedReallocation.vault.toLowerCase();
  const existingPairs = reserves.touchedPairs.get(touchedVaultKey);
  const touchedVaultPairs = existingPairs ?? new Map<string, CapReservePair>();
  const touchedVaultEntries =
    existingPairs == null
      ? [[touchedVaultKey, touchedVaultPairs] as const]
      : [];
  const touchedPairEntries: (readonly [string, CapReservePair])[] = [];
  if (!touchedVaultPairs.has(acceptedTargetPair.key)) {
    touchedPairEntries.push([acceptedTargetPair.key, acceptedTargetPair]);
  }
  if (
    acceptedSourcePair != null &&
    !touchedVaultPairs.has(acceptedSourcePair.key) &&
    acceptedSourcePair.key !== acceptedTargetPair.key
  ) {
    touchedPairEntries.push([acceptedSourcePair.key, acceptedSourcePair]);
  }
  return {
    allocatorCapBoundTargets,
    idleTakenAssets: idleTakenEntries,
    idleBoundVaults,
    touchedVaultPairs,
    touchedVaultEntries,
    touchedPairEntries,
  };
}

/**
 * Creates cap-reserve readers over the shared in-place planning caches.
 * Returned readers populate reserve caches as in the utilization pass.
 * @internal
 */
function createCapReserveResolvers({
  reserves,
  adapterIdsCache,
  timestamp,
  capAccrualBuffer,
}: {
  readonly reserves: CapReserveState;
  readonly adapterIdsCache: Map<string, AdapterIds>;
  readonly timestamp: bigint;
  readonly capAccrualBuffer: bigint;
}) {
  // Onchain, market interest is booked once at transaction start, on pre-plan
  // positions at pre-plan rates, and stays on touched positions' cap ids.
  // This reserve state is shared across every planner pass and leg of the plan.
  // biome-ignore lint/complexity/useMaxParams: a pair is identified by its vault, adapter, and market.
  const getPair = (
    vault: Address,
    adapter: ReadonlyMarketAdapterSnapshot,
    market: ReadonlyMarketSnapshot,
  ): CapReservePair => {
    const key = `${vault}:${adapter.address}:${market.id}`.toLowerCase();
    const touched = reserves.touchedPairs.get(vault.toLowerCase())?.get(key);
    if (touched != null) {
      return touched;
    }
    const shares = adapter.supplyShares[market.id] ?? 0n;
    return {
      key,
      ids: getAdapterIds(adapterIdsCache, adapter, market),
      reserve: (reserveState) => {
        let reserve = reserveState.reserveByPairKey.get(key);
        if (reserve == null) {
          let accruals = reserveState.marketAccruals.get(market.id);
          if (accruals == null) {
            const initialMarket = reserveState.initialMarkets[market.id];
            if (initialMarket == null) {
              throw new UnknownReallocationMarketError(market.id);
            }
            accruals = [
              initialMarket.accrueInterest(timestamp),
              initialMarket.accrueInterest(timestamp + capAccrualBuffer),
            ];
            reserveState.marketAccruals.set(market.id, accruals);
          }
          const [atTimestamp, projected] = accruals;
          reserve = MathLib.zeroFloorSub(
            projected.toSupplyAssets(shares),
            atTimestamp.toSupplyAssets(shares),
          );
          reserveState.reserveByPairKey.set(key, reserve);
        }
        return reserve;
      },
    };
  };
  // biome-ignore lint/complexity/useMaxParams: the reserve is scoped to one vault, cap id, and candidate set.
  const capReserve = (
    vault: Address,
    id: Hash,
    candidatePairs: readonly CapReservePair[],
  ) => {
    let reserve = 0n;
    const seen = new Set<string>();
    for (const pair of [
      ...(reserves.touchedPairs.get(vault.toLowerCase())?.values() ?? []),
      ...candidatePairs,
    ]) {
      if (seen.has(pair.key) || !pair.ids.includes(id)) {
        continue;
      }
      seen.add(pair.key);
      reserve += pair.reserve(reserves);
    }
    return reserve;
  };

  return { getPair, capReserve };
}

/** Explicit state and operations used while planning one vault's candidate. @internal */
interface VaultCandidateParameters {
  readonly vaultAddress: Address;
  readonly data: VaultV2BlueReallocationData;
  readonly marketId: MarketId;
  readonly penalty: bigint | undefined;
  readonly options: VaultV2BluePublicAllocatorOptions;
  readonly simulationContext: SimulationContext;
  readonly normalizedMarketId: string;
  readonly adapterIdsCache: Map<string, AdapterIds>;
  readonly getPair: (
    vault: Address,
    adapter: ReadonlyMarketAdapterSnapshot,
    market: ReadonlyMarketSnapshot,
  ) => CapReservePair;
  readonly capReserve: (
    vault: Address,
    id: Hash,
    candidatePairs: readonly CapReservePair[],
  ) => bigint;
  readonly reserves: CapReserveState;
  readonly allocatorCapHeadroom: bigint;
  readonly timestamp: bigint;
  readonly maxWithdrawalUtilization: bigint;
  readonly remainingAssets: bigint | undefined;
  readonly getOptionalPublicAllocatorConfig: VaultV2BlueReallocationData["getOptionalPublicAllocatorConfig"];
  readonly setMarkets: VaultV2BlueReallocationData["setMarkets"];
  readonly applyPublicReallocation: VaultV2BlueReallocationData["applyPublicReallocation"];
}

/** Target-adapter inputs after resolving a vault's authorization and idle state. @internal */
type TargetAdapterCandidateParameters = VaultCandidateParameters & {
  readonly vault: ReadonlyVaultSnapshot;
  readonly targetMarket: ReadonlyMarketSnapshot;
  readonly publicAllocatorConfig: VaultV2BluePublicAllocatorConfig;
  readonly availableIdleAssets: bigint;
  readonly activeAdapters: ReadonlySet<string>;
  readonly targetSupplyHeadroom: bigint;
  readonly minimumSupply: ReturnType<Market["supply"]>;
  readonly adapter: ReadonlyAdapterSnapshot;
};

/** Valid target-cap inputs shared by idle and market-source candidate steps. @internal */
type SourceCandidateParameters = Omit<
  TargetAdapterCandidateParameters,
  "adapter"
> & {
  readonly adapter: AccrualVaultV2MorphoMarketV1AdapterV2;
  readonly targetPair: CapReservePair;
  readonly allocatorHeadroom: bigint;
  readonly blockedTargetIds: readonly Hash[];
};

/** A raw candidate and the current target state used for cap fitting. @internal */
type CandidateCapParameters = VaultCandidateParameters &
  ReallocationCandidate & {
    readonly targetMarket: ReadonlyMarketSnapshot;
  };

/**
 * Plans one vault candidate, caching its initial idle assets and active adapters in place.
 * @internal
 */
function planCachedVaultCandidate(
  params: VaultCandidateParameters & {
    readonly initialIdleAssets: Map<string, bigint>;
    readonly activeAdaptersCache: Map<Address, ReadonlySet<string>>;
  },
) {
  const { vaultAddress, data, initialIdleAssets, activeAdaptersCache } = params;
  const idleState = resolveVaultCandidateIdleState(params);
  if (idleState == null) {
    return;
  }
  const { availableIdleAssets } = idleState;
  const vaultAddressKey = vaultAddress.toLowerCase();
  if (!initialIdleAssets.has(vaultAddressKey)) {
    initialIdleAssets.set(vaultAddressKey, availableIdleAssets);
  }
  let activeAdapters = activeAdaptersCache.get(vaultAddress);
  if (activeAdapters == null) {
    activeAdapters = new Set(
      [...data.getActiveAdapters(vaultAddress)].map((adapter) =>
        adapter.toLowerCase(),
      ),
    );
    activeAdaptersCache.set(vaultAddress, activeAdapters);
  }
  return planVaultCandidate({
    ...params,
    ...idleState,
    activeAdapters,
  });
}

/** Resolves an eligible vault's idle balance before initializing candidate caches. @internal */
function resolveVaultCandidateIdleState(params: VaultCandidateParameters) {
  const {
    vaultAddress,
    data,
    marketId,
    penalty,
    options,
    simulationContext,
    getOptionalPublicAllocatorConfig,
  } = params;

  const targetMarket = data.getMarket(marketId);
  const publicAllocatorConfig = getOptionalPublicAllocatorConfig(vaultAddress);
  if (publicAllocatorConfig == null) {
    return;
  }
  const vault = data.getVault(vaultAddress);
  if (
    !isAddressEqual(publicAllocatorConfig.vault, vaultAddress) ||
    publicAllocatorConfig.penalty >
      (options.maxPenalty ?? DEFAULT_MAX_REALLOCATION_PENALTY)
  ) {
    return;
  }
  if (penalty != null && publicAllocatorConfig.penalty !== penalty) {
    return;
  }
  const donatedPenaltyAssetsKey = findAddressKey(
    simulationContext.donatedPenaltyAssets,
    vaultAddress,
  );
  const donatedPenaltyAssets =
    donatedPenaltyAssetsKey == null
      ? 0n
      : simulationContext.donatedPenaltyAssets[donatedPenaltyAssetsKey];
  if (donatedPenaltyAssets == null) {
    throw new UnknownDataError(
      `Missing donated penalty assets for "${vaultAddress}".`,
    );
  }
  // Exclude rounded penalty dust from idle candidates so one donation
  // cannot replenish liquidity for another same-plan reallocation.
  const availableIdleAssets = MathLib.zeroFloorSub(
    vault.assetBalance,
    donatedPenaltyAssets,
  );
  return { vault, targetMarket, publicAllocatorConfig, availableIdleAssets };
}

/**
 * Plans the highest-asset cap-compatible candidate for one configured vault.
 * Candidate planning updates shared working data/reserves in place; do not reuse a prior state.
 * @internal
 */
function planVaultCandidate(
  params: Omit<
    TargetAdapterCandidateParameters,
    "adapter" | "targetSupplyHeadroom" | "minimumSupply"
  >,
): ReallocationCandidate | undefined {
  const {
    vault,
    targetMarket,
    publicAllocatorConfig,
    availableIdleAssets,
    activeAdapters,
  } = params;
  const targetSupplyHeadroom = MathLib.zeroFloorSub(
    MathLib.MAX_UINT_128,
    targetMarket.totalSupplyAssets,
  );
  if (
    targetSupplyHeadroom === 0n ||
    targetMarket.toSupplyShares(1n, "Down") >
      MathLib.zeroFloorSub(MathLib.MAX_UINT_128, targetMarket.totalSupplyShares)
  ) {
    return;
  }
  const minimumSupply = targetMarket.supply(1n, 0n);
  const rawCandidates: ReallocationCandidate[] = [];

  // Missing nested allocator state means the snapshot is incomplete, so
  // typed getter errors below must propagate. Only explicit zero caps or
  // disabled permissions make an adapter ineligible.

  for (const adapter of vault.accrualAdapters) {
    rawCandidates.push(
      ...planTargetAdapterCandidates({
        ...params,
        vault,
        targetMarket,
        publicAllocatorConfig,
        availableIdleAssets,
        activeAdapters,
        targetSupplyHeadroom,
        minimumSupply,
        adapter,
      }),
    );
  }

  const capCompatibleCandidates: ReallocationCandidate[] = [];

  for (const candidate of rawCandidates) {
    const compatible = fitCandidateCaps({
      ...params,
      ...candidate,
      targetMarket,
    });
    if (compatible != null) {
      capCompatibleCandidates.push(compatible);
    }
  }

  return capCompatibleCandidates.sort(
    bigIntComparator(({ reallocation }) => reallocation.assets, "desc"),
  )[0];
}

/**
 * Builds idle and market-source candidates for one eligible target adapter.
 * Updates shared working data/reserves through candidate steps; do not reuse a prior state.
 * @internal
 */
function planTargetAdapterCandidates(
  params: TargetAdapterCandidateParameters,
): ReallocationCandidate[] {
  const {
    vaultAddress,
    data,
    marketId,
    adapterIdsCache,
    getPair,
    capReserve,
    reserves,
    allocatorCapHeadroom,
    vault,
    targetMarket,
    activeAdapters,
    minimumSupply,
    adapter,
  } = params;
  const rawCandidates: ReallocationCandidate[] = [];

  if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
    return [];
  }
  if (!isAddressEqual(adapter.parentVault, vaultAddress)) {
    return [];
  }
  if (
    !isAddressEqual(targetMarket.params.loanToken, vault.asset) ||
    !isAddressEqual(targetMarket.params.irm, adapter.adaptiveCurveIrm)
  ) {
    return [];
  }

  const targetPair = getPair(vaultAddress, adapter, targetMarket);
  const [adapterCapId, collateralCapId, adapterMarketCapId] = getAdapterIds(
    adapterIdsCache,
    adapter,
    targetMarket,
  );
  const marketPublicAllocatorConfig = data.getMarketPublicAllocatorConfig(
    vaultAddress,
    adapterMarketCapId,
  );
  if (
    !isAddressEqual(marketPublicAllocatorConfig.vault, vaultAddress) ||
    !isAddressEqual(marketPublicAllocatorConfig.adapter, adapter.address) ||
    !activeAdapters.has(adapter.address.toLowerCase())
  ) {
    return [];
  }

  const adapterCapAllocation = data.getAllocation(vaultAddress, adapterCapId);
  const collateralCapAllocation = data.getAllocation(
    vaultAddress,
    collateralCapId,
  );
  const adapterMarketCapAllocation = data.getAllocation(
    vaultAddress,
    adapterMarketCapId,
  );
  const targetAllocations = [
    adapterCapAllocation,
    collateralCapAllocation,
    adapterMarketCapAllocation,
  ];
  if (targetAllocations.some(({ absoluteCap }) => absoluteCap === 0n)) {
    return [];
  }

  const adapterShares = adapter.supplyShares[marketId] ?? 0n;
  const expectedSupplyAssets = targetMarket.toSupplyAssets(adapterShares);
  const untracked = MathLib.zeroFloorSub(
    expectedSupplyAssets,
    adapterMarketCapAllocation.allocation,
  );

  const allocatorHeadroom = MathLib.zeroFloorSub(
    marketPublicAllocatorConfig.getMaxIn(
      adapterMarketCapAllocation.allocation +
        untracked +
        targetPair.reserve(reserves),
    ),
    MathLib.wMulUp(
      marketPublicAllocatorConfig.absoluteCap,
      allocatorCapHeadroom,
    ),
  );
  const minimumAllocation = minimumSupply.market.toSupplyAssets(
    adapterShares + minimumSupply.shares,
  );
  const minimumAllocationChange = MathLib.max(
    minimumAllocation - adapterMarketCapAllocation.allocation,
    minimumSupply.assets,
  );
  const blockedTargetIds = targetAllocations
    .filter(({ allocation, absoluteCap, relativeCap, id }) => {
      const nextAllocation =
        allocation +
        capReserve(vaultAddress, id, [targetPair]) +
        minimumAllocationChange;
      return (
        nextAllocation > absoluteCap ||
        (relativeCap === 0n && nextAllocation > 0n)
      );
    })
    .map(({ id }) => id);
  // MorphoMarketV1AdapterV2 rejects supplies that mint fewer shares than assets.
  if (
    allocatorHeadroom === 0n ||
    minimumSupply.shares < minimumSupply.assets ||
    blockedTargetIds.includes(adapterMarketCapId)
  ) {
    return [];
  }

  const sourceParams = {
    ...params,
    adapter,
    targetPair,
    allocatorHeadroom,
    blockedTargetIds,
  };
  const idleCandidate = planIdleCandidate(sourceParams);
  if (idleCandidate != null) {
    rawCandidates.push(idleCandidate);
  }
  rawCandidates.push(...planSourceAdapterCandidates(sourceParams));

  return rawCandidates;
}

/** Builds a vault-idle leg when permissions and target caps allow it. @internal */
function planIdleCandidate(
  params: SourceCandidateParameters,
): ReallocationCandidate | undefined {
  const {
    vaultAddress,
    adapter,
    publicAllocatorConfig,
    availableIdleAssets,
    blockedTargetIds,
    targetSupplyHeadroom,
    allocatorHeadroom,
    targetPair,
  } = params;
  if (
    publicAllocatorConfig.canPullFromIdle &&
    availableIdleAssets > 0n &&
    blockedTargetIds.length === 0
  ) {
    const assets = MathLib.min(
      MathLib.MAX_UINT_128,
      targetSupplyHeadroom,
      allocatorHeadroom,
      availableIdleAssets,
    );
    if (assets > 0n) {
      return {
        reallocation: {
          vault: vaultAddress,
          from: { type: "idle" },
          to: { adapter: adapter.address },
          assets,
          penalty: publicAllocatorConfig.penalty,
        },
        targetPair,
        allocatorHeadroom,
      };
    }
  }
}

/**
 * Walks authorized source adapters in snapshot order for one target position.
 * Source steps update the shared working data in place; do not reuse a prior state.
 * @internal
 */
function planSourceAdapterCandidates(
  params: SourceCandidateParameters,
): ReallocationCandidate[] {
  const { vault, vaultAddress, activeAdapters } = params;
  const candidates: ReallocationCandidate[] = [];
  for (const sourceAdapter of vault.accrualAdapters) {
    if (!(sourceAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      continue;
    }
    if (!isAddressEqual(sourceAdapter.parentVault, vaultAddress)) {
      continue;
    }
    if (!activeAdapters.has(sourceAdapter.address.toLowerCase())) {
      continue;
    }

    for (const sourceMarketReference of sourceAdapter.markets) {
      const candidate = planSourceMarketCandidate({
        ...params,
        sourceAdapter,
        sourceMarketReference,
      });
      if (candidate != null) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

/**
 * Plans a source-market withdrawal, accruing the same working market state.
 * Updates the working data clone in place via setMarkets; the caller retains that same
 * object, even when no candidate is returned. Do not reuse a prior state after this step.
 * @internal
 */
function planSourceMarketCandidate(
  params: SourceCandidateParameters & {
    readonly sourceAdapter: AccrualVaultV2MorphoMarketV1AdapterV2;
    readonly sourceMarketReference: ReadonlyMarketSnapshot;
  },
): ReallocationCandidate | undefined {
  const {
    data,
    vault,
    vaultAddress,
    sourceAdapter,
    sourceMarketReference,
    normalizedMarketId,
    adapterIdsCache,
    blockedTargetIds,
    getPair,
    timestamp,
    setMarkets,
    targetSupplyHeadroom,
    allocatorHeadroom,
    maxWithdrawalUtilization,
    adapter,
    publicAllocatorConfig,
    targetPair,
  } = params;

  const sourceMarket = data.getMarket(sourceMarketReference.id);
  if (
    !isAddressEqual(sourceMarket.params.loanToken, vault.asset) ||
    !isAddressEqual(sourceMarket.params.irm, sourceAdapter.adaptiveCurveIrm)
  ) {
    return;
  }
  if (sourceMarket.id.toLowerCase() === normalizedMarketId) {
    return;
  }

  const sourceIds = getAdapterIds(adapterIdsCache, sourceAdapter, sourceMarket);
  const [, , sourceAdapterMarketCapId] = sourceIds;
  const sourceConfig = data.getMarketPublicAllocatorConfig(
    vaultAddress,
    sourceAdapterMarketCapId,
  );
  if (
    !isAddressEqual(sourceConfig.vault, vaultAddress) ||
    !isAddressEqual(sourceConfig.adapter, sourceAdapter.address) ||
    !sourceConfig.canPullFromMarket
  ) {
    return;
  }

  const sourceAllocations = sourceIds.map((id) =>
    data.getAllocation(vaultAddress, id),
  );
  if (sourceAllocations.some(({ allocation }) => allocation === 0n)) {
    return;
  }

  const sourceSupplyShares = sourceAdapter.supplyShares[sourceMarket.id] ?? 0n;
  if (sourceSupplyShares === 0n) {
    return;
  }

  // A withdrawal can create target headroom only for shared cap IDs.
  if (blockedTargetIds.some((id) => !sourceIds.includes(id))) {
    return;
  }

  const sourcePair = getPair(vaultAddress, sourceAdapter, sourceMarket);
  const accruedSourceMarket = sourceMarket.accrueInterest(timestamp);
  setMarkets([accruedSourceMarket]);
  const expectedSourceSupplyAssets =
    accruedSourceMarket.toSupplyAssets(sourceSupplyShares);
  const assets = MathLib.min(
    MathLib.MAX_UINT_128,
    targetSupplyHeadroom,
    allocatorHeadroom,
    expectedSourceSupplyAssets,
    accruedSourceMarket.getWithdrawToUtilization(maxWithdrawalUtilization),
  );
  if (assets <= 0n) {
    return;
  }

  return {
    reallocation: {
      vault: vaultAddress,
      from: {
        type: "market",
        adapter: sourceAdapter.address,
        marketParams: sourceMarket.params,
      },
      to: { adapter: adapter.address },
      assets,
      penalty: publicAllocatorConfig.penalty,
    },
    targetPair,
    sourcePair,
    allocatorHeadroom,
  };
}

/**
 * Fits a raw candidate to non-shared upper bounds and shared-cap rounding.
 * Cap reserve reads populate shared working reserve caches; do not reuse a prior state.
 * @internal
 */
function fitCandidateCaps(
  params: CandidateCapParameters,
): ReallocationCandidate | undefined {
  const {
    reallocation,
    targetPair,
    sourcePair,
    allocatorHeadroom,
    capReserve,
    remainingAssets,
  } = params;

  const targetIds = targetPair.ids;
  const sourceIds = new Set<Hash>(sourcePair?.ids ?? []);
  const reserveById = new Map<Hash, bigint>();
  for (const id of targetIds) {
    reserveById.set(
      id,
      capReserve(
        reallocation.vault,
        id,
        sourcePair == null ? [targetPair] : [targetPair, sourcePair],
      ),
    );
  }

  const probeParams = { ...params, targetIds, sourceIds, reserveById };

  // Non-shared target IDs impose monotonic upper bounds. Shared IDs
  // can impose lower bounds and non-monotonic rounding constraints,
  // so validate them after selecting the non-shared maximum.
  const lower = findCandidateUpperBound(probeParams);

  let selectedAssets = MathLib.min(
    lower,
    remainingAssets ?? reallocation.assets,
  );
  let probe =
    selectedAssets > 0n
      ? probeCandidateReallocation({ ...probeParams, assets: selectedAssets })
      : undefined;

  if (remainingAssets != null && probe?.withinAllCaps !== true) {
    // Bound the base-unit scan; expose a caller ceiling if wider searches become necessary.
    const searchUpper = MathLib.min(
      lower,
      selectedAssets + MAX_SHARED_CAP_SEARCH_STEPS,
    );
    while (
      selectedAssets > 0n &&
      selectedAssets < searchUpper &&
      probe?.withinAllCaps !== true
    ) {
      selectedAssets += 1n;
      probe = probeCandidateReallocation({
        ...probeParams,
        assets: selectedAssets,
      });
    }
  }

  if (selectedAssets > 0n && probe?.withinAllCaps === true) {
    return {
      reallocation: { ...reallocation, assets: selectedAssets },
      targetPair,
      sourcePair,
      allocatorHeadroom,
    };
  }
}

/** Simulates one candidate amount and tests its reserved target-cap headroom. @internal */
function probeCandidateReallocation(
  params: CandidateCapParameters & {
    readonly assets: bigint;
    readonly targetIds: AdapterIds;
    readonly sourceIds: ReadonlySet<Hash>;
    readonly reserveById: ReadonlyMap<Hash, bigint>;
  },
) {
  const {
    assets,
    targetMarket,
    applyPublicReallocation,
    simulationContext,
    reallocation,
    marketId,
    adapterIdsCache,
    targetIds,
    sourceIds,
    reserveById,
  } = params;

  if (
    targetMarket.totalSupplyShares +
      targetMarket.toSupplyShares(assets, "Down") >
    MathLib.MAX_UINT_128
  ) {
    return;
  }

  const postTransition = _try(
    () =>
      applyPublicReallocation({
        context: simulationContext,
        reallocation: { ...reallocation, assets },
        targetMarketId: marketId,
        timestamp: targetMarket.lastUpdate,
        adapterIdsCache,
        probe: true,
      }),
    ReallocationAllocationUnderflowError,
    ReallocationAdapterSupplySharesUnderflowError,
  );
  if (postTransition == null) {
    return;
  }

  // Vault V2 checks relative caps against the transient firstTotalAssets,
  // which stays fixed after the vault's first allocation in a transaction.
  const { firstTotalAssets } = postTransition;
  let withinUpperBounds = true;
  let withinAllCaps = true;
  for (const id of targetIds) {
    const allocation = postTransition.data.getAllocation(
      reallocation.vault,
      id,
    );
    const capacity = VaultV2Utils.allocationHeadroom(
      { ...allocation, allocation: 0n },
      firstTotalAssets,
    ).value;
    // The reserve covers interest accrued before inclusion by every
    // position the plan touched on this cap id, as booked onchain.
    const withinCap =
      allocation.absoluteCap > 0n &&
      allocation.allocation + (reserveById.get(id) ?? 0n) <= capacity;
    if (!withinCap) {
      withinAllCaps = false;
      if (!sourceIds.has(id)) {
        withinUpperBounds = false;
      }
    }
  }
  return { withinAllCaps, withinUpperBounds };
}

/** Bisects the monotonic non-shared target-cap upper bound. @internal */
function findCandidateUpperBound(
  probeParams: CandidateCapParameters & {
    readonly targetIds: AdapterIds;
    readonly sourceIds: ReadonlySet<Hash>;
    readonly reserveById: ReadonlyMap<Hash, bigint>;
  },
): bigint {
  let lower = 0n;
  let upper = probeParams.reallocation.assets;
  let probeUpper = true;
  while (lower < upper) {
    const assets = probeUpper ? upper : (lower + upper + 1n) / 2n;
    probeUpper = false;
    if (
      probeCandidateReallocation({ ...probeParams, assets })
        ?.withinUpperBounds === true
    ) {
      lower = assets;
    } else {
      upper = assets - 1n;
    }
  }
  return lower;
}

/** Operation-specific inputs captured by the former nested planning callback. @internal */
interface OperationPlanParameters {
  readonly maxAssets: bigint;
  readonly headroom: bigint;
  readonly usePhysicalBalance: boolean;
  readonly absoluteShortfall: bigint;
  readonly penaltyTiers: readonly bigint[];
  readonly type: "borrow" | "withdraw" | "refinance";
  readonly maxWithdrawalUtilization: bigint;
  readonly amount: bigint;
  readonly feeAssets: bigint;
  readonly blueBalance: bigint;
  readonly capAccrualBuffer: bigint;
  readonly normalizedOptions: VaultV2BluePublicAllocatorOptions;
  readonly hasExplicitBlueBalance: boolean;
  readonly marketId: MarketId;
  readonly initialData: VaultV2BlueReallocationData;
  readonly initialMarkets: CapReserveState["initialMarkets"];
  /**
   * Updates working data/reserves in place and returns shared objects, not an isolated
   * snapshot. Callers must not reuse a prior state after the pass.
   */
  readonly runUtilizationPass: (
    data: VaultV2BlueReallocationData,
    args: Parameters<
      VaultV2BlueReallocationData["computeVaultV2BlueReallocationsAtUtilizationInPlace"]
    >[0],
  ) => ReturnType<
    VaultV2BlueReallocationData["computeVaultV2BlueReallocationsAtUtilizationInPlace"]
  >;
}

/** Values reassigned between planner passes, returned explicitly by each step. @internal */
interface OperationPlanState {
  readonly reserves: CapReserveState;
  readonly reallocations: VaultV2BlueReallocation[];
  readonly data: VaultV2BlueReallocationData;
  readonly context: SimulationContext;
  readonly remainingShortfall: bigint;
  readonly accountingShortfall: bigint;
  readonly allocatorCapBoundTargets: ReadonlySet<string>;
  readonly idleBoundVaults: ReadonlySet<string>;
}

/** Tracks shared-Blue transfer funding in the reallocation's execution order. @internal */
function getReallocationTransferShortfall(
  reallocations: readonly VaultV2BlueReallocation[],
  blueBalance: bigint,
): bigint {
  const penaltyAssets = getBlueBundlesV1PenaltyAssets(reallocations);
  if (penaltyAssets === 0n) {
    return 0n;
  }
  let shortfall = MathLib.zeroFloorSub(penaltyAssets, blueBalance);
  let balance = MathLib.zeroFloorSub(blueBalance, penaltyAssets);
  for (const { from, assets } of reallocations) {
    if (from.type === "idle") {
      balance += assets;
    } else {
      shortfall = MathLib.max(shortfall, MathLib.zeroFloorSub(assets, balance));
    }
  }
  return shortfall;
}

/** Plans one operation budget across penalty tiers and utilization passes. @internal */
function planVaultOperation(params: OperationPlanParameters) {
  const { initialMarkets, initialData, absoluteShortfall, penaltyTiers, type } =
    params;
  const reserves = createCapReserveState(initialMarkets);
  const reallocations: VaultV2BlueReallocation[] = [];
  const data = initialData.clone();
  const context = createSimulationContext();
  const remainingShortfall = absoluteShortfall;
  const accountingShortfall = absoluteShortfall;
  const allocatorCapBoundTargets: ReadonlySet<string> = new Set();
  const idleBoundVaults: ReadonlySet<string> = new Set();

  let state: OperationPlanState = {
    reserves,
    reallocations,
    data,
    context,
    remainingShortfall,
    accountingShortfall,
    allocatorCapBoundTargets,
    idleBoundVaults,
  };
  for (const penalty of penaltyTiers) {
    if (type === "refinance" && penalty === MathLib.WAD) {
      continue;
    }
    state = planOperationPenaltyTier({ ...params, penalty, state });
  }
  return summarizeOperationPlan({ ...params, state });
}

/**
 * Runs friendly then full-utilization passes at one allocator penalty.
 * Passes update working data/reserves in place, which the returned state may share.
 * Do not reuse a prior state after this step.
 * @internal
 */
function planOperationPenaltyTier(
  params: OperationPlanParameters & {
    readonly state: OperationPlanState;
    readonly penalty: bigint;
  },
): OperationPlanState {
  const { penalty, maxWithdrawalUtilization } = params;
  let state = params.state;

  let isFriendlyPass = true;
  let triedFullCapacityAttempt = false;
  for (const utilization of [maxWithdrawalUtilization, MathLib.WAD]) {
    const isFreeFriendlyPass = penalty === 0n && isFriendlyPass;
    isFriendlyPass = false;
    if (state.remainingShortfall === 0n && !isFreeFriendlyPass) {
      continue;
    }

    const result = planOperationUtilizationPass({
      ...params,
      state,
      utilization,
      penalty,
      isFreeFriendlyPass,
      triedFullCapacityAttempt,
    });
    state = result.state;
    triedFullCapacityAttempt = result.triedFullCapacityAttempt;
  }
  return state;
}

/**
 * Executes and, for paid passes, retries one utilization budget.
 * Updates working data/reserves in place; the returned state may share those objects
 * rather than an isolated snapshot. Do not reuse a prior state after this step.
 * @internal
 */
function planOperationUtilizationPass(
  params: OperationPlanParameters & {
    readonly state: OperationPlanState;
    readonly utilization: bigint;
    readonly penalty: bigint;
    readonly isFreeFriendlyPass: boolean;
    readonly triedFullCapacityAttempt: boolean;
  },
) {
  const { penalty } = params;
  let state: OperationPlanState = {
    ...params.state,
    reallocations: [...params.state.reallocations],
  };
  let triedFullCapacityAttempt = params.triedFullCapacityAttempt;
  let passMaxAssets = getOperationPassBudget(params);
  const retryPaidPass = penalty > 0n;
  let lo = retryPaidPass ? passMaxAssets - 1n : 0n;
  let tryFullCapacityAttempt = false;
  let isFullCapacityRetryPath = false;
  const beforePassRemainingShortfall = state.remainingShortfall;
  const beforePassAccountingShortfall = state.accountingShortfall;
  // Grow by grossed-up gaps, bisect to the smallest found, and keep the best for non-monotonic shared-cap fitting.
  const passStart = retryPaidPass
    ? {
        data: state.data.clone(),
        context: state.context,
        reserves: cloneCapReserveState(state.reserves),
        reallocationCount: state.reallocations.length,
      }
    : undefined;
  let previousPassReallocatedAssets = 0n;
  let previousPhysicalShortfall: bigint | undefined;
  let hi: bigint | undefined;
  let bestAttempt: OperationBestAttempt | undefined;

  while (true) {
    const isFullCapacityAttempt = tryFullCapacityAttempt;
    tryFullCapacityAttempt = false;
    if (passStart != null) {
      state = restoreOperationPassStart({ state, passStart });
    }
    const attempt = executeOperationAttempt({
      ...params,
      state,
      isFullCapacityAttempt,
      passMaxAssets,
      isFullCapacityRetryPath,
    });
    state = attempt.state;
    const {
      pass,
      physicalShortfall,
      attemptTransferShortfall,
      attemptCoversShortfall,
      passReallocatedAssets,
    } = attempt;
    if (passStart == null) {
      break;
    }
    if (isFullCapacityAttempt) {
      passMaxAssets = passReallocatedAssets;
    }

    bestAttempt = chooseOperationBestAttempt({
      ...params,
      state,
      bestAttempt,
      beforePassAccountingShortfall,
      isFullCapacityRetryPath,
      attemptCoversShortfall,
      attemptTransferShortfall,
      passReallocatedAssets,
      passReallocations: pass.reallocations,
    });

    const next = advanceOperationPassSearch({
      lo,
      hi,
      passMaxAssets,
      triedFullCapacityAttempt,
      tryFullCapacityAttempt,
      isFullCapacityRetryPath,
      previousPhysicalShortfall,
      previousPassReallocatedAssets,
      isFullCapacityAttempt,
      attemptCoversShortfall,
      accountingShortfall: state.accountingShortfall,
      physicalShortfall,
      passReallocatedAssets,
      remainingShortfall: state.remainingShortfall,
      penalty,
    });
    if (next.type === "break") {
      break;
    }
    ({
      lo,
      hi,
      passMaxAssets,
      triedFullCapacityAttempt,
      tryFullCapacityAttempt,
      isFullCapacityRetryPath,
      previousPhysicalShortfall,
      previousPassReallocatedAssets,
    } = next);
  }
  const finalState = finishOperationPass({
    ...params,
    state,
    passStart,
    bestAttempt,
    beforePassRemainingShortfall,
    beforePassAccountingShortfall,
  });

  return {
    state: finalState,
    triedFullCapacityAttempt,
  };
}

/**
 * Restores working data and reserves and truncates the shared reallocation array in place.
 * Other attempt results remain available to the retry search.
 * @internal
 */
function restoreOperationPassStart({
  state,
  passStart,
}: {
  readonly state: OperationPlanState;
  readonly passStart: OperationPassStart;
}): OperationPlanState {
  const data = passStart.data.clone();
  const context = passStart.context;
  const reserves = cloneCapReserveState(passStart.reserves);
  state.reallocations.length = passStart.reallocationCount;
  return { ...state, data, context, reserves };
}

/** Summarizes liquidity-bound legs and the accounting and physical funding result. @internal */
function summarizeOperationPlan(
  params: OperationPlanParameters & { readonly state: OperationPlanState },
) {
  const {
    maxAssets,
    headroom,
    type,
    amount,
    feeAssets,
    blueBalance,
    absoluteShortfall,
    hasExplicitBlueBalance,
  } = params;
  const { reallocations, data, allocatorCapBoundTargets, idleBoundVaults } =
    params.state;

  let reallocatedAssets = 0n;
  let unboundAssets = 0n;
  for (const { vault, from, to, assets } of reallocations) {
    reallocatedAssets += assets;
    const key = `${vault.toLowerCase()}:${to.adapter.toLowerCase()}`;
    if (
      !allocatorCapBoundTargets.has(key) &&
      !(from.type === "idle" && idleBoundVaults.has(vault.toLowerCase()))
    ) {
      unboundAssets += assets;
    }
  }
  const penaltyAssets = getBlueBundlesV1PenaltyAssets(reallocations);
  const idleAssets = reallocations.reduce(
    (total, { from, assets }) =>
      from.type === "idle" ? total + assets : total,
    0n,
  );
  const physicalShortfall =
    penaltyAssets === 0n
      ? 0n
      : MathLib.zeroFloorSub(
          (type === "refinance" ? amount + feeAssets + penaltyAssets : amount) +
            penaltyAssets,
          blueBalance + idleAssets,
        );
  const transferShortfall = getReallocationTransferShortfall(
    reallocations,
    blueBalance,
  );
  const coversAccountingShortfall =
    type === "refinance"
      ? reallocatedAssets >= absoluteShortfall + penaltyAssets
      : reallocatedAssets >= absoluteShortfall;
  return {
    maxAssets,
    headroom,
    reallocations,
    data,
    liquidityBound:
      allocatorCapBoundTargets.size > 0 || idleBoundVaults.size > 0,
    reallocatedAssets,
    unboundAssets,
    physicalShortfall,
    coversShortfall:
      coversAccountingShortfall &&
      (type === "refinance" || penaltyAssets <= amount) &&
      (!hasExplicitBlueBalance ||
        (physicalShortfall === 0n && transferShortfall === 0n)),
  };
}

/** Per-pass settings shared by the budget, execution, and retry steps. @internal */
type OperationPassParameters = OperationPlanParameters & {
  readonly state: OperationPlanState;
  readonly utilization: bigint;
  readonly penalty: bigint;
  readonly isFreeFriendlyPass: boolean;
  readonly triedFullCapacityAttempt: boolean;
};

/** A paid-pass attempt retained according to accounting and physical priority. @internal */
interface OperationBestAttempt {
  readonly data: VaultV2BlueReallocationData;
  readonly context: SimulationContext;
  readonly reserves: CapReserveState;
  readonly reallocations: readonly VaultV2BlueReallocation[];
  readonly remainingShortfall: bigint;
  readonly accountingShortfall: bigint;
  readonly passReallocatedAssets: bigint;
  readonly priority: readonly [bigint, bigint, bigint, bigint];
}

/** A paid pass's pre-attempt rollback checkpoint. @internal */
interface OperationPassStart {
  readonly data: VaultV2BlueReallocationData;
  readonly context: SimulationContext;
  readonly reserves: CapReserveState;
  readonly reallocationCount: number;
}

/** Sizes a pass for its accounting gap and optional physical penalty funding. @internal */
function getOperationPassBudget(params: OperationPassParameters): bigint {
  const {
    type,
    penalty,
    isFreeFriendlyPass,
    maxAssets,
    usePhysicalBalance,
    amount,
    feeAssets,
    blueBalance,
  } = params;
  const { remainingShortfall, reallocations } = params.state;
  let passMaxAssets = remainingShortfall;
  if (type === "refinance" && penalty > 0n) {
    passMaxAssets = MathLib.mulDivUp(
      remainingShortfall,
      MathLib.WAD,
      MathLib.WAD - penalty,
    );
  } else if (isFreeFriendlyPass) {
    passMaxAssets = maxAssets;
  }
  if (usePhysicalBalance && penalty > 0n) {
    const penaltyMultiplier = type === "refinance" ? 2n : 1n;
    const physicalPenalty = penaltyMultiplier * penalty;
    if (physicalPenalty < MathLib.WAD) {
      const idleAssets = reallocations.reduce(
        (total, { from, assets }) =>
          from.type === "idle" ? total + assets : total,
        0n,
      );
      // Idle must fund both the operation and its penalty flash loan.
      const physicalShortfall = MathLib.zeroFloorSub(
        amount +
          feeAssets +
          penaltyMultiplier * getBlueBundlesV1PenaltyAssets(reallocations),
        blueBalance + idleAssets,
      );
      passMaxAssets = MathLib.max(
        passMaxAssets,
        MathLib.mulDivUp(
          physicalShortfall,
          MathLib.WAD,
          MathLib.WAD - physicalPenalty,
        ),
      );
    }
  }

  return passMaxAssets;
}

/**
 * Executes one pass attempt and returns its updated state and funding gaps.
 * Updates working data/reserves in place via runUtilizationPass; the returned state
 * shares those objects. Callers must not reuse a prior state after this step.
 * @internal
 */
function executeOperationAttempt(
  params: OperationPassParameters & {
    readonly isFullCapacityAttempt: boolean;
    readonly passMaxAssets: bigint;
    readonly isFullCapacityRetryPath: boolean;
  },
) {
  const {
    type,
    amount,
    feeAssets,
    blueBalance,
    capAccrualBuffer,
    normalizedOptions,
    hasExplicitBlueBalance,
    marketId,
    headroom,
    utilization,
    penalty,
    isFreeFriendlyPass,
    runUtilizationPass,
    isFullCapacityAttempt,
    passMaxAssets,
    isFullCapacityRetryPath,
  } = params;
  let {
    reserves,
    data,
    context,
    remainingShortfall,
    accountingShortfall,
    allocatorCapBoundTargets,
    idleBoundVaults,
  } = params.state;
  const reallocations = [...params.state.reallocations];
  const pass = runUtilizationPass(data, {
    context,
    reserves,
    marketId,
    maxWithdrawalUtilization: utilization,
    maxAssets: isFullCapacityAttempt ? undefined : passMaxAssets,
    capAccrualBuffer,
    allocatorCapHeadroom: headroom,
    penalty,
    options: normalizedOptions,
  });
  reallocations.push(...pass.reallocations);
  data = pass.data;
  context = pass.context;
  if (isFreeFriendlyPass) {
    allocatorCapBoundTargets = pass.allocatorCapBoundTargets;
    idleBoundVaults = pass.idleBoundVaults;
  }

  const currentMarket = data.getMarket(marketId);
  const penaltyAssets =
    type === "refinance" ? getBlueBundlesV1PenaltyAssets(reallocations) : 0n;
  let borrow: bigint;
  switch (type) {
    case "borrow":
      borrow = currentMarket.totalBorrowAssets + amount;
      break;
    case "refinance":
      borrow =
        currentMarket.totalBorrowAssets + amount + feeAssets + penaltyAssets;
      break;
    default:
      borrow = currentMarket.totalBorrowAssets;
  }
  const supply =
    type === "withdraw"
      ? currentMarket.totalSupplyAssets - amount
      : currentMarket.totalSupplyAssets;
  accountingShortfall = borrow > supply ? borrow - supply : 0n;
  const penaltyForPhysicalShortfall =
    getBlueBundlesV1PenaltyAssets(reallocations);
  const idleAssetsForPhysicalShortfall = reallocations.reduce(
    (total, { from, assets }) =>
      from.type === "idle" ? total + assets : total,
    0n,
  );
  const physicalShortfall =
    penaltyForPhysicalShortfall === 0n
      ? 0n
      : MathLib.zeroFloorSub(
          (type === "refinance"
            ? amount + feeAssets + penaltyForPhysicalShortfall
            : amount) + penaltyForPhysicalShortfall,
          blueBalance + idleAssetsForPhysicalShortfall,
        );
  remainingShortfall = MathLib.max(accountingShortfall, physicalShortfall);
  const attemptTransferShortfall =
    hasExplicitBlueBalance && isFullCapacityRetryPath
      ? getReallocationTransferShortfall(reallocations, blueBalance)
      : 0n;
  const attemptCoversShortfall = remainingShortfall === 0n;
  const passReallocatedAssets = pass.reallocations.reduce(
    (total, { assets }) => total + assets,
    0n,
  );

  return {
    state: {
      reserves,
      reallocations,
      data,
      context,
      remainingShortfall,
      accountingShortfall,
      allocatorCapBoundTargets,
      idleBoundVaults,
    },
    pass,
    physicalShortfall,
    attemptTransferShortfall,
    attemptCoversShortfall,
    passReallocatedAssets,
  };
}

/** Retains the best feasible paid-pass attempt with the original priority ordering. @internal */
function chooseOperationBestAttempt(
  params: OperationPassParameters & {
    readonly bestAttempt: OperationBestAttempt | undefined;
    readonly beforePassAccountingShortfall: bigint;
    readonly isFullCapacityRetryPath: boolean;
    readonly attemptCoversShortfall: boolean;
    readonly attemptTransferShortfall: bigint;
    readonly passReallocatedAssets: bigint;
    readonly passReallocations: readonly VaultV2BlueReallocation[];
  },
): OperationBestAttempt | undefined {
  const {
    hasExplicitBlueBalance,
    bestAttempt,
    beforePassAccountingShortfall,
    isFullCapacityRetryPath,
    attemptCoversShortfall,
    attemptTransferShortfall,
    passReallocatedAssets,
    passReallocations,
  } = params;
  const { data, context, reserves, remainingShortfall, accountingShortfall } =
    params.state;
  const improvesAccounting =
    accountingShortfall < beforePassAccountingShortfall;
  const attemptPriority: readonly [bigint, bigint, bigint, bigint] =
    hasExplicitBlueBalance
      ? [0n, remainingShortfall, 0n, passReallocatedAssets]
      : [
          improvesAccounting ? 0n : 1n,
          improvesAccounting ? accountingShortfall : 0n,
          remainingShortfall,
          passReallocatedAssets,
        ];
  const previousBestAttempt = bestAttempt;
  let isBetterAttempt = previousBestAttempt == null;
  if (previousBestAttempt != null) {
    const firstDifference = attemptPriority.findIndex(
      (candidatePriority, index) =>
        candidatePriority !== previousBestAttempt.priority[index],
    );
    const priority = attemptPriority[firstDifference];
    const previousPriority = previousBestAttempt.priority[firstDifference];
    isBetterAttempt =
      priority != null &&
      previousPriority != null &&
      priority < previousPriority;
  }
  if (
    isBetterAttempt &&
    (!isFullCapacityRetryPath ||
      (attemptCoversShortfall && attemptTransferShortfall === 0n))
  ) {
    return {
      data,
      context,
      reserves: cloneCapReserveState(reserves),
      reallocations: passReallocations,
      remainingShortfall,
      accountingShortfall,
      passReallocatedAssets,
      priority: attemptPriority,
    };
  }
  return bestAttempt;
}

/** Mutable search coordinates returned between paid-pass retry iterations. @internal */
interface OperationPassSearchState {
  readonly lo: bigint;
  readonly hi: bigint | undefined;
  readonly passMaxAssets: bigint;
  readonly triedFullCapacityAttempt: boolean;
  readonly tryFullCapacityAttempt: boolean;
  readonly isFullCapacityRetryPath: boolean;
  readonly previousPhysicalShortfall: bigint | undefined;
  readonly previousPassReallocatedAssets: bigint;
}

/** Advances bisection or grossed-up retries, stopping on stalled physical funding. @internal */
function advanceOperationPassSearch(
  params: OperationPassSearchState & {
    readonly isFullCapacityAttempt: boolean;
    readonly attemptCoversShortfall: boolean;
    readonly accountingShortfall: bigint;
    readonly physicalShortfall: bigint;
    readonly passReallocatedAssets: bigint;
    readonly remainingShortfall: bigint;
    readonly penalty: bigint;
  },
):
  | { readonly type: "break" }
  | ({ readonly type: "continue" } & OperationPassSearchState) {
  let {
    lo,
    hi,
    passMaxAssets,
    triedFullCapacityAttempt,
    tryFullCapacityAttempt,
    isFullCapacityRetryPath,
    previousPhysicalShortfall,
    previousPassReallocatedAssets,
  } = params;
  const {
    isFullCapacityAttempt,
    attemptCoversShortfall,
    accountingShortfall,
    physicalShortfall,
    passReallocatedAssets,
    remainingShortfall,
    penalty,
  } = params;
  ({ lo, hi } = updateOperationSearchBracket({
    lo,
    hi,
    passMaxAssets,
    attemptCoversShortfall,
  }));

  if (hi != null) {
    if (hi - lo <= 1n) {
      return { type: "break" };
    }
    passMaxAssets = (lo + hi) / 2n;
    return {
      type: "continue",
      lo,
      hi,
      passMaxAssets,
      triedFullCapacityAttempt,
      tryFullCapacityAttempt,
      isFullCapacityRetryPath,
      previousPhysicalShortfall,
      previousPassReallocatedAssets,
    };
  }

  if (isFullCapacityAttempt && !attemptCoversShortfall) {
    return { type: "break" };
  }
  if (
    accountingShortfall === 0n &&
    previousPhysicalShortfall != null &&
    physicalShortfall >= previousPhysicalShortfall
  ) {
    if (!triedFullCapacityAttempt && passReallocatedAssets === passMaxAssets) {
      triedFullCapacityAttempt = true;
      tryFullCapacityAttempt = true;
      isFullCapacityRetryPath = true;
      return {
        type: "continue",
        lo,
        hi,
        passMaxAssets,
        triedFullCapacityAttempt,
        tryFullCapacityAttempt,
        isFullCapacityRetryPath,
        previousPhysicalShortfall,
        previousPassReallocatedAssets,
      };
    }
    return { type: "break" };
  }
  previousPhysicalShortfall = physicalShortfall;

  if (
    passReallocatedAssets <= previousPassReallocatedAssets ||
    penalty === MathLib.WAD
  ) {
    return { type: "break" };
  }
  previousPassReallocatedAssets = passReallocatedAssets;
  passMaxAssets += MathLib.mulDivUp(
    remainingShortfall,
    MathLib.WAD,
    MathLib.WAD - penalty,
  );
  return {
    type: "continue",
    lo,
    hi,
    passMaxAssets,
    triedFullCapacityAttempt,
    tryFullCapacityAttempt,
    isFullCapacityRetryPath,
    previousPhysicalShortfall,
    previousPassReallocatedAssets,
  };
}

/**
 * Commits the best improving paid attempt or restores the pre-pass checkpoint.
 * Returns working data by reference and may retain shared reserves; this does not
 * isolate earlier in-place updates. Do not reuse a prior state for further planning.
 * @internal
 */
function finishOperationPass(
  params: OperationPassParameters & {
    readonly passStart: OperationPassStart | undefined;
    readonly bestAttempt: OperationBestAttempt | undefined;
    readonly beforePassRemainingShortfall: bigint;
    readonly beforePassAccountingShortfall: bigint;
  },
): OperationPlanState {
  const {
    passStart,
    bestAttempt,
    beforePassRemainingShortfall,
    beforePassAccountingShortfall,
    hasExplicitBlueBalance,
  } = params;
  let { reserves, data, context, remainingShortfall, accountingShortfall } =
    params.state;
  const { allocatorCapBoundTargets, idleBoundVaults } = params.state;
  const reallocations = [...params.state.reallocations];
  if (passStart != null) {
    const improved =
      bestAttempt != null &&
      (hasExplicitBlueBalance
        ? bestAttempt.remainingShortfall < beforePassRemainingShortfall
        : bestAttempt.accountingShortfall < beforePassAccountingShortfall ||
          bestAttempt.remainingShortfall < beforePassRemainingShortfall);
    if (improved && bestAttempt != null) {
      data = bestAttempt.data;
      context = bestAttempt.context;
      reserves = cloneCapReserveState(bestAttempt.reserves);
      reallocations.length = passStart.reallocationCount;
      reallocations.push(...bestAttempt.reallocations);
      remainingShortfall = bestAttempt.remainingShortfall;
      accountingShortfall = bestAttempt.accountingShortfall;
    } else {
      data = passStart.data;
      context = passStart.context;
      reserves = cloneCapReserveState(passStart.reserves);
      reallocations.length = passStart.reallocationCount;
      remainingShortfall = beforePassRemainingShortfall;
      accountingShortfall = beforePassAccountingShortfall;
    }
  }
  return {
    reserves,
    reallocations,
    data,
    context,
    remainingShortfall,
    accountingShortfall,
    allocatorCapBoundTargets,
    idleBoundVaults,
  };
}

/** Tightens a paid-pass bisection bracket from the attempt's coverage result. @internal */
function updateOperationSearchBracket(params: {
  readonly lo: bigint;
  readonly hi: bigint | undefined;
  readonly passMaxAssets: bigint;
  readonly attemptCoversShortfall: boolean;
}) {
  let { lo, hi } = params;
  const { passMaxAssets, attemptCoversShortfall } = params;
  if (attemptCoversShortfall) {
    hi = hi == null ? passMaxAssets : MathLib.min(hi, passMaxAssets);
  } else {
    lo = MathLib.max(lo, passMaxAssets);
  }
  return { lo, hi };
}

/** An operation's amount and optional refinance referral fee. @internal */
type ReallocationOperation = NonNullable<
  NonNullable<
    Parameters<
      VaultV2BlueReallocationData["computeVaultV2BlueReallocations"]
    >[1]
  >["operation"]
>;

/** Validates the operation amount and fee before reading its snapshot. @internal */
function resolveOperationFeeAssets(operation: ReallocationOperation): bigint {
  const { amount } = operation;
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }
  const referralFeePct =
    operation.type === "refinance" ? (operation.referralFeePct ?? 0n) : 0n;
  if (referralFeePct < 0n) {
    throw new NegativeInputError("referralFeePct", referralFeePct);
  }
  if (referralFeePct >= MathLib.WAD) {
    throw new ReferralFeePctExceededError(referralFeePct);
  }
  const feeAssets =
    operation.type === "refinance"
      ? getBlueBundlesV1ReferralFeeAssets(amount, referralFeePct)
      : 0n;
  return feeAssets;
}

/** Computes post-operation accounting totals, rejecting withdrawals above supply. @internal */
function getOperationMarketTotals({
  market,
  marketId,
  type,
  amount,
  feeAssets,
}: {
  readonly market: ReadonlyMarketSnapshot;
  readonly marketId: MarketId;
  readonly type: ReallocationOperation["type"];
  readonly amount: bigint;
  readonly feeAssets: bigint;
}) {
  if (type === "withdraw" && amount > market.totalSupplyAssets) {
    throw new ReallocationWithdrawExceedsMarketSupplyError({
      marketId,
      withdrawAmount: amount,
      totalSupplyAssets: market.totalSupplyAssets,
    });
  }

  let newTotalBorrowAssets = market.totalBorrowAssets;
  if (type === "borrow") {
    newTotalBorrowAssets += amount;
  }
  if (type === "refinance") {
    newTotalBorrowAssets += amount + feeAssets;
  }
  const newTotalSupplyAssets =
    type === "withdraw"
      ? market.totalSupplyAssets - amount
      : market.totalSupplyAssets;

  return { newTotalBorrowAssets, newTotalSupplyAssets };
}

/** Inputs for budget selection and the final feasibility check. @internal */
interface OperationPlanSelectionParameters {
  readonly plan: (
    maxAssets: bigint,
    options: {
      readonly headroom: bigint;
      readonly usePhysicalBalance?: boolean;
    },
  ) => ReturnType<typeof planVaultOperation>;
  readonly requiredAssets: bigint;
  readonly allocatorCapHeadroom: bigint;
  readonly absoluteShortfall: bigint;
  readonly hasExplicitBlueBalance: boolean;
  readonly marketId: MarketId;
  readonly type: ReallocationOperation["type"];
  readonly amount: bigint;
  readonly blueBalance: bigint;
  readonly feeAssets: bigint;
}

/** Chooses a headroom or full-cap budget before testing physical-balance alternatives. @internal */
function selectOperationPlan(params: OperationPlanSelectionParameters) {
  const { plan, requiredAssets, allocatorCapHeadroom, absoluteShortfall } =
    params;
  // A leg that fills an allocator cap, or idle legs that together take
  // (nearly) all of a source vault's starting idle, revert once another
  // allocation lands first. A bound plan therefore moves only the operation's
  // shortfall, or what unbound legs moved.
  const target = plan(requiredAssets, { headroom: allocatorCapHeadroom });
  let selected = target;
  if (allocatorCapHeadroom > 0n && target.liquidityBound) {
    selected = plan(
      absoluteShortfall > target.unboundAssets
        ? absoluteShortfall
        : target.unboundAssets,
      { headroom: allocatorCapHeadroom },
    );
    // Shared-cap fitting is not monotonic in the budget.
    if (!selected.coversShortfall && target.coversShortfall) {
      selected = target;
    }
  }
  let available = MathLib.max(
    target.reallocatedAssets,
    selected.reallocatedAssets,
  );
  // Without headroom, `target` already is the full-cap plan toward the target.
  const fullCapBudgets =
    allocatorCapHeadroom > 0n ? [absoluteShortfall, requiredAssets] : [];
  for (const maxAssets of fullCapBudgets) {
    if (selected.coversShortfall) {
      break;
    }
    selected = plan(maxAssets, { headroom: 0n });
    if (selected.reallocatedAssets > available) {
      available = selected.reallocatedAssets;
    }
  }

  // Reject unfunded plans before comparing optional physical-balance alternatives.
  assertSelectedOperationFunding({ ...params, selected, available });
  const funded = choosePhysicalBalancePlan({ ...params, selected });
  return { reallocations: funded.reallocations, data: funded.data };
}

/** Preserves penalty-specific error precedence when selected liquidity cannot fund the operation. @internal */
function assertSelectedOperationFunding(
  params: OperationPlanSelectionParameters & {
    readonly selected: ReturnType<typeof planVaultOperation>;
    readonly available: bigint;
  },
): void {
  const {
    selected,
    available,
    hasExplicitBlueBalance,
    blueBalance,
    type,
    amount,
    absoluteShortfall,
    marketId,
  } = params;
  if (selected.coversShortfall) {
    return;
  }

  const selectedTransferShortfall = hasExplicitBlueBalance
    ? getReallocationTransferShortfall(selected.reallocations, blueBalance)
    : 0n;
  const selectedPenaltyAssets = getBlueBundlesV1PenaltyAssets(
    selected.reallocations,
  );
  if (
    type !== "refinance" &&
    selectedPenaltyAssets > amount &&
    selected.reallocatedAssets >= absoluteShortfall &&
    (!hasExplicitBlueBalance ||
      (selected.physicalShortfall === 0n && selectedTransferShortfall === 0n))
  ) {
    throw new InputExceedsMaxError({
      field: "reallocationPenaltyAssets",
      value: selectedPenaltyAssets,
      max: amount,
    });
  }
  throw new InsufficientSharedLiquidityError({
    marketId,
    shortfall: MathLib.max(
      absoluteShortfall +
        (type === "refinance"
          ? getBlueBundlesV1PenaltyAssets(selected.reallocations)
          : 0n),
      selected.reallocatedAssets +
        (hasExplicitBlueBalance
          ? MathLib.max(selected.physicalShortfall, selectedTransferShortfall)
          : 0n),
    ),
    available,
  });
}

/** Retains the selected plan unless a physical-balance seed is funded and strictly cheaper. @internal */
function choosePhysicalBalancePlan(
  params: OperationPlanSelectionParameters & {
    readonly selected: ReturnType<typeof planVaultOperation>;
  },
): ReturnType<typeof planVaultOperation> {
  const { hasExplicitBlueBalance, blueBalance, amount, feeAssets, type, plan } =
    params;
  let { selected } = params;
  const selectedPenaltyAssets = getBlueBundlesV1PenaltyAssets(
    selected.reallocations,
  );
  if (
    hasExplicitBlueBalance &&
    selectedPenaltyAssets > 1n &&
    blueBalance <
      amount +
        feeAssets +
        (type === "refinance" ? 2n : 1n) * selectedPenaltyAssets
  ) {
    // Amount feasibility is not monotonic: retain the original plan unless
    // the physical-balance seed finds a fully funded, strictly cheaper one.
    const alternative = plan(selected.maxAssets, {
      headroom: selected.headroom,
      usePhysicalBalance: true,
    });
    if (
      alternative.coversShortfall &&
      getBlueBundlesV1PenaltyAssets(alternative.reallocations) <
        getBlueBundlesV1PenaltyAssets(selected.reallocations)
    ) {
      selected = alternative;
    }
  }

  return selected;
}
