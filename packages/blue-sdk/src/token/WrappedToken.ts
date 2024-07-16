import { MathLib, RoundingDirection } from "../maths";
import { Address } from "../types";
import { Vault, VaultConfig, VaultUtils } from "../vault";

import { InputToken, Token } from "./Token";

export abstract class WrappedToken extends Token {
  protected abstract _wrap(amount: bigint, rounding: RoundingDirection): bigint;
  protected abstract _unwrap(amount: bigint, rounding: RoundingDirection): bigint;

  protected _noSlippage = false;

  constructor(token: InputToken, readonly underlying: Address) {
    super(token);
  }

  /** The expected amount when wrapping `unwrappedAmount` */
  toWrappedExactAmountIn(unwrappedAmount: bigint, slippage = 0n, rounding: RoundingDirection = "Down") {
    const wrappedAmount = this._wrap(unwrappedAmount, rounding);
    if (this._noSlippage) return wrappedAmount;
    return MathLib.wMul(wrappedAmount, MathLib.WAD - slippage, "Down");
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  toWrappedExactAmountOut(wrappedAmount: bigint, slippage = 0n, rounding: RoundingDirection = "Up") {
    const wAmountTarget = this._noSlippage
      ? wrappedAmount
      : MathLib.wDiv(wrappedAmount, MathLib.WAD - slippage, rounding);
    return this._unwrap(wAmountTarget, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  toUnwrappedExactAmountIn(wrappedAmount: bigint, slippage = 0n, rounding: RoundingDirection = "Down") {
    const unwrappedAmount = this._unwrap(wrappedAmount, rounding);
    if (this._noSlippage) return unwrappedAmount;
    return MathLib.wMul(unwrappedAmount, MathLib.WAD - slippage, "Up");
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  toUnwrappedExactAmountOut(unwrappedAmount: bigint, slippage = 0n, rounding: RoundingDirection = "Up") {
    const unwrappedAmountToTarget = this._noSlippage
      ? unwrappedAmount
      : MathLib.wDiv(unwrappedAmount, MathLib.WAD - slippage, rounding);
    return this._wrap(unwrappedAmountToTarget, rounding);
  }
}

export class ConstantWrappedToken extends WrappedToken {
  protected _noSlippage = true;

  constructor(token: InputToken, readonly underlying: Address, private readonly _underlyingDecimals = 18) {
    super(token, underlying);
  }

  protected _wrap(amount: bigint) {
    return MathLib.mulDivDown(amount, 10n ** BigInt(this.decimals), 10n ** BigInt(this._underlyingDecimals));
  }

  protected _unwrap(amount: bigint) {
    return MathLib.mulDivDown(amount, 10n ** BigInt(this._underlyingDecimals), 10n ** BigInt(this.decimals));
  }
}

export class ExchangeRateWrappedToken extends WrappedToken {
  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wDiv(amount, this.wrappedTokenExchangeRate, rounding);
  }
  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wMul(amount, this.wrappedTokenExchangeRate, rounding);
  }

  constructor(token: InputToken, readonly underlying: Address, public wrappedTokenExchangeRate: bigint) {
    super(token, underlying);
  }
}

export class VaultToken extends WrappedToken {
  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toShares(amount, this, this.config, rounding);
  }
  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toAssets(amount, this, this.config, rounding);
  }

  public totalAssets: bigint;
  public totalSupply: bigint;
  public config: VaultConfig;

  constructor(
    token: InputToken,
    { totalAssets, totalSupply, config }: Pick<Vault, "totalAssets" | "totalSupply" | "config">
  ) {
    super(token, config.asset);
    this.totalAssets = totalAssets;
    this.totalSupply = totalSupply;
    this.config = config;
  }
}
