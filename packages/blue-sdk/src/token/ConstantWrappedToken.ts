import { MathLib } from "../maths";
import { Address } from "../types";

import { InputToken } from "./Token";
import { WrappedToken } from "./WrappedToken";

export class ConstantWrappedToken extends WrappedToken {
  protected _noSlippage = true;

  constructor(
    token: InputToken,
    readonly underlying: Address,
    private readonly _underlyingDecimals = 18,
  ) {
    super(token, underlying);
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
