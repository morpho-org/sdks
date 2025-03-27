import type { Address } from "viem";
import { ORACLE_PRICE_SCALE } from "../constants";
import { type IMarket, Market } from "../market";
import { MathLib, SharesMath } from "../math";
import type { BigIntish } from "../types";
import { AccrualPosition, type IAccrualPosition } from "./Position";

export interface IPreLiquidationParams {
  preLltv: BigIntish;
  preLCF1: BigIntish;
  preLCF2: BigIntish;
  preLIF1: BigIntish;
  preLIF2: BigIntish;
  preLiquidationOracle: Address;
}

export class PreLiquidationParams implements IPreLiquidationParams {
  public readonly preLltv: bigint;
  public readonly preLCF1: bigint;
  public readonly preLCF2: bigint;
  public readonly preLIF1: bigint;
  public readonly preLIF2: bigint;
  public readonly preLiquidationOracle;

  constructor({
    preLltv,
    preLCF1,
    preLCF2,
    preLIF1,
    preLIF2,
    preLiquidationOracle,
  }: IPreLiquidationParams) {
    this.preLltv = BigInt(preLltv);
    this.preLCF1 = BigInt(preLCF1);
    this.preLCF2 = BigInt(preLCF2);
    this.preLIF1 = BigInt(preLIF1);
    this.preLIF2 = BigInt(preLIF2);
    this.preLiquidationOracle = preLiquidationOracle;
  }

  public getCloseFactor(quotient: BigIntish) {
    return (
      this.preLCF1 + MathLib.wMulDown(quotient, this.preLCF2 - this.preLCF1)
    );
  }

  public getIncentiveFactor(quotient: BigIntish) {
    return (
      this.preLIF1 + MathLib.wMulDown(quotient, this.preLIF2 - this.preLIF1)
    );
  }
}

export interface IPreLiquidationPosition extends IAccrualPosition {
  /**
   * The pre-liquidation parameters of the associated PreLiquidation contract.
   */
  preLiquidationParams: IPreLiquidationParams;
  /**
   * The address of the PreLiquidation contract this position is associated to.
   */
  preLiquidation: Address;
  /**
   * The price of the collateral quoted in loan assets used by the PreLiquidation contract.
   * `undefined` if the oracle reverts.
   */
  preLiquidationOraclePrice?: BigIntish;
}

export class PreLiquidationPosition
  extends AccrualPosition
  implements IPreLiquidationPosition
{
  public readonly preLiquidationParams: PreLiquidationParams;
  public readonly preLiquidation;
  public readonly preLiquidationOraclePrice?: bigint;

  protected readonly _baseMarket: Market;

  constructor(
    {
      preLiquidationParams,
      preLiquidation,
      preLiquidationOraclePrice,
      ...position
    }: IPreLiquidationPosition,
    market: IMarket,
  ) {
    super(position, {
      ...market,
      params: {
        ...market.params,
        lltv: BigInt(preLiquidationParams.preLltv),
      },
      price:
        preLiquidationOraclePrice != null
          ? BigInt(preLiquidationOraclePrice)
          : undefined,
    });

    this.preLiquidationParams = new PreLiquidationParams(preLiquidationParams);
    this.preLiquidation = preLiquidation;

    if (preLiquidationOraclePrice != null)
      this.preLiquidationOraclePrice = BigInt(preLiquidationOraclePrice);

    this._baseMarket = new Market(market);
  }

  get market() {
    return this._baseMarket;
  }

  protected get _lltv() {
    return this._baseMarket.params.lltv;
  }

  /**
   * @inheritdoc `undefined` if the pre-liquidation's oracle reverts.
   * `undefined` if it may be liquidatable on Morpho.
   */
  get isHealthy() {
    const { collateralValue } = this;
    if (collateralValue == null) return;

    const { borrowAssets } = this;
    if (borrowAssets > MathLib.wMulDown(collateralValue, this._lltv)) return;

    return (
      borrowAssets <=
      MathLib.wMulDown(collateralValue, this.preLiquidationParams.preLltv)
    );
  }

  /**
   * @inheritdoc `undefined` if the pre-liquidation's oracle reverts.
   */
  get isLiquidatable() {
    const { collateralValue } = this;
    if (collateralValue == null) return;

    const { borrowAssets } = this;

    return (
      borrowAssets >
        MathLib.wMulDown(collateralValue, this.preLiquidationParams.preLltv) &&
      borrowAssets <= MathLib.wMulDown(collateralValue, this._lltv)
    );
  }

  /**
   * @inheritdoc `undefined` if the pre-liquidation's oracle reverts.
   */
  get seizableCollateral() {
    if (this._market.price == null) return;

    if (!this.isLiquidatable) return 0n;

    const { ltv } = this;
    if (ltv == null) return;

    const quotient = MathLib.wDivDown(
      ltv - this.preLiquidationParams.preLltv,
      this._lltv - this.preLiquidationParams.preLltv,
    );

    const repayableShares = MathLib.wMulDown(
      this.borrowShares,
      this.preLiquidationParams.getCloseFactor(quotient),
    );

    const repayableAssets = MathLib.wMulDown(
      SharesMath.toAssets(
        repayableShares,
        this._market.totalBorrowAssets,
        this._market.totalBorrowShares,
        "Down",
      ),
      this.preLiquidationParams.getIncentiveFactor(quotient),
    );

    return MathLib.mulDivDown(
      repayableAssets,
      ORACLE_PRICE_SCALE,
      this._market.price,
    );
  }
}
