import type { RoundingDirection } from "../math/index.js";
import type { InputVaultConfig } from "../vault/VaultConfig.js";
import { VaultUtils } from "../vault/VaultUtils.js";
import { WrappedToken } from "./WrappedToken.js";

export class VaultToken extends WrappedToken {
  public decimalsOffset: bigint;
  public totalAssets: bigint;
  public totalSupply: bigint;

  constructor(
    config: InputVaultConfig,
    { totalAssets, totalSupply }: { totalAssets: bigint; totalSupply: bigint },
  ) {
    super(config, config.asset);

    this.totalAssets = totalAssets;
    this.totalSupply = totalSupply;
    this.decimalsOffset = BigInt(config.decimalsOffset);
  }

  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toShares(amount, this, this, rounding);
  }

  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toAssets(amount, this, this, rounding);
  }
}
