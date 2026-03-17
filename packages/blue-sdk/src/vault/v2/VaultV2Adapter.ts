import type { Address, Hash, Hex } from "viem";
import type { BigIntish, MarketId } from "../../types.js";
import type { CapacityLimit, CapacityLimitReason } from "../../utils.js";

export interface MarketDeallocatableData {
  supplyAssets: bigint;
  liquidity: bigint;
}

export interface AdapterDeallocation {
  adapter: Address;
  assets: bigint;
}

export interface ForceWithdrawResult {
  value: bigint;
  limiter: CapacityLimitReason;
  deallocations: AdapterDeallocation[];
}

export interface AdapterDeallocatableResult {
  consumed: Map<MarketId, bigint>;
  total: bigint;
}

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
   * Returns the maximum amount of assets that can be withdrawn from this adapter with the given liquidity data.
   * @param shares The maximum amount of shares to redeem.
   */
  maxWithdraw(data: Hex): CapacityLimit;

  /**
   * Returns per-market supply assets and liquidity available for withdrawal from this adapter.
   * - supplyAssets: the adapter's allocation in that market.
   * - liquidity: the total available liquidity on that market.
   */
  maxDeallocatableAssets(): Map<MarketId, MarketDeallocatableData>;

  /**
   * Computes the actual deallocatable amount given remaining per-market liquidity.
   * Handles adapter-specific withdrawal semantics (e.g., VaultV1 withdraw queue ordering).
   * Returns per-market consumed amounts and the total deallocatable.
   */
  computeActualDeallocatable(
    remainingLiquidity: ReadonlyMap<MarketId, bigint>,
  ): AdapterDeallocatableResult;
}
