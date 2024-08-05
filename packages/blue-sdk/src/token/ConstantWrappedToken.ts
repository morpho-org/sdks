import { MathLib, RoundingDirection } from "../maths";
import { Address } from "../types";

import { InputToken } from "./Token";
import { WrappedToken } from "./WrappedToken";

export class ConstantWrappedToken extends WrappedToken {
  constructor(
    token: InputToken,
    readonly underlying: Address,
    private readonly _underlyingDecimals = 18,
  ) {
    super(token, underlying);
  }

  public override toWrappedExactAmountIn(
    unwrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toWrappedExactAmountIn(unwrappedAmount, 0n, rounding);
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  public toWrappedExactAmountOut(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Up",
  ) {
    return super.toWrappedExactAmountOut(wrappedAmount, 0n, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  public toUnwrappedExactAmountIn(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toUnwrappedExactAmountIn(wrappedAmount, 0n, rounding);
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  public toUnwrappedExactAmountOut(
    unwrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Up",
  ) {
    return super.toUnwrappedExactAmountOut(unwrappedAmount, 0n, rounding);
  }

  protected _wrap(amount: bigint) {
    return MathLib.mulDivDown(
      amount,
      10n ** BigInt(this.decimals),
      10n ** BigInt(this._underlyingDecimals),
    );
  }

  protected _unwrap(amount: bigint) {
    return MathLib.mulDivDown(
      amount,
      10n ** BigInt(this._underlyingDecimals),
      10n ** BigInt(this.decimals),
    );
  }
}
