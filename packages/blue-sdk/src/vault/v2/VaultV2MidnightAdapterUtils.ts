import { MidnightPositionLib } from "@morpho-org/morpho-ts";
import { midnightCollateralParamsAbi } from "@morpho-org/morpho-ts/abis/midnight";
import {
  InvalidVaultV2MidnightAdapterMarketsError,
  VaultV2Errors,
} from "../../errors.js";
import { MathLib } from "../../math/index.js";
import type { Address, BigIntish, Hash } from "../../types.js";
import type { CapacityLimit } from "../../utils.js";
import { VaultV2Utils } from "./VaultV2Utils.js";

/**
 * Midnight collateral fields used by Vault V2 Midnight adapter cap ids.
 * Structurally compatible with midnight-sdk's `ICollateralParams`.
 */
export interface IVaultV2MidnightAdapterCollateralParams {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: BigIntish;
  /** WAD-scaled liquidation cursor used to compute the maximum liquidation incentive factor. */
  readonly liquidationCursor: BigIntish;
  /** Collateral price oracle address. */
  readonly oracle: Address;
}

/**
 * Midnight `Market` fields read by the adapter's `ids()`, plus `maturity` (not used by cap ids).
 * Structurally compatible with midnight-sdk's `IMarketParams` (pass `market.params`).
 */
export interface IVaultV2MidnightAdapterMarket {
  /** Market collateral definitions; each yields a collateral-token and a collateral-params cap id. */
  readonly collateralParams: readonly IVaultV2MidnightAdapterCollateralParams[];
  /** Market maturity as a Unix timestamp in seconds; not used by cap ids. */
  readonly maturity: BigIntish;
  /** Recovery close factor threshold in loan-token units: the RCF is deactivated when a liquidation could leave collateral worth less than this amount. */
  readonly rcfThreshold: BigIntish;
  /** Entry gate address (zero address when ungated). */
  readonly enterGate: Address;
  /** Liquidator gate address (zero address when ungated). */
  readonly liquidatorGate: Address;
}

/** Plain input shape for Midnight adapter market data, normalized into {@link VaultV2MidnightAdapterMarketData}. */
export interface IVaultV2MidnightAdapterMarketData {
  /** Stored net credit in asset units, updated on buy, sell and forceDeallocate and used by duration caps; not the live value. */
  readonly netCredit: BigIntish;
  /** WAD-scaled simple interest rate per second. */
  readonly rate: BigIntish;
  /** Market maturity as a Unix timestamp in seconds. */
  readonly maturity: BigIntish;
  /** Position of the market in the adapter's `marketIds` array (swap-and-pop on removal). */
  readonly index: BigIntish;
  /** Whether the market can be sold at an arbitrary loss; sales then don't lower `rate` and buying is blocked. */
  readonly forceSellable: boolean;
}

/** Normalized Midnight adapter market data. */
export interface VaultV2MidnightAdapterMarketData {
  /** Stored net credit in asset units, updated on buy, sell and forceDeallocate and used by duration caps; not the live value. */
  readonly netCredit: bigint;
  /** WAD-scaled simple interest rate per second. */
  readonly rate: bigint;
  /** Market maturity as a Unix timestamp in seconds. */
  readonly maturity: bigint;
  /** Position of the market in the adapter's `marketIds` array (swap-and-pop on removal). */
  readonly index: bigint;
  /** Whether the market can be sold at an arbitrary loss; sales then don't lower `rate` and buying is blocked. */
  readonly forceSellable: boolean;
}

/** Raw Midnight position state at an adapter snapshot. */
export interface IVaultV2MidnightAdapterPosition {
  /** Midnight position credit in loan-asset units. */
  readonly credit: BigIntish;
  /** Midnight pending fee in loan-asset units. */
  readonly pendingFee: BigIntish;
  /** Midnight position loss factor scaled by uint128; `MAX_UINT_128` represents total loss. */
  readonly lastLossFactor: BigIntish;
  /** Midnight position's last-accrual timestamp in Unix seconds. */
  readonly lastAccrual: BigIntish;
}

/** Midnight market loss-factor state. */
export interface IVaultV2MidnightAdapterMarketState {
  /** Midnight market loss factor scaled by uint128; `MAX_UINT_128` represents total loss. */
  readonly lossFactor: BigIntish;
}

/** Position and loss-factor state used to value one Midnight market. */
export interface IVaultV2MidnightAdapterAccrualMarket {
  /** Held Midnight market id. */
  readonly id: Hash;
  /** Midnight position snapshot, with credit and pending fee in loan-asset units. */
  readonly position: IVaultV2MidnightAdapterPosition;
  /** Midnight market loss-factor snapshot. */
  readonly market: IVaultV2MidnightAdapterMarketState;
}

/** Normalized Midnight position and loss-factor state used for accrual. */
export interface VaultV2MidnightAdapterAccrualMarket {
  /** Held Midnight market id. */
  readonly id: Hash;
  /** Midnight position state normalized to bigint values. */
  readonly position: {
    /** Midnight position credit in loan-asset units. */
    readonly credit: bigint;
    /** Midnight pending fee in loan-asset units. */
    readonly pendingFee: bigint;
    /** Midnight position loss factor scaled by uint128; `MAX_UINT_128` represents total loss. */
    readonly lastLossFactor: bigint;
    /** Midnight position's last-accrual timestamp in Unix seconds. */
    readonly lastAccrual: bigint;
  };
  /** Midnight market loss-factor state normalized to bigint values. */
  readonly market: {
    /** Midnight market loss factor scaled by uint128; `MAX_UINT_128` represents total loss. */
    readonly lossFactor: bigint;
  };
}

/** Pure helpers for Vault V2 Midnight adapter identifiers and caps. */
export namespace VaultV2MidnightAdapterUtils {
  /**
   * Validates the one-to-one correspondence between held market ids, market data, and positions.
   *
   * @param adapter - Held market ids and stored Midnight market data.
   * @param markets - Position and loss-factor snapshots.
   * @returns Nothing.
   * @throws {InvalidVaultV2MidnightAdapterMarketsError} when ids are duplicated, a held market is missing a position or data row, a position is not held, or `marketData` has a row for an id not in `marketIds`.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * VaultV2MidnightAdapterUtils.validateMarkets(
   *   {
   *     marketIds: [
   *       "0x0000000000000000000000000000000000000000000000000000000000000001",
   *     ],
   *     marketData: {
   *       "0x0000000000000000000000000000000000000000000000000000000000000001": {
   *         netCredit: 1_000n,
   *         rate: 0n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *       },
   *     },
   *   },
   *   [
   *     {
   *       id: "0x0000000000000000000000000000000000000000000000000000000000000001",
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 0n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   * );
   * ```
   */
  export function validateMarkets(
    adapter: {
      readonly marketIds: readonly Hash[];
      readonly marketData: Readonly<
        Record<Hash, IVaultV2MidnightAdapterMarketData>
      >;
    },
    markets: readonly IVaultV2MidnightAdapterAccrualMarket[],
  ): void {
    const heldMarketIds = new Set<Hash>();
    for (const id of adapter.marketIds) {
      if (heldMarketIds.has(id) || adapter.marketData[id] === undefined) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
      heldMarketIds.add(id);
    }

    for (const id of Object.keys(adapter.marketData) as Hash[]) {
      if (adapter.marketData[id] !== undefined && !heldMarketIds.has(id)) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
    }

    const positionIds = new Set<Hash>();
    for (const { id } of markets) {
      if (!heldMarketIds.has(id) || positionIds.has(id)) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
      positionIds.add(id);
    }

    for (const id of adapter.marketIds) {
      if (!positionIds.has(id)) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
    }
  }

  /**
   * Values held Midnight markets using a hyperbolic discount until maturity.
   *
   * @param adapter - Adapter market ids and stored Midnight market data.
   * @param markets - Position and loss-factor snapshots matching the adapter market ids.
   * @param timestamp - Valuation timestamp in Unix seconds.
   * @returns Total loss-adjusted net credit after hyperbolic discounting in loan-asset units.
   * @throws {InvalidVaultV2MidnightAdapterMarketsError} when held market ids, market data, and positions do not correspond one-to-one.
   * @throws {InvalidPositionLossFactorError} when a market loss factor is below the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when Midnight position accrual inputs violate accounting invariants.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const assets = VaultV2MidnightAdapterUtils.realAssets(
   *   {
   *     marketIds: [id],
   *     marketData: {
   *       [id]: {
   *         netCredit: 1_000n,
   *         rate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *       },
   *     },
   *   },
   *   [
   *     {
   *       id,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 0n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   100n,
   * );
   * // assets is 500n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: plain-object state, positions, and timestamp mirror the class methods
  export function realAssets(
    adapter: {
      readonly marketIds: readonly Hash[];
      readonly marketData: Readonly<
        Record<Hash, IVaultV2MidnightAdapterMarketData>
      >;
    },
    markets: readonly IVaultV2MidnightAdapterAccrualMarket[],
    timestamp: BigIntish,
  ): bigint {
    // Validate id correspondence before valuation.
    VaultV2MidnightAdapterUtils.validateMarkets(adapter, markets);
    const marketsById = new Map(markets.map((market) => [market.id, market]));
    const requested = BigInt(timestamp);

    return adapter.marketIds.reduce((total, id) => {
      const market = marketsById.get(id);
      if (market === undefined) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
      const marketData = adapter.marketData[id];
      if (marketData === undefined) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(id);
      }
      const accrualTimestamp = MathLib.max(
        requested,
        BigInt(market.position.lastAccrual),
      );
      const netCredit = MidnightPositionLib.netCredit({
        ...market.position,
        marketLossFactor: market.market.lossFactor,
        maturity: marketData.maturity,
        timestamp: accrualTimestamp,
      });
      const denominator =
        MathLib.WAD +
        BigInt(marketData.rate) *
          MathLib.zeroFloorSub(BigInt(marketData.maturity), requested);
      return total + MathLib.mulDivDown(netCredit, MathLib.WAD, denominator);
    }, 0n);
  }

  /**
   * Projects Midnight positions to a timestamp without changing stored market data.
   *
   * @param adapter - Held market ids and stored Midnight market data.
   * @param markets - Position and loss-factor snapshots to accrue.
   * @param timestamp - Accrual timestamp in Unix seconds.
   * @returns New normalized market positions with loss and continuous fees accrued.
   * @throws {InvalidVaultV2MidnightAdapterMarketsError} when held market ids, market data, and positions do not correspond one-to-one.
   * @throws {InvalidPositionLossFactorError} when a market loss factor is below the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when Midnight position accrual inputs violate accounting invariants.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const markets = VaultV2MidnightAdapterUtils.accrueMarkets(
   *   {
   *     marketIds: [id],
   *     marketData: {
   *       [id]: {
   *         netCredit: 1_000n,
   *         rate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *       },
   *     },
   *   },
   *   [
   *     {
   *       id,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 100n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   150n,
   * );
   * // markets[0]?.position.lastAccrual is 150n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: plain-object state, positions, and timestamp mirror the class methods
  export function accrueMarkets(
    adapter: {
      readonly marketIds: readonly Hash[];
      readonly marketData: Readonly<
        Record<Hash, IVaultV2MidnightAdapterMarketData>
      >;
    },
    markets: readonly IVaultV2MidnightAdapterAccrualMarket[],
    timestamp: BigIntish,
  ): VaultV2MidnightAdapterAccrualMarket[] {
    // Validate id correspondence before projecting positions.
    VaultV2MidnightAdapterUtils.validateMarkets(adapter, markets);
    const requested = BigInt(timestamp);

    return markets.map((market) => {
      const marketData = adapter.marketData[market.id];
      if (marketData === undefined) {
        throw new InvalidVaultV2MidnightAdapterMarketsError(market.id);
      }
      const lastAccrual = BigInt(market.position.lastAccrual);
      const lossFactor = BigInt(market.market.lossFactor);
      const accrualTimestamp = MathLib.max(requested, lastAccrual);
      const accrued = MidnightPositionLib.accrue({
        ...market.position,
        marketLossFactor: lossFactor,
        maturity: marketData.maturity,
        timestamp: accrualTimestamp,
      });
      return {
        id: market.id,
        position: {
          credit: accrued.credit,
          pendingFee: accrued.pendingFee,
          lastLossFactor: lossFactor,
          lastAccrual: accrualTimestamp,
        },
        market: { lossFactor },
      };
    });
  }

  /**
   * Returns the collateral-token allocation-cap id.
   *
   * @param token - Collateral token address.
   * @returns The collateral-token allocation-cap id.
   * @throws {viem.InvalidAddressError} when `token` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.collateralTokenCapId(
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  export function collateralTokenCapId(token: Address): Hash {
    return VaultV2Utils.collateralCapId(token);
  }

  /**
   * Returns the collateral-parameters allocation-cap id.
   *
   * @param params - Midnight collateral parameters.
   * @returns The collateral-parameters allocation-cap id.
   * @throws {viem.InvalidAddressError} when `token` or `oracle` is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when `lltv` or `liquidationCursor` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.collateralParamsCapId({
   *   token: "0x0000000000000000000000000000000000000001",
   *   lltv: 860000000000000000n,
   *   liquidationCursor: 800000000000000000n,
   *   oracle: "0x0000000000000000000000000000000000000002",
   * });
   * ```
   */
  export function collateralParamsCapId(
    params: IVaultV2MidnightAdapterCollateralParams,
  ): Hash {
    return VaultV2Utils.capId({
      tag: "collateralParams",
      params: [midnightCollateralParamsAbi],
      values: [
        {
          token: params.token,
          lltv: BigInt(params.lltv),
          liquidationCursor: BigInt(params.liquidationCursor),
          oracle: params.oracle,
        },
      ],
    });
  }

  /**
   * Returns a gate allocation-cap id.
   *
   * @param tag - Contract cap-id tag.
   * @param gate - Gate address.
   * @returns The gate allocation-cap id.
   * @throws {viem.InvalidAddressError} when `gate` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.gateCapId(
   *   "enterGate",
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  export function gateCapId(
    tag: "enterGate" | "liquidatorGate",
    gate: Address,
  ): Hash {
    return VaultV2Utils.capId({
      tag,
      params: [{ type: "address" }],
      values: [gate],
    });
  }

  /**
   * Returns the RCF-threshold allocation-cap id.
   *
   * @param threshold - RCF threshold.
   * @returns The RCF-threshold allocation-cap id.
   * @throws {viem.IntegerOutOfRangeError} when `threshold` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.rcfThresholdCapId(1n);
   * ```
   */
  export function rcfThresholdCapId(threshold: BigIntish): Hash {
    return VaultV2Utils.capId({
      tag: "rcfThreshold",
      params: [{ type: "uint256" }],
      values: [BigInt(threshold)],
    });
  }

  /**
   * Returns the duration allocation-cap id.
   *
   * @param adapter - Adapter address.
   * @param duration - Duration in seconds.
   * @returns The duration allocation-cap id.
   * @throws {viem.InvalidAddressError} when `adapter` is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when `duration` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.durationCapId(
   *   "0x0000000000000000000000000000000000000001",
   *   3600n,
   * );
   * ```
   */
  export function durationCapId(adapter: Address, duration: BigIntish): Hash {
    return VaultV2Utils.capId({
      tag: "duration",
      params: [{ type: "address" }, { type: "uint256" }],
      values: [adapter, BigInt(duration)],
    });
  }

  /**
   * Returns the allocation-cap ids of a Midnight market, in contract order:
   * adapter id, enter gate, liquidator gate, RCF threshold, then the
   * collateral-token and collateral-parameters ids of each collateral.
   *
   * @param params.adapterId - Adapter allocation-cap id.
   * @param params.market - Midnight market fields used by the adapter.
   * @returns The market's `4 + 2 * collateralParams.length` allocation-cap ids.
   * @throws {viem.InvalidAddressError} when a gate, token, or oracle is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when an integer field is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils, VaultV2Utils } from "@morpho-org/blue-sdk";
   *
   * const ids = VaultV2MidnightAdapterUtils.ids({
   *   adapterId: VaultV2Utils.adapterCapId(
   *     "0x0000000000000000000000000000000000000003",
   *   ),
   *   market: {
   *     collateralParams: [],
   *     maturity: 3600n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000001",
   *     liquidatorGate: "0x0000000000000000000000000000000000000002",
   *   },
   * });
   * ```
   */
  export function ids({
    adapterId,
    market,
  }: {
    readonly adapterId: Hash;
    readonly market: IVaultV2MidnightAdapterMarket;
  }): Hash[] {
    return [
      adapterId,
      gateCapId("enterGate", market.enterGate),
      gateCapId("liquidatorGate", market.liquidatorGate),
      rcfThresholdCapId(market.rcfThreshold),
      ...market.collateralParams.flatMap((params) => [
        collateralTokenCapId(params.token),
        collateralParamsCapId(params),
      ]),
    ];
  }

  /**
   * Computes the adapter's cumulative duration totals, mirroring `MidnightAdapter.durationAllocations`.
   *
   * Entry `i` is the sum of stored `marketData.netCredit` over markets with
   * `max(maturity - timestamp, 0) >= durations[i]`. Totals are inclusive and
   * cumulative: a market counts toward every threshold its time to maturity
   * reaches, so entries overlap and never increase along ascending `durations`.
   * A market whose time to maturity is below `durations[0]` counts in no entry;
   * a matured market (time to maturity 0) counts only toward a `0n` threshold.
   *
   * @param params.marketData - Stored Midnight market data keyed by market id.
   * @param params.durations - Ascending duration thresholds, in seconds.
   * @param params.length - Number of leading thresholds to return totals for.
   * @param params.timestamp - Timestamp used to compute remaining maturities.
   * @returns Net-credit totals in duration order.
   * @throws {VaultV2Errors.InvalidMidnightDurationsLength} When `length` is negative, not an integer, or greater than `durations.length`.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const totals = VaultV2MidnightAdapterUtils.durationAllocations({
   *   marketData: {},
   *   durations: [3600n, 7200n],
   *   length: 2,
   *   timestamp: 1000n,
   * }); // [0n, 0n]
   * ```
   */
  export function durationAllocations({
    marketData,
    durations,
    length,
    timestamp,
  }: {
    readonly marketData: Readonly<
      Record<
        Hash,
        IVaultV2MidnightAdapterMarketData | VaultV2MidnightAdapterMarketData
      >
    >;
    readonly durations: readonly BigIntish[];
    readonly length: number;
    readonly timestamp: BigIntish;
  }): bigint[] {
    if (!Number.isInteger(length) || length < 0 || length > durations.length)
      throw new VaultV2Errors.InvalidMidnightDurationsLength(
        length,
        durations.length,
      );

    const allocations = Array.from({ length }, () => 0n);
    const thresholds = durations.slice(0, length).map(BigInt);
    const now = BigInt(timestamp);

    for (const data of Object.values(marketData)) {
      const ttm = MathLib.zeroFloorSub(BigInt(data.maturity), now);
      for (let i = 0; i < thresholds.length; i++) {
        if (thresholds[i]! <= ttm)
          allocations[i] = allocations[i]! + BigInt(data.netCredit);
      }
    }

    return allocations;
  }

  /**
   * Computes one duration cap's remaining headroom.
   *
   * @param params.allocation - Stored net-credit total for the duration.
   * @param params.absoluteCap - Vault absolute cap on the duration id.
   * @param params.relativeCap - Vault relative cap on the duration id, WAD-scaled.
   * @param params.firstTotalAssets - Vault total assets used for the relative cap.
   * @returns Remaining duration headroom and its binding cap.
   * @example
   * ```ts
   * import { MathLib, VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const headroom = VaultV2MidnightAdapterUtils.durationHeadroom({
   *   allocation: 10n,
   *   absoluteCap: 100n,
   *   relativeCap: MathLib.WAD,
   *   firstTotalAssets: 100n,
   * });
   * ```
   */
  export function durationHeadroom({
    allocation,
    absoluteCap,
    relativeCap,
    firstTotalAssets,
  }: {
    readonly allocation: BigIntish;
    readonly absoluteCap: BigIntish;
    readonly relativeCap: BigIntish;
    readonly firstTotalAssets: BigIntish;
  }): CapacityLimit {
    return VaultV2Utils.allocationHeadroom(
      {
        allocation: BigInt(allocation),
        absoluteCap: BigInt(absoluteCap),
        relativeCap: BigInt(relativeCap),
      },
      firstTotalAssets,
    );
  }
}
