import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import {
  InvalidMarketParamsError,
  UnknownMarketParamsError,
} from "../errors.js";
import type { Address, BigIntish, MarketId } from "../types.js";

import { type Hex, decodeAbiParameters } from "viem";
import { MarketUtils } from "./MarketUtils.js";

export interface IMarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: BigIntish;
}

export type InputMarketParams = Pick<
  MarketParams,
  "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
>;

export const marketParamsAbi = {
  type: "tuple",
  components: [
    { type: "address", name: "loanToken" },
    { type: "address", name: "collateralToken" },
    { type: "address", name: "oracle" },
    { type: "address", name: "irm" },
    { type: "uint256", name: "lltv" },
  ],
} as const;

/**
 * Represents a market's configuration (also called market params).
 */
export class MarketParams implements IMarketParams {
  private static readonly _CACHE: Record<MarketId, MarketParams> = {};

  /**
   * Returns the previously cached market config for the given id, if any.
   * @throws {UnknownMarketParamsError} If no market config is cached.
   */
  static get(id: MarketId) {
    const marketParams = MarketParams._CACHE[id];

    if (!marketParams) throw new UnknownMarketParamsError(id);

    return marketParams;
  }

  /**
   * Returns the canonical idle market configuration for the given loan token.
   */
  static idle(token: Address) {
    return new MarketParams({
      collateralToken: ZERO_ADDRESS,
      loanToken: token,
      oracle: ZERO_ADDRESS,
      irm: ZERO_ADDRESS,
      lltv: 0n,
    });
  }

  static fromHex(data: Hex) {
    try {
      const [marketParams] = decodeAbiParameters([marketParamsAbi], data);

      return new MarketParams(marketParams);
    } catch {
      throw new InvalidMarketParamsError(data);
    }
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
  public readonly id: MarketId; // Cached because params are readonly.

  /**
   * The market's liquidation incentive factor.
   */
  public readonly liquidationIncentiveFactor: bigint; // Cached because lltv is readonly.

  constructor(params: IMarketParams) {
    const { collateralToken, loanToken, oracle, irm, lltv } = params;

    this.collateralToken = collateralToken;
    this.loanToken = loanToken;
    this.oracle = oracle;
    this.irm = irm;
    this.lltv = BigInt(lltv);

    this.id = MarketUtils.getMarketId(params);
    this.liquidationIncentiveFactor =
      MarketUtils.getLiquidationIncentiveFactor(params);

    MarketParams._CACHE[this.id] = this;
  }
}
