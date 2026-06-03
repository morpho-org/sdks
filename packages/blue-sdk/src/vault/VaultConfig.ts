import { type IToken, Token } from "../token/Token.js";
import type { Address, BigIntish } from "../types.js";

/** Plain input shape for immutable MetaMorpho vault token configuration. */
export interface IVaultConfig extends Omit<IToken, "decimals"> {
  decimalsOffset: BigIntish;
  asset: Address;
}

/** Represents immutable MetaMorpho vault token configuration. */
export class VaultConfig extends Token implements IVaultConfig {
  public readonly decimalsOffset;
  public readonly asset;

  constructor({ decimalsOffset, asset, ...config }: IVaultConfig) {
    super({ ...config, decimals: 18 });

    this.decimalsOffset = BigInt(decimalsOffset);
    this.asset = asset;
  }
}
