import type { Address, Hex } from "viem";
import type { BigIntish, Hash } from "../../types.js";
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
  /**
   * Returns the adapter's assets after accruing its underlying markets.
   * Markets at or beyond the requested timestamp keep their snapshots without backward accrual.
   * @param timestamp Timestamp through which interest is accrued; past timestamps do not throw.
   * @returns Accrued adapter assets.
   * @throws {UnsupportedMarketIrmError} when forward projection of an underlying market with positive
   *   debt requires an unsupported IRM.
   */
  realAssets(timestamp: BigIntish): bigint;

  /**
   * Returns a new adapter derived from this one, whose underlying market state
   * has been accrued up to the given timestamp. Lets a fully-accrued vault expose
   * an entity graph in which every adapter, market, and position shares one
   * `lastUpdate` instead of pre-accrual state.
   *
   * Optional for backward compatibility: an adapter that does not implement it is
   * left at its pre-accrual state by the vault's `accrueInterest`.
   * @param timestamp The timestamp at which to accrue interest.
   * @returns A new adapter of the same concrete type, with every contributing
   * underlying market accrued to `timestamp`. Built-in implementations may
   * return the adapter unchanged when it contributes no assets, such as when
   * its parent allocation or shares are zero, leaving nested markets at their snapshots.
   * @throws {UnknownMarketAllocationError} when a nested Vault V1 withdraw queue
   * references a market without an allocation.
   * @throws {UnsupportedMarketIrmError} when forward projection of an underlying
   * market with positive debt requires an unsupported IRM.
   * @example
   * ```ts
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   * import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultAddress = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const vault = await fetchAccrualVaultV2(vaultAddress, client);
   * const [adapter] = vault.accrualAdapters;
   * const accrued = adapter?.accrueInterest?.(vault.lastUpdate);
   * // accrued?.realAssets(vault.lastUpdate) reflects state at the shared timestamp
   * ```
   */
  accrueInterest?(timestamp: BigIntish): IAccrualVaultV2Adapter;

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
