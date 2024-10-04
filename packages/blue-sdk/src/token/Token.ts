import { NATIVE_ADDRESS } from "../addresses.js";
import { type ChainId, ChainUtils } from "../chain.js";
import { MathLib, type RoundingDirection } from "../math/index.js";
import type { Address, BigIntish } from "../types.js";

export interface InputToken {
  address: Address;
  decimals: BigIntish;
  symbol: string;
  name?: string;
}

export class Token implements InputToken {
  static native(chainId: ChainId) {
    const currency = ChainUtils.CHAIN_METADATA[chainId].nativeCurrency;

    return new Token({ ...currency, address: NATIVE_ADDRESS });
  }

  /**
   * The token's address.
   */
  public readonly address: Address;

  /**
   * The token's number of decimals.
   */
  public readonly decimals: number;

  /**
   * The token's symbol.
   */
  public readonly symbol: string;

  /**
   * The name of the token (defaults to the symbol).
   */
  public readonly name: string;

  constructor({ address, decimals, symbol, name }: InputToken) {
    this.address = address;
    this.decimals = Number(decimals);
    this.symbol = symbol;
    this.name = name ?? symbol;
  }
}

export class TokenWithPrice extends Token {
  /**
   * Price of the token in USD (scaled by WAD).
   */
  public price?: bigint;

  constructor(token: InputToken, price?: bigint) {
    super(token);

    this.price = price;
  }

  /**
   * Quotes an amount in USD (scaled by WAD) in this token.
   * @param amount The amount of USD to quote.
   */
  fromUsd(amount: bigint, rounding: RoundingDirection = "Down") {
    if (this.price == null) return null;

    return MathLib.mulDiv(
      amount,
      10n ** BigInt(this.decimals),
      this.price,
      rounding,
    );
  }

  /**
   * Quotes an amount of tokens in USD (scaled by WAD).
   * @param amount The amount of tokens to quote.
   */
  toUsd(amount: bigint, rounding: RoundingDirection = "Down") {
    if (this.price == null) return null;

    return MathLib.mulDiv(
      amount,
      this.price,
      10n ** BigInt(this.decimals),
      rounding,
    );
  }
}
