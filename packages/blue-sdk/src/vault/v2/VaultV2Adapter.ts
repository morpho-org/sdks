import type { Address, Hash, Hex } from "viem";
import type { BigIntish } from "../../types.js";
import type { CapacityLimit } from "../../utils.js";

/** Plain input shape for a Morpho Vault V2 adapter. */
export interface IVaultV2Adapter {
  type: string;
  address: Address;
  parentVault: Address;
  adapterId: Hash;
  skimRecipient: Address;
}

/** Base class for Morpho Vault V2 adapters. */
export abstract class VaultV2Adapter implements IVaultV2Adapter {
  public readonly type: string;
  public readonly address: Address;
  public readonly parentVault: Address;
  public readonly adapterId: Hash;
  public skimRecipient: Address;

  constructor({
    type,
    address,
    parentVault,
    adapterId,
    skimRecipient,
  }: IVaultV2Adapter) {
    this.type = type;
    this.address = address;
    this.parentVault = parentVault;
    this.adapterId = adapterId;
    this.skimRecipient = skimRecipient;
  }
}

/** Adapter interface with accrued asset and capacity methods. */
export interface IAccrualVaultV2Adapter extends IVaultV2Adapter {
  realAssets(timestamp: BigIntish): bigint;

  /**
   * Returns a new adapter derived from this one, whose underlying market state
   * has been accrued up to the given timestamp. Lets a fully-accrued vault expose
   * an entity graph in which every adapter, market, and position shares one
   * `lastUpdate` instead of pre-accrual state.
   * @param timestamp The timestamp at which to accrue interest. Must be greater
   * than or equal to each underlying market's `lastUpdate`.
   */
  accrueInterest(timestamp?: BigIntish): IAccrualVaultV2Adapter;

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
