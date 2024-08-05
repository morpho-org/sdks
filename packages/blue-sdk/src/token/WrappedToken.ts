import { MathLib, RoundingDirection } from "../maths";
import { Address } from "../types";
import {} from "../vault";

import { InputToken, Token } from "./Token";

export abstract class WrappedToken extends Token {
  protected _noSlippage = false;

  constructor(
    token: InputToken,
    readonly underlying: Address,
  ) {
    super(token);
  }

  /** The expected amount when wrapping `unwrappedAmount` */
  public toWrappedExactAmountIn(
    unwrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Down",
  ) {
    const wrappedAmount = this._wrap(unwrappedAmount, rounding);
    if (this._noSlippage) return wrappedAmount;
    return MathLib.wMul(wrappedAmount, MathLib.WAD - slippage, "Down");
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  public toWrappedExactAmountOut(
    wrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Up",
  ) {
    const wAmountTarget = this._noSlippage
      ? wrappedAmount
      : MathLib.wDiv(wrappedAmount, MathLib.WAD - slippage, rounding);

    return this._unwrap(wAmountTarget, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  public toUnwrappedExactAmountIn(
    wrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Down",
  ) {
    const unwrappedAmount = this._unwrap(wrappedAmount, rounding);
    if (this._noSlippage) return unwrappedAmount;
    return MathLib.wMul(unwrappedAmount, MathLib.WAD - slippage, "Up");
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  public toUnwrappedExactAmountOut(
    unwrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Up",
  ) {
    const unwrappedAmountToTarget = this._noSlippage
      ? unwrappedAmount
      : MathLib.wDiv(unwrappedAmount, MathLib.WAD - slippage, rounding);

    return this._wrap(unwrappedAmountToTarget, rounding);
  }

  protected abstract _wrap(amount: bigint, rounding: RoundingDirection): bigint;
  protected abstract _unwrap(
    amount: bigint,
    rounding: RoundingDirection,
  ): bigint;
}
