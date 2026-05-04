import { MathLib, type RoundingDirection } from "../math/index.js";
import type { Address, BigIntish } from "../types.js";

import type { IToken } from "./Token.js";
import { WrappedToken } from "./WrappedToken.js";

export class ConstantWrappedToken extends WrappedToken {
  public readonly underlyingDecimals;

  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    token: IToken,
    underlying: Address,
    underlyingDecimals: BigIntish = 0,
  ) {
    super(token, underlying);

    this.underlyingDecimals = BigInt(underlyingDecimals);
  }

  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public override toWrappedExactAmountIn(
    unwrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toWrappedExactAmountIn(unwrappedAmount, 0n, rounding);
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public toWrappedExactAmountOut(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Up",
  ) {
    return super.toWrappedExactAmountOut(wrappedAmount, 0n, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public toUnwrappedExactAmountIn(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toUnwrappedExactAmountIn(wrappedAmount, 0n, rounding);
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
      10n ** this.underlyingDecimals,
    );
  }

  protected _unwrap(amount: bigint) {
    return MathLib.mulDivDown(
      amount,
      10n ** this.underlyingDecimals,
      10n ** BigInt(this.decimals),
    );
  }
}
