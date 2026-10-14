import { MathLib } from "../../math/index.js";
import type { BigIntish } from "../../types.js";
import type { CapacityLimit } from "../../utils.js";
import { CapacityLimitReason } from "../../utils.js";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter.js";
import {
  type IVaultV2MidnightAdapter,
  VaultV2MidnightAdapter,
} from "./VaultV2MidnightAdapter.js";
import {
  type IVaultV2MidnightAdapterAccrualMarket,
  type VaultV2MidnightAdapterAccrualMarket,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";

/** Midnight adapter with time-projected position accrual. */
export interface IAccrualVaultV2MidnightAdapter
  extends Omit<IVaultV2MidnightAdapter, "type">,
    Omit<IAccrualVaultV2Adapter, "type"> {
  /** Adapter type discriminator. */
  readonly type: "VaultV2MidnightAdapter";
  /**
   * Block timestamp in Unix seconds at which `markets` positions and `marketData` were read.
   * `accrueInterest(t)` with `t <= lastUpdate` returns an unchanged copy.
   */
  readonly lastUpdate: BigIntish;
  /** Midnight positions and market loss factors associated with held market ids. */
  readonly markets: readonly VaultV2MidnightAdapterAccrualMarket[];
}

/**
 * Midnight adapter that values and accrues held positions without changing stored market data.
 *
 * @example
 * ```ts
 * import {
 *   AccrualVaultV2MidnightAdapter,
 *   type IVaultV2MidnightAdapter,
 * } from "@morpho-org/blue-sdk";
 *
 * const address = "0x0000000000000000000000000000000000000001";
 * const marketId =
 *   "0x0000000000000000000000000000000000000000000000000000000000000001";
 * const adapter: IVaultV2MidnightAdapter = {
 *   type: "VaultV2MidnightAdapter",
 *   address,
 *   parentVault: address,
 *   asset: address,
 *   skimRecipient: address,
 *   midnight: address,
 *   marketIds: [marketId],
 *   marketData: {
 *     [marketId]: {
 *       netCredit: 1_000n,
 *       rate: 10_000_000_000_000_000n,
 *       maturity: 200n,
 *       index: 0n,
 *       forceSellable: false,
 *     },
 *   },
 *   durations: [],
 *   durationAllocations: [],
 *   maxTtm: 0n,
 *   minRate: 0n,
 *   noSalesWithShortfall: false,
 *   noSalesBelowFaceValue: false,
 * };
 * const midnightAdapter = new AccrualVaultV2MidnightAdapter({
 *   adapter,
 *   markets: [
 *     {
 *       id: marketId,
 *       position: {
 *         credit: 1_000n,
 *         pendingFee: 0n,
 *         lastLossFactor: 0n,
 *         lastAccrual: 100n,
 *       },
 *       market: { lossFactor: 0n },
 *     },
 *   ],
 *   lastUpdate: 100n,
 * });
 * const assets = midnightAdapter.realAssets(100n);
 * // assets is 500n
 * ```
 */
export class AccrualVaultV2MidnightAdapter
  extends VaultV2MidnightAdapter
  implements IAccrualVaultV2MidnightAdapter
{
  /**
   * Block timestamp in Unix seconds at which `markets` positions and `marketData` were read.
   * `accrueInterest(t)` with `t <= lastUpdate` returns an unchanged copy.
   */
  public readonly lastUpdate: bigint;

  /** Normalized Midnight positions and market loss factors associated with held market ids. */
  public readonly markets: readonly VaultV2MidnightAdapterAccrualMarket[];

  /**
   * Creates a Midnight adapter with normalized market positions.
   *
   * @param adapter - Midnight adapter state, including held market ids and stored market data.
   * @param markets - One position and loss-factor snapshot for each held market id.
   * @param lastUpdate - Block timestamp in Unix seconds at which `markets` positions and `marketData` were read.
   * @throws {InvalidVaultV2MidnightAdapterMarketsError} when market ids, market data, and positions do not correspond one-to-one.
   */
  constructor({
    adapter,
    markets,
    lastUpdate,
  }: {
    readonly adapter: IVaultV2MidnightAdapter;
    readonly markets: readonly IVaultV2MidnightAdapterAccrualMarket[];
    readonly lastUpdate: BigIntish;
  }) {
    super(adapter);
    // Validate market id correspondence before normalizing positions.
    VaultV2MidnightAdapterUtils.validateMarkets(this, markets);
    this.markets = markets.map((market) => ({
      id: market.id,
      position: {
        credit: BigInt(market.position.credit),
        pendingFee: BigInt(market.position.pendingFee),
        lastLossFactor: BigInt(market.position.lastLossFactor),
        lastAccrual: BigInt(market.position.lastAccrual),
      },
      market: { lossFactor: BigInt(market.market.lossFactor) },
    }));
    this.lastUpdate = BigInt(lastUpdate);
  }

  /**
   * Values each held market's loss-adjusted net credit with hyperbolic discounting before maturity.
   * At or after maturity, a market is valued at face value. Stored market data is not projected.
   *
   * @param timestamp - Valuation timestamp in Unix seconds.
   * @returns Total discounted Midnight net credit in loan-asset units.
   * @throws {InvalidPositionLossFactorError} when a market loss factor is below the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when Midnight position accrual inputs violate accounting invariants.
   * @example
   * ```ts
   * import {
   *   AccrualVaultV2MidnightAdapter,
   *   type IVaultV2MidnightAdapter,
   * } from "@morpho-org/blue-sdk";
   *
   * const address = "0x0000000000000000000000000000000000000001";
   * const marketId =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const adapter: IVaultV2MidnightAdapter = {
   *   type: "VaultV2MidnightAdapter",
   *   address,
   *   parentVault: address,
   *   asset: address,
   *   skimRecipient: address,
   *   midnight: address,
   *   marketIds: [marketId],
   *   marketData: {
   *     [marketId]: {
   *       netCredit: 1_000n,
   *       rate: 10_000_000_000_000_000n,
   *       maturity: 200n,
   *       index: 0n,
   *       forceSellable: false,
   *     },
   *   },
   *   durations: [],
   *   durationAllocations: [],
   *   maxTtm: 0n,
   *   minRate: 0n,
   *   noSalesWithShortfall: false,
   *   noSalesBelowFaceValue: false,
   * };
   * const midnightAdapter = new AccrualVaultV2MidnightAdapter({
   *   adapter,
   *   markets: [
   *     {
   *       id: marketId,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 0n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   lastUpdate: 100n,
   * });
   * const assets = midnightAdapter.realAssets(100n);
   * // assets is 500n
   * ```
   */
  public realAssets(timestamp: BigIntish): bigint {
    return VaultV2MidnightAdapterUtils.realAssets(
      this,
      this.markets,
      timestamp,
    );
  }

  /**
   * Projects loss and continuous fees through a timestamp without rewriting stored market-data net credit.
   * At or before `lastUpdate`, returns an unchanged adapter copy.
   *
   * @param timestamp - Accrual timestamp in Unix seconds.
   * @returns A new adapter with projected positions and unchanged stored market data.
   * @throws {InvalidPositionLossFactorError} when a market loss factor is below the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when Midnight position accrual inputs violate accounting invariants.
   * @example
   * ```ts
   * import {
   *   AccrualVaultV2MidnightAdapter,
   *   type IVaultV2MidnightAdapter,
   * } from "@morpho-org/blue-sdk";
   *
   * const address = "0x0000000000000000000000000000000000000001";
   * const marketId =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const adapter: IVaultV2MidnightAdapter = {
   *   type: "VaultV2MidnightAdapter",
   *   address,
   *   parentVault: address,
   *   asset: address,
   *   skimRecipient: address,
   *   midnight: address,
   *   marketIds: [marketId],
   *   marketData: {
   *     [marketId]: {
   *       netCredit: 1_000n,
   *       rate: 10_000_000_000_000_000n,
   *       maturity: 200n,
   *       index: 0n,
   *       forceSellable: false,
   *     },
   *   },
   *   durations: [],
   *   durationAllocations: [],
   *   maxTtm: 0n,
   *   minRate: 0n,
   *   noSalesWithShortfall: false,
   *   noSalesBelowFaceValue: false,
   * };
   * const midnightAdapter = new AccrualVaultV2MidnightAdapter({
   *   adapter,
   *   markets: [
   *     {
   *       id: marketId,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 100n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   lastUpdate: 100n,
   * });
   * const accrued = midnightAdapter.accrueInterest(150n);
   * // accrued.markets[0]?.position.lastAccrual is 150n
   * ```
   */
  public accrueInterest(timestamp: BigIntish): AccrualVaultV2MidnightAdapter {
    const requested = BigInt(timestamp);
    const markets =
      requested <= this.lastUpdate
        ? this.markets
        : VaultV2MidnightAdapterUtils.accrueMarkets(
            this,
            this.markets,
            requested,
          );
    return new AccrualVaultV2MidnightAdapter({
      adapter: this,
      markets,
      lastUpdate: MathLib.max(requested, this.lastUpdate),
    });
  }

  /**
   * Returns zero because Midnight is `SelfAllocationOnly`.
   *
   * @param _data - Unused adapter liquidity data.
   * @param _assets - Unused requested asset amount.
   * @returns Zero capacity limited by the Midnight adapter.
   * @example
   * ```ts
   * import {
   *   AccrualVaultV2MidnightAdapter,
   *   CapacityLimitReason,
   * } from "@morpho-org/blue-sdk";
   *
   * const address = "0x0000000000000000000000000000000000000001";
   * const marketId =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const adapter = new AccrualVaultV2MidnightAdapter({
   *   adapter: {
   *     type: "VaultV2MidnightAdapter",
   *     address,
   *     parentVault: address,
   *     asset: address,
   *     skimRecipient: address,
   *     midnight: address,
   *     marketIds: [marketId],
   *     marketData: {
   *       [marketId]: {
   *         netCredit: 1_000n,
   *         rate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *       },
   *     },
   *     durations: [],
   *     durationAllocations: [],
   *     maxTtm: 0n,
   *     minRate: 0n,
   *     noSalesWithShortfall: false,
   *     noSalesBelowFaceValue: false,
   *   },
   *   markets: [
   *     {
   *       id: marketId,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 0n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   lastUpdate: 100n,
   * });
   * const limit = adapter.maxDeposit("0x", 100n);
   * // limit is { value: 0n, limiter: CapacityLimitReason.midnightSelfAllocation }
   * ```
   */
  public maxDeposit(
    _data: Parameters<IAccrualVaultV2Adapter["maxDeposit"]>[0],
    _assets: BigIntish,
  ): CapacityLimit {
    return { value: 0n, limiter: CapacityLimitReason.midnightSelfAllocation };
  }

  /**
   * Returns zero because Midnight is `SelfAllocationOnly`.
   *
   * @param _data - Unused adapter liquidity data.
   * @returns Zero capacity limited by the Midnight adapter.
   * @example
   * ```ts
   * import {
   *   AccrualVaultV2MidnightAdapter,
   *   CapacityLimitReason,
   * } from "@morpho-org/blue-sdk";
   *
   * const address = "0x0000000000000000000000000000000000000001";
   * const marketId =
   *   "0x0000000000000000000000000000000000000000000000000000000000000001";
   * const adapter = new AccrualVaultV2MidnightAdapter({
   *   adapter: {
   *     type: "VaultV2MidnightAdapter",
   *     address,
   *     parentVault: address,
   *     asset: address,
   *     skimRecipient: address,
   *     midnight: address,
   *     marketIds: [marketId],
   *     marketData: {
   *       [marketId]: {
   *         netCredit: 1_000n,
   *         rate: 10_000_000_000_000_000n,
   *         maturity: 200n,
   *         index: 0n,
   *         forceSellable: false,
   *       },
   *     },
   *     durations: [],
   *     durationAllocations: [],
   *     maxTtm: 0n,
   *     minRate: 0n,
   *     noSalesWithShortfall: false,
   *     noSalesBelowFaceValue: false,
   *   },
   *   markets: [
   *     {
   *       id: marketId,
   *       position: {
   *         credit: 1_000n,
   *         pendingFee: 0n,
   *         lastLossFactor: 0n,
   *         lastAccrual: 100n,
   *       },
   *       market: { lossFactor: 0n },
   *     },
   *   ],
   *   lastUpdate: 100n,
   * });
   * const limit = adapter.maxWithdraw("0x");
   * // limit is { value: 0n, limiter: CapacityLimitReason.midnightSelfAllocation }
   * ```
   */
  public maxWithdraw(
    _data: Parameters<IAccrualVaultV2Adapter["maxWithdraw"]>[0],
  ): CapacityLimit {
    return { value: 0n, limiter: CapacityLimitReason.midnightSelfAllocation };
  }
}
