import type { Address, Hash } from "viem";
import type { BigIntish } from "../../types";

export interface IVaultV2Adapter {
  address: Address;
  parentVault: Address;
  adapterId: Hash;
  skimRecipient: Address;
}

export abstract class VaultV2Adapter implements IVaultV2Adapter {
  public readonly address: Address;
  public readonly parentVault: Address;
  public readonly adapterId: Hash;
  public skimRecipient: Address;

  constructor({
    address,
    parentVault,
    adapterId,
    skimRecipient,
  }: IVaultV2Adapter) {
    this.address = address;
    this.parentVault = parentVault;
    this.adapterId = adapterId;
    this.skimRecipient = skimRecipient;
  }
}

export interface IAccrualVaultV2Adapter extends IVaultV2Adapter {
  realAssets(timestamp: BigIntish): bigint;
}
