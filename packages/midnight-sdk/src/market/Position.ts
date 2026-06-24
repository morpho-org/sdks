import { type BigIntish, MathLib } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type IMarket, Market } from "./Market.js";
import { PositionUtils } from "./PositionUtils.js";

/**
 * Plain input accepted by {@link Position}.
 *
 * @example
 * ```ts
 * import type { IPosition } from "@morpho-org/midnight-sdk";
 *
 * const position: IPosition = {
 *   credit: 0n,
 *   pendingFee: 0n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 0n,
 *   debt: 0n,
 *   collateralBitmap: 0n,
 *   collateral: Array.from({ length: 128 }, () => 0n),
 * };
 * ```
 */
export interface IPosition {
  /** User credit. */
  readonly credit: BigIntish;
  /** Pending continuous fee. */
  readonly pendingFee: BigIntish;
  /** Last loss factor seen by the position. */
  readonly lastLossFactor: BigIntish;
  /** Last accrual timestamp. */
  readonly lastAccrual: BigIntish;
  /** User debt. */
  readonly debt: BigIntish;
  /** Collateral bitmap. */
  readonly collateralBitmap: BigIntish;
  /** Collateral balances by index. */
  readonly collateral: readonly BigIntish[];
}

/**
 * Midnight user position as stored by the core contract.
 *
 * @example
 * ```ts
 * import { Position } from "@morpho-org/midnight-sdk";
 *
 * const position = new Position({
 *   credit: 0n,
 *   pendingFee: 0n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 0n,
 *   debt: 0n,
 *   collateralBitmap: 0n,
 *   collateral: [],
 * });
 * console.log(position.debt);
 * ```
 */
export class Position {
  /** User credit. */
  public readonly credit: bigint;

  /** Pending continuous fee. */
  public readonly pendingFee: bigint;

  /** Last loss factor seen by the position. */
  public readonly lastLossFactor: bigint;

  /** Last accrual timestamp. */
  public readonly lastAccrual: bigint;

  /** User debt. */
  public readonly debt: bigint;

  /** Collateral bitmap. */
  public readonly collateralBitmap: bigint;

  /** Collateral balances by index. */
  public readonly collateral: readonly bigint[];

  public constructor(position: IPosition) {
    this.credit = BigInt(position.credit);
    this.pendingFee = BigInt(position.pendingFee);
    this.lastLossFactor = BigInt(position.lastLossFactor);
    this.lastAccrual = BigInt(position.lastAccrual);
    this.debt = BigInt(position.debt);
    this.collateralBitmap = BigInt(position.collateralBitmap);
    this.collateral = position.collateral.map((assets) => BigInt(assets));
  }

  /**
   * Returns credit net of pending fee, floored to zero for invalid raw inputs.
   *
   * @returns Credit minus pending fee.
   * @example
   * ```ts
   * import { Position } from "@morpho-org/midnight-sdk";
   *
   * const position = new Position({
   *   credit: 1_000n,
   *   pendingFee: 100n,
   *   lastLossFactor: 0n,
   *   lastAccrual: 0n,
   *   debt: 0n,
   *   collateralBitmap: 1n,
   *   collateral: [50n],
   * });
   * console.log(position.faceValue);
   * ```
   */
  public get faceValue() {
    return MathLib.zeroFloorSub(this.credit, this.pendingFee);
  }
}

/**
 * Midnight position paired with its hydrated market.
 *
 * @example
 * ```ts
 * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
 * import { AccrualPosition } from "@morpho-org/midnight-sdk";
 *
 * registerCustomAddresses({
 *   addresses: {
 *     31337: {
 *       morpho: "0x0000000000000000000000000000000000000001",
 *       bundler3: {
 *         bundler3: "0x0000000000000000000000000000000000000002",
 *         generalAdapter1: "0x0000000000000000000000000000000000000003",
 *       },
 *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
 *       midnight: "0x0000000000000000000000000000000000001000",
 *     },
 *   },
 * });
 *
 * const position = new AccrualPosition(
 *   {
 *     credit: 1_000n,
 *     pendingFee: 100n,
 *     lastLossFactor: 0n,
 *     lastAccrual: 1_000n,
 *     debt: 0n,
 *     collateralBitmap: 1n,
 *     collateral: [50n],
 *   },
 *   {
 *     chainId: 31337,
 *     params: {
 *       loanToken: "0x0000000000000000000000000000000000006000",
 *       collateralParams: [
 *         {
 *           token: "0x0000000000000000000000000000000000007000",
 *           lltv: 770000000000000000n,
 *           maxLif: 1061007957559681697n,
 *           oracle: "0x0000000000000000000000000000000000008000",
 *         },
 *       ],
 *       maturity: 54_000n,
 *       rcfThreshold: 0n,
 *       enterGate: "0x0000000000000000000000000000000000000000",
 *       liquidatorGate: "0x0000000000000000000000000000000000000000",
 *     },
 *     totalUnits: 1_000n,
 *     lossFactor: 0n,
 *     withdrawable: 500n,
 *     continuousFeeCredit: 0n,
 *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
 *     continuousFee: 10,
 *     tickSpacing: 4,
 *   },
 * );
 * console.log(position.market.id);
 * ```
 */
export class AccrualPosition extends Position {
  /** Hydrated market for this position. */
  public readonly market: Market;

  public constructor(position: IPosition, market: IMarket) {
    super(position);
    this.market = market instanceof Market ? market : new Market(market);
  }

  /**
   * Returns the position collateral balance at an index configured by the market.
   *
   * @param index - Collateral index.
   * @returns Collateral balance, or undefined when the index is not configured.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const position = new AccrualPosition(
   *   {
   *     credit: 1_000n,
   *     pendingFee: 100n,
   *     lastLossFactor: 0n,
   *     lastAccrual: 1_000n,
   *     debt: 0n,
   *     collateralBitmap: 1n,
   *     collateral: [50n],
   *   },
   *   {
   *     chainId: 31337,
   *     params: {
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: "0x0000000000000000000000000000000000007000",
   *           lltv: 770000000000000000n,
   *           maxLif: 1061007957559681697n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   * );
   * const balance = position.getCollateralBalanceByIndex(0);
   * console.log(balance);
   * ```
   */
  public getCollateralBalanceByIndex(index: BigIntish) {
    const normalizedIndex = BigInt(index);
    if (this.market.getCollateralParamsByIndex(normalizedIndex) == null)
      return undefined;

    return this.collateral[Number(normalizedIndex)] ?? 0n;
  }

  /**
   * Returns the position collateral balance for a configured token.
   *
   * @param token - Collateral token address.
   * @returns Collateral balance, or undefined when the token is not configured.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const position = new AccrualPosition(
   *   {
   *     credit: 1_000n,
   *     pendingFee: 100n,
   *     lastLossFactor: 0n,
   *     lastAccrual: 1_000n,
   *     debt: 0n,
   *     collateralBitmap: 1n,
   *     collateral: [50n],
   *   },
   *   {
   *     chainId: 31337,
   *     params: {
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: collateralToken,
   *           lltv: 770000000000000000n,
   *           maxLif: 1061007957559681697n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   * );
   * const balance = position.getCollateralBalanceByToken(collateralToken);
   * console.log(balance);
   * ```
   */
  public getCollateralBalanceByToken(token: Address) {
    const index = this.market.getCollateralIndexByToken(token);

    return index == null ? undefined : this.getCollateralBalanceByIndex(index);
  }

  /**
   * Returns the market settlement fee at a timestamp.
   *
   * @param timestamp - Timestamp used to compute time to maturity.
   * @returns WAD-scaled settlement fee.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const position = new AccrualPosition(
   *   {
   *     credit: 1_000n,
   *     pendingFee: 100n,
   *     lastLossFactor: 0n,
   *     lastAccrual: 1_000n,
   *     debt: 0n,
   *     collateralBitmap: 1n,
   *     collateral: [50n],
   *   },
   *   {
   *     chainId: 31337,
   *     params: {
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: "0x0000000000000000000000000000000000007000",
   *           lltv: 770000000000000000n,
   *           maxLif: 1061007957559681697n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   * );
   * const fee = position.getSettlementFee(0n);
   * console.log(fee);
   * ```
   */
  public getSettlementFee(timestamp: BigIntish) {
    return this.market.getSettlementFee(this.market.timeToMaturity(timestamp));
  }

  /**
   * Returns a new position locally accrued like Midnight `updatePositionView`.
   *
   * @param timestamp - Timestamp at which to accrue. Must be greater than or equal to `lastAccrual`.
   * @returns New accrual position with updated credit, pending fee, last loss factor, last accrual, and market continuous-fee credit.
   * @throws {InvalidPositionAccrualTimestampError} when timestamp is before `lastAccrual`.
   * @throws {InvalidPositionLossFactorError} when the market loss factor is older than the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when raw inputs violate Midnight accounting invariants.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const position = new AccrualPosition(
   *   {
   *     credit: 1_000n,
   *     pendingFee: 100n,
   *     lastLossFactor: 0n,
   *     lastAccrual: 1_000n,
   *     debt: 0n,
   *     collateralBitmap: 1n,
   *     collateral: [50n],
   *   },
   *   {
   *     chainId: 31337,
   *     params: {
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: "0x0000000000000000000000000000000000007000",
   *           lltv: 770000000000000000n,
   *           maxLif: 1061007957559681697n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   * );
   * const accrued = position.accrueInterest(1_500n);
   * console.log(accrued.credit);
   * ```
   */
  public accrueInterest(timestamp: BigIntish) {
    const { position, market } = PositionUtils.accrueInterest({
      position: this,
      market: this.market,
      timestamp,
    });

    return new AccrualPosition(position, market);
  }
}
