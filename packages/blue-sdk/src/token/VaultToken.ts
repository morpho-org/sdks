import { RoundingDirection } from "../maths";
import { InputVaultConfig, Vault, VaultUtils } from "../vault";
import { WrappedToken } from "./WrappedToken";

export class VaultToken extends WrappedToken {
  public decimalsOffset: bigint;
  public totalAssets: bigint;
  public totalSupply: bigint;

  constructor(
    config: InputVaultConfig,
    { totalAssets, totalSupply }: Pick<Vault, "totalAssets" | "totalSupply">,
  ) {
    super(config, config.asset);

    this.totalAssets = totalAssets;
    this.totalSupply = totalSupply;
    this.decimalsOffset = config.decimalsOffset;
  }

  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toShares(amount, this, this, rounding);
  }

  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
    return VaultUtils.toAssets(amount, this, this, rounding);
  }
}
