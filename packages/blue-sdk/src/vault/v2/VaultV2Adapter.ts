import type { Address, Hash, Hex } from "viem";
import type { BigIntish } from "../../types";
import type { CapacityLimit } from "../../utils";

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

  /**
   * Returns the maximum amount of assets that can be deposited to this adapter.
   * @param assets The maximum amount of assets to deposit.
   */
  maxDeposit(data: Hex, assets: BigIntish): CapacityLimit;
  /**
   * Returns the maximum amount of assets that can be withdrawn from this adapter.
   * @param shares The maximum amount of shares to redeem.
   */
  maxWithdraw(data: Hex): CapacityLimit;
}
