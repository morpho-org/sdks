import type { ChainId } from "../chain.js";
import { UnknownVaultConfigError } from "../errors.js";
import type { Address, BigIntish } from "../types.js";

export interface InputVaultConfig {
  address: Address;
  decimals: BigIntish;
  decimalsOffset: BigIntish;
  symbol: string;
  name: string;
  asset: Address;
}

export class VaultConfig implements InputVaultConfig {
  protected static readonly _CACHE: Record<
    number,
    Record<Address, VaultConfig>
  > = {};

  static get(address: Address, chainId: ChainId) {
    const config = VaultConfig._CACHE[chainId]?.[address];

    if (!config) throw new UnknownVaultConfigError(address);

    return config;
  }

  public readonly address: Address;
  public readonly decimals: number;
  public readonly decimalsOffset: bigint;
  public readonly symbol: string;
  public readonly name: string;
  public readonly asset: Address;

  constructor(
    {
      address,
      decimals,
      decimalsOffset,
      symbol,
      name,
      asset,
    }: InputVaultConfig,
    public readonly chainId?: number,
  ) {
    this.address = address;
    this.decimals = Number(decimals);
    this.decimalsOffset = BigInt(decimalsOffset);
    this.symbol = symbol;
    this.name = name;
    this.asset = asset;

    if (chainId != null) (VaultConfig._CACHE[chainId] ??= {})[address] = this;
  }
}
