import type { Address } from "viem";
import type { BigIntish } from "../types";

export interface IVaultV2Adapter {
  address: Address;
  factory: Address;
  parentVault: Address;
  adapterId: string;
  skimRecipient: Address;
}

export abstract class VaultV2Adapter implements IVaultV2Adapter {
  public address: Address;
  public factory: Address;
  public parentVault: Address;
  public adapterId: string;
  public skimRecipient: Address;

  constructor({
    address,
    factory,
    parentVault,
    adapterId,
    skimRecipient,
  }: IVaultV2Adapter) {
    this.address = address;
    this.factory = factory;
    this.parentVault = parentVault;
    this.adapterId = adapterId;
    this.skimRecipient = skimRecipient;
  }
}

export interface IAccrualVaultV2Adapter extends IVaultV2Adapter {
  realAssets(timestamp: BigIntish): bigint;
}
