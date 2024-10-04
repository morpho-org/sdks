import { MathLib, type RoundingDirection } from "../maths";
import type { Address } from "../types";

import { type InputToken, Token } from "./Token";

export abstract class WrappedToken extends Token {
  constructor(
    token: InputToken,
    public readonly underlying: Address,
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

    return MathLib.wMul(wrappedAmount, MathLib.WAD - slippage, "Down");
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  public toWrappedExactAmountOut(
    wrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Up",
  ) {
    const wAmountTarget = MathLib.wDiv(
      wrappedAmount,
      MathLib.WAD - slippage,
      rounding,
    );

    return this._unwrap(wAmountTarget, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  public toUnwrappedExactAmountIn(
    wrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Down",
  ) {
    const unwrappedAmount = this._unwrap(wrappedAmount, rounding);

    return MathLib.wMul(unwrappedAmount, MathLib.WAD - slippage, "Up");
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  public toUnwrappedExactAmountOut(
    unwrappedAmount: bigint,
    slippage = 0n,
    rounding: RoundingDirection = "Up",
  ) {
    const unwrappedAmountToTarget = MathLib.wDiv(
      unwrappedAmount,
      MathLib.WAD - slippage,
      rounding,
    );

    return this._wrap(unwrappedAmountToTarget, rounding);
  }

  protected abstract _wrap(amount: bigint, rounding: RoundingDirection): bigint;
  protected abstract _unwrap(
    amount: bigint,
    rounding: RoundingDirection,
  ): bigint;
}
