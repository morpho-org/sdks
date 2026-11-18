import { MidnightMarketLib, MidnightPositionLib } from "@morpho-org/morpho-ts";
import {
  midnightCollateralParamsAbi,
  midnightMarketAbi,
} from "@morpho-org/morpho-ts/abis/midnight";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  isAddressEqual,
} from "viem";
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
 * Midnight `Market` fields read by the adapter's `ids()`, plus `maturity` and `enterGate` (not used by cap ids).
 * Structurally compatible with midnight-sdk's `IMarketParams` (pass `market.params`).
 */
export interface IVaultV2MidnightAdapterMarket {
  /** Market collateral definitions; they are part of the family cap id and each yields a collateral-token cap id. */
  readonly collateralParams: readonly IVaultV2MidnightAdapterCollateralParams[];
  /** Market maturity as a Unix timestamp in seconds; not used by cap ids. */
  readonly maturity: BigIntish;
  /** Recovery close factor threshold in loan-token units, part of the family cap id: the RCF is deactivated when a liquidation could leave collateral worth less than this amount. */
  readonly rcfThreshold: BigIntish;
  /** Entry gate address (zero address when ungated); not used by cap ids. */
  readonly enterGate: Address;
  /** Liquidator gate address (zero address when ungated), part of the family cap id. */
  readonly liquidatorGate: Address;
}

/** Plain input shape for Midnight adapter market data, normalized into {@link VaultV2MidnightAdapterMarketData}. */
export interface IVaultV2MidnightAdapterMarketData {
  /** Stored net credit in asset units, updated on buy, sell and forceDeallocate and used by duration caps; not the live value. */
  readonly netCredit: BigIntish;
  /** WAD-scaled simple interest rate per second earned on the net credit, so net of Midnight fees. */
  readonly netRate: BigIntish;
  /** Market maturity as a Unix timestamp in seconds. */
  readonly maturity: BigIntish;
  /** Position of the market in the adapter's `marketIds` array (swap-and-pop on removal). */
  readonly index: BigIntish;
  /** Whether the market can be sold at a loss down to `minForceSellPrice`, also after maturity; sales then don't lower `netRate` and buying is blocked. */
  readonly forceSellable: boolean;
  /** Whether the curator permanently removed the market; buys, sales, withdrawals and in-kind redemptions in it then revert. */
  readonly forceRemoved: boolean;
  /** WAD-scaled minimum assets received per unit of sold net credit (WAD = face value) while `forceSellable`. */
  readonly minForceSellPrice: BigIntish;
}

/** Normalized Midnight adapter market data. */
export interface VaultV2MidnightAdapterMarketData {
  /** Stored net credit in asset units, updated on buy, sell and forceDeallocate and used by duration caps; not the live value. */
  readonly netCredit: bigint;
  /** WAD-scaled simple interest rate per second earned on the net credit, so net of Midnight fees. */
  readonly netRate: bigint;
  /** Market maturity as a Unix timestamp in seconds. */
  readonly maturity: bigint;
  /** Position of the market in the adapter's `marketIds` array (swap-and-pop on removal). */
  readonly index: bigint;
  /** Whether the market can be sold at a loss down to `minForceSellPrice`, also after maturity; sales then don't lower `netRate` and buying is blocked. */
  readonly forceSellable: boolean;
  /** Whether the curator permanently removed the market; buys, sales, withdrawals and in-kind redemptions in it then revert. */
  readonly forceRemoved: boolean;
  /** WAD-scaled minimum assets received per unit of sold net credit (WAD = face value) while `forceSellable`. */
  readonly minForceSellPrice: bigint;
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
  /** Midnight market liquidity available to lender withdrawals, in loan-asset units. Defaults to zero. */
  readonly withdrawable?: BigIntish;
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
    /** Midnight market liquidity available to lender withdrawals, in loan-asset units. */
    readonly withdrawable: bigint;
  };
}

/** Midnight market struct accepted by `IdLib.toId` and encoded as Midnight adapter liquidity data. */
export interface IVaultV2MidnightAdapterMidnightMarket
  extends IVaultV2MidnightAdapterMarket {
  /** Chain id the market is bound to. */
  readonly chainId: BigIntish;
  /** Midnight core address. */
  readonly midnight: Address;
  /** Market loan token, which must be the adapter asset. */
  readonly loanToken: Address;
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
   *         netRate: 0n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *         forceRemoved: false,
   *         minForceSellPrice: 0n,
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
   * Values held Midnight markets using a hyperbolic discount until maturity,
   * mirroring `MidnightAdapter.realAssets`: each market contributes
   * `floor(netCredit * WAD / (WAD + netRate * ttm))`, where `netCredit` is the
   * stored `marketData.netCredit` when the market's loss factor is zero and the
   * position's live net credit (after slashing and pending fees) otherwise.
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
   *         netRate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *         forceRemoved: false,
   *         minForceSellPrice: 0n,
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
      // validateMarkets guarantees a position and market data for every held id.
      const market = marketsById.get(id)!;
      const marketData = adapter.marketData[id]!;
      const netCredit =
        BigInt(market.market.lossFactor) === 0n
          ? BigInt(marketData.netCredit)
          : MidnightPositionLib.netCredit({
              ...market.position,
              marketLossFactor: market.market.lossFactor,
              maturity: marketData.maturity,
              timestamp: MathLib.max(
                requested,
                BigInt(market.position.lastAccrual),
              ),
            });
      const denominator =
        MathLib.WAD +
        BigInt(marketData.netRate) *
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
   *         netRate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *         forceRemoved: false,
   *         minForceSellPrice: 0n,
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
      // validateMarkets guarantees market data for every position id.
      const marketData = adapter.marketData[market.id]!;
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
        market: {
          lossFactor,
          withdrawable: BigInt(market.market.withdrawable ?? 0n),
        },
      };
    });
  }

  /**
   * Computes the Midnight market id of a market struct, matching Midnight's `IdLib.toId`.
   *
   * @param market - Midnight market struct.
   * @returns The CREATE2-derived Midnight market id.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.marketId({
   *   chainId: 8453n,
   *   midnight: "0x0000000000000000000000000000000000000001",
   *   loanToken: "0x0000000000000000000000000000000000000002",
   *   collateralParams: [],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * ```
   */
  export function marketId(
    market: IVaultV2MidnightAdapterMidnightMarket,
  ): Hash {
    return MidnightMarketLib.id(
      market.midnight,
      encodeAbiParameters(
        [midnightMarketAbi],
        [
          {
            ...market,
            collateralParams: market.collateralParams.map((params) => ({
              ...params,
              lltv: BigInt(params.lltv),
              liquidationCursor: BigInt(params.liquidationCursor),
            })),
            chainId: BigInt(market.chainId),
            maturity: BigInt(market.maturity),
            rcfThreshold: BigInt(market.rcfThreshold),
          },
        ],
      ),
    );
  }

  /**
   * Returns how much a vault withdrawal can deallocate through the adapter's `withdrawToVault` path.
   *
   * Mirrors the frozen adapter's non-forced `deallocate`: `data` must decode as a held Midnight
   * market whose loan token is the adapter asset and that is not force-removed. The amount is
   * bounded by the adapter's credit accrued to `lastUpdate` and the market's withdrawable liquidity. A liquidation
   * in progress also reverts onchain but is transient and not modeled.
   *
   * @param adapter - Adapter asset, stored market data, snapshot timestamp and per-market position and market state.
   * @param data - Vault liquidity data, expected to be an ABI-encoded Midnight market.
   * @returns The withdrawable amount, or zero when the call would revert.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const limit = VaultV2MidnightAdapterUtils.maxWithdraw(
   *   {
   *     asset: "0x0000000000000000000000000000000000000002",
   *     marketData: {},
   *     lastUpdate: 0n,
   *     markets: [],
   *   },
   *   "0x",
   * );
   * // limit is 0n
   * ```
   */
  export function maxWithdraw(
    adapter: {
      readonly asset: Address;
      readonly marketData: Readonly<
        Record<Hash, IVaultV2MidnightAdapterMarketData>
      >;
      readonly lastUpdate: BigIntish;
      readonly markets: readonly VaultV2MidnightAdapterAccrualMarket[];
    },
    data: Hex,
  ): bigint {
    let market: IVaultV2MidnightAdapterMidnightMarket;
    try {
      [market] = decodeAbiParameters([midnightMarketAbi], data);
    } catch {
      // Onchain `abi.decode` reverts on malformed data.
      return 0n;
    }
    if (!isAddressEqual(market.loanToken, adapter.asset)) return 0n;
    const id = marketId(market);
    if (adapter.marketData[id]?.forceRemoved !== false) return 0n;
    const held = adapter.markets.find((entry) => entry.id === id);
    if (held === undefined) return 0n;
    // Midnight.withdraw runs `_updatePosition` first, so cap by credit net of continuous fees accrued since `lastAccrual`.
    const { credit } = MidnightPositionLib.accrue({
      ...held.position,
      marketLossFactor: held.market.lossFactor,
      maturity: adapter.marketData[id].maturity,
      timestamp: MathLib.max(
        BigInt(adapter.lastUpdate),
        held.position.lastAccrual,
      ),
    });
    return MathLib.min(credit, held.market.withdrawable);
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
   * Returns the market-family allocation-cap id: the market configuration
   * without its maturity and enter gate, so markets differing only by those
   * share caps.
   *
   * @param market - Midnight market fields used by the family id.
   * @returns The family allocation-cap id, `keccak256(abi.encode("family", collateralParams, rcfThreshold, liquidatorGate))`.
   * @throws {viem.InvalidAddressError} when a token, oracle, or the liquidator gate is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when an integer field is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapterUtils.familyCapId({
   *   collateralParams: [
   *     {
   *       token: "0x0000000000000000000000000000000000000001",
   *       lltv: 860000000000000000n,
   *       liquidationCursor: 800000000000000000n,
   *       oracle: "0x0000000000000000000000000000000000000002",
   *     },
   *   ],
   *   rcfThreshold: 0n,
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * ```
   */
  export function familyCapId(
    market: Pick<
      IVaultV2MidnightAdapterMarket,
      "collateralParams" | "rcfThreshold" | "liquidatorGate"
    >,
  ): Hash {
    return VaultV2Utils.capId({
      tag: "family",
      params: [
        {
          type: "tuple[]",
          components: midnightCollateralParamsAbi.components,
        },
        { type: "uint256" },
        { type: "address" },
      ],
      values: [
        market.collateralParams.map((params) => ({
          token: params.token,
          lltv: BigInt(params.lltv),
          liquidationCursor: BigInt(params.liquidationCursor),
          oracle: params.oracle,
        })),
        BigInt(market.rcfThreshold),
        market.liquidatorGate,
      ],
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
      tag: "this/duration",
      params: [{ type: "address" }, { type: "uint256" }],
      values: [adapter, BigInt(duration)],
    });
  }

  /**
   * Returns the allocation-cap ids of a Midnight market, in contract order:
   * adapter id, family id, then the collateral-token id of each collateral.
   * Maturity and enter gate are not part of any id.
   *
   * @param params.adapterId - Adapter allocation-cap id.
   * @param params.market - Midnight market fields used by the adapter.
   * @returns The market's `2 + collateralParams.length` allocation-cap ids.
   * @throws {viem.InvalidAddressError} when the liquidator gate, a token, or an oracle is not a valid address.
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
      familyCapId(market),
      ...market.collateralParams.map((params) =>
        collateralTokenCapId(params.token),
      ),
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
