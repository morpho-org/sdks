import { type IToken, Token } from "../token/Token.js";
import type { Address, BigIntish } from "../types.js";

export interface IVaultConfig extends Omit<IToken, "decimals"> {
  decimalsOffset: BigIntish;
  asset: Address;
}

export class VaultConfig extends Token implements IVaultConfig {
  public readonly decimalsOffset;
  public readonly asset;

  constructor(
    { decimalsOffset, asset, ...config }: IVaultConfig,
    /**
     * @deprecated Kept for backward compatibility.
     */
    public readonly chainId?: number,
  ) {
    super({ ...config, decimals: 18 });

    this.decimalsOffset = BigInt(decimalsOffset);
    this.asset = asset;
  }
}
