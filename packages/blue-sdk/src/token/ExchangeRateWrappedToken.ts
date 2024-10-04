import { MathLib, type RoundingDirection } from "../maths";
import type { Address } from "../types";

import type { InputToken } from "./Token";
import { WrappedToken } from "./WrappedToken";

export class ExchangeRateWrappedToken extends WrappedToken {
  constructor(
    token: InputToken,
    readonly underlying: Address,
    public wrappedTokenExchangeRate: bigint,
  ) {
    super(token, underlying);
  }

  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wDiv(amount, this.wrappedTokenExchangeRate, rounding);
  }

  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wMul(amount, this.wrappedTokenExchangeRate, rounding);
  }
}
