import { MathLib, type RoundingDirection } from "../math/index.js";
import type { Address } from "../types.js";

import type { IToken } from "./Token.js";
import { WrappedToken } from "./WrappedToken.js";

export class ExchangeRateWrappedToken extends WrappedToken {
  constructor(
    token: IToken,
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
