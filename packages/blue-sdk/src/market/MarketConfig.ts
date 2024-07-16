import { UnknownMarketConfigError, _try } from "../errors";
import { Address, BigIntish, MarketId } from "../types";

import { MarketUtils } from "./MarketUtils";

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

  constructor({ collateralToken, loanToken, oracle, irm, lltv }: MarketParams) {
    this.collateralToken = collateralToken;
    this.loanToken = loanToken;
    this.oracle = oracle;
    this.irm = irm;
    this.lltv = BigInt(lltv);

    MarketConfig._CACHE[this.id] = this;
  }

  /**
   * The market's hex-encoded id, defined as the hash of the market params.
   */
  get id() {
    return MarketUtils.getMarketId(this);
  }

  /**
   * The market's liquidation incentive factor.
   */
  get liquidationIncentiveFactor() {
    return MarketUtils.getLiquidationIncentiveFactor(this);
  }
}
