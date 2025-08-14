import type { RoundingDirection } from "../math/index.js";
import type { Address } from "../types.js";
import type { IVaultConfig } from "../vault/VaultConfig.js";
import { VaultUtils } from "../vault/VaultUtils.js";
import { WrappedToken } from "./WrappedToken.js";

export interface IVaultToken {
  totalAssets: bigint;
  totalSupply: bigint;
}

export class VaultToken extends WrappedToken implements IVaultToken {
  public readonly asset: Address;
  public readonly decimalsOffset: bigint;

  /**
   * The ERC4626 vault's total supply of shares.
   */
  public totalSupply: bigint;

  /**
   * The ERC4626 vault's total assets.
   */
  public totalAssets: bigint;

  constructor(config: IVaultConfig, { totalAssets, totalSupply }: IVaultToken) {
    super(config, config.asset);

    this.asset = config.asset;

    this.totalAssets = totalAssets;
    this.totalSupply = totalSupply;
    this.decimalsOffset = BigInt(config.decimalsOffset);
  }

  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toShares(amount, this, rounding);
  }

  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toAssets(amount, this, rounding);
  }
}
