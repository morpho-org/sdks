import { UnknownMarketConfigError } from "../errors.js";
import type { Address, BigIntish, MarketId } from "../types.js";

import { MarketUtils } from "./MarketUtils.js";

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: BigIntish;
}

/**
 * Represents a market's configuration (also called market params).
 */
export class MarketConfig implements MarketParams {
  private static readonly _CACHE: Record<MarketId, MarketConfig> = {};

  /**
   * Returns the previously cached market config for the given id, if any.
   * @throws {UnknownMarketConfigError} If no market config is cached.
   */
  static get(id: MarketId) {
    const marketConfig = MarketConfig._CACHE[id];

    if (!marketConfig) throw new UnknownMarketConfigError(id);

    return marketConfig;
  }

  /**
   * Returns the canonical idle market configuration for the given loan token.
   */
  static idle(token: Address) {
    return new MarketConfig({
      collateralToken: "0x0000000000000000000000000000000000000000",
      loanToken: token,
      oracle: "0x0000000000000000000000000000000000000000",
      irm: "0x0000000000000000000000000000000000000000",
      lltv: 0n,
    });
  }

  /**
   * The market's collateral token address.
   */
  public readonly collateralToken: Address;

  /**
   * The market's loan token address.
   */
  public readonly loanToken: Address;

  /**
   * The market's oracle address.
   */
  public readonly oracle: Address;

  /**
   * The market's interest rate model address.
   */
  public readonly irm: Address;

  /**
   * The market's liquidation Loan-To-Value (scaled by WAD).
   */
  public readonly lltv: bigint;

  /**
   * The market's hex-encoded id, defined as the hash of the market params.
   */
  // Cached because params are readonly.
  public readonly id: MarketId;

  /**
   * The market's liquidation incentive factor.
   */
  // Cached because lltv is readonly.
  public readonly liquidationIncentiveFactor: bigint;

  constructor(params: MarketParams) {
    const { collateralToken, loanToken, oracle, irm, lltv } = params;

    this.collateralToken = collateralToken;
    this.loanToken = loanToken;
    this.oracle = oracle;
    this.irm = irm;
    this.lltv = BigInt(lltv);

    this.id = MarketUtils.getMarketId(params);
    this.liquidationIncentiveFactor =
      MarketUtils.getLiquidationIncentiveFactor(params);

    MarketConfig._CACHE[this.id] = this;
  }
}
