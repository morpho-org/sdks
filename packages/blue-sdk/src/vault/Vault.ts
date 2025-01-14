import { type CapacityLimit, CapacityLimitReason } from "../market/index.js";
import { MathLib, type RoundingDirection } from "../math/index.js";
import { VaultToken } from "../token/index.js";
import type { Address, BigIntish, MarketId } from "../types.js";

import type { IVaultConfig } from "./VaultConfig.js";
import {
  type IVaultMarketAllocation,
  VaultMarketAllocation,
} from "./VaultMarketAllocation.js";

export interface Pending<T> {
  value: T;
  validAt: bigint;
}

export interface VaultPublicAllocatorConfig {
  /**
   * The PublicAllocator's admin address.
   */
  admin: Address;
  /**
   * The PublicAllocator's reallocation fee (in native token).
   */
  fee: bigint;
  /**
   * The PublicAllocator's reallocation fee accrued so far (in native token).
   */
  accruedFee: bigint;
}

export interface IVault extends IVaultConfig {
  curator: Address;
  owner: Address;
  guardian: Address;
  fee: bigint;
  feeRecipient: Address;
  skimRecipient: Address;
  pendingTimelock: Pending<bigint>;
  pendingGuardian: Pending<Address>;
  pendingOwner: Address;
  timelock: bigint; // seconds
  supplyQueue: MarketId[];
  withdrawQueue: MarketId[];
  totalSupply: bigint;
  totalAssets: bigint;
  lastTotalAssets: bigint;
  lostAssets?: bigint;
  publicAllocatorConfig?: VaultPublicAllocatorConfig;
}

export class Vault extends VaultToken implements IVault {
  /**
   * The vault's share token's name.
   */
  public declare readonly name: string;

  /**
   * The vault's share token's symbol.
   */
  public declare readonly symbol: string;

  /**
   * The MetaMorpho vault's owner address.
   */
  public owner: Address;
  /**
   * The MetaMorpho vault's curator address.
   */
  public curator: Address;
  /**
   * The MetaMorpho vault's guardian address.
   */
  public guardian: Address;
  /**
   * The MetaMorpho vault's skim recipient address (mostly used to skim reward tokens claimed to the vault).
   */
  public skimRecipient: Address;
  /**
   * The MetaMorpho vault's fee recipient address.
   */
  public feeRecipient: Address;

  /**
   * The MetaMorpho vault's timelock (in seconds).
   */
  public timelock: bigint;
  /**
   * The MetaMorpho vault's fee.
   */
  public fee: bigint;

  /**
   * The MetaMorpho vault's pending owner address and activation timestamp.
   */
  public pendingOwner: Address;
  /**
   * The MetaMorpho vault's pending guardian address and activation timestamp.
   */
  public pendingGuardian: Pending<Address>;
  /**
   * The MetaMorpho vault's pending timelock (in seconds) and activation timestamp.
   */
  public pendingTimelock: Pending<bigint>;

  /**
   * The MetaMorpho vault's ordered supply queue.
   */
  public supplyQueue: MarketId[];
  /**
   * The MetaMorpho vault's ordered withdraw queue.
   */
  public withdrawQueue: MarketId[];

  /**
   * The MetaMorpho vault's last total assets used to calculate performance fees.
   */
  public lastTotalAssets: bigint;

  /**
   * The MetaMorpho vault's lost assets due to realized bad debt.
   * Only defined for MetaMorpho V1.1 vaults.
   */
  public lostAssets?: bigint;

  /**
   * The MetaMorpho vault's public allocator configuration.
   */
  public publicAllocatorConfig?: VaultPublicAllocatorConfig;

  constructor({
    curator,
    owner,
    guardian,
    publicAllocatorConfig,
    fee,
    feeRecipient,
    skimRecipient,
    pendingTimelock,
    pendingGuardian,
    pendingOwner,
    timelock,
    supplyQueue,
    withdrawQueue,
    totalSupply,
    totalAssets,
    lastTotalAssets,
    lostAssets,
    ...config
  }: IVault) {
    super(config, { totalAssets, totalSupply });

    this.curator = curator;
    this.owner = owner;
    this.guardian = guardian;
    this.fee = fee;
    this.feeRecipient = feeRecipient;
    this.skimRecipient = skimRecipient;
    this.pendingTimelock = {
      value: pendingTimelock.value,
      validAt: pendingTimelock.validAt,
    };
    this.pendingGuardian = pendingGuardian;
    this.pendingOwner = pendingOwner;
    this.timelock = timelock;
    this.supplyQueue = supplyQueue;
    this.withdrawQueue = withdrawQueue;
    this.lastTotalAssets = lastTotalAssets;
    this.lostAssets = lostAssets;
    this.publicAllocatorConfig = publicAllocatorConfig;
  }

  /**
   * The amount of interest in assets accrued since the last interaction with the vault.
   */
  get totalInterest() {
    return MathLib.zeroFloorSub(this.totalAssets, this.lastTotalAssets);
  }

  public toAssets(shares: bigint, rounding?: RoundingDirection) {
    return this._unwrap(shares, rounding);
  }

  public toShares(assets: bigint, rounding?: RoundingDirection) {
    return this._wrap(assets, rounding);
  }
}

export interface CollateralAllocation {
  address: Address;
  lltvs: Set<bigint>;
  oracles: Set<Address>;
  markets: Set<MarketId>;
  proportion: bigint;
}

export interface IAccrualVault
  extends Omit<IVault, "withdrawQueue" | "totalAssets"> {}

export class AccrualVault extends Vault implements IAccrualVault {
  /**
   * The allocation of the vault on each market enabled.
   */
  public readonly allocations: Map<MarketId, VaultMarketAllocation>;

  /**
   * The proportion of assets of the vault supplied to markets collateralized by each collateral asset.
   */
  public readonly collateralAllocations: Map<Address, CollateralAllocation>;

  constructor(
    vault: IAccrualVault,
    /**
     * The allocation of the vault on each market of the withdraw queue,
     * in the same order as the withdraw queue.
     */
    allocations: Omit<IVaultMarketAllocation, "proportion">[],
  ) {
    super({
      ...vault,
      withdrawQueue: allocations.map(({ position }) => position.market.id),
      totalAssets: allocations.reduce(
        (total, { position }) => total + position.supplyAssets,
        0n,
      ),
    });

    this.allocations = new Map(
      allocations.map((allocation) => [
        allocation.position.market.id,
        new VaultMarketAllocation(allocation),
      ]),
    );

    this.collateralAllocations = new Map<Address, CollateralAllocation>();

    for (const { marketId, position } of this.allocations.values()) {
      const address = position.market.params.collateralToken;

      let exposure = this.collateralAllocations.get(address);
      if (!exposure)
        this.collateralAllocations.set(
          address,
          (exposure = {
            address,
            lltvs: new Set(),
            oracles: new Set(),
            markets: new Set(),
            proportion: 0n,
          }),
        );

      exposure.lltvs.add(position.market.params.lltv);
      exposure.oracles.add(position.market.params.oracle);
      exposure.markets.add(marketId);
      exposure.proportion += this.getAllocationProportion(marketId);
    }
  }

  /**
   * The vault's liquidity directly available from allocated markets.
   */
  get liquidity() {
    return this.allocations
      .values()
      .reduce(
        (total, { position }) => total + position.withdrawCapacityLimit.value,
        0n,
      );
  }

  /**
   * The MetaMorpho vault's APY on its assets averaged over its market deposits, before deducting the performance fee.
   */
  get apy() {
    if (this.totalAssets === 0n) return 0n;

    return (
      this.allocations
        .values()
        .reduce(
          (total, { position }) =>
            total + position.market.supplyApy * position.supplyAssets,
          0n,
        ) / this.totalAssets
    );
  }

  /**
   * The MetaMorpho vault's APY on its assets averaged over its market deposits, after deducting the performance fee.
   */
  get netApy() {
    return MathLib.wMulDown(this.apy, MathLib.WAD - this.fee);
  }

  public getAllocationProportion(marketId: MarketId) {
    if (this.totalAssets === 0n) return 0n;

    const allocation = this.allocations.get(marketId);
    if (!allocation) return 0n;

    return MathLib.wDivDown(allocation.position.supplyAssets, this.totalAssets);
  }

  public getDepositCapacityLimit(assets: bigint): CapacityLimit {
    const suppliable = this.allocations
      .values()
      .reduce(
        (total, { config: { cap }, position: { marketId, supplyAssets } }) =>
          MathLib.min(
            total +
              (this.supplyQueue.includes(marketId)
                ? MathLib.zeroFloorSub(cap, supplyAssets)
                : 0n),
            MathLib.MAX_UINT_256,
          ),
        0n,
      );

    if (assets > suppliable)
      return {
        value: suppliable,
        limiter: CapacityLimitReason.cap,
      };

    return {
      value: assets,
      limiter: CapacityLimitReason.balance,
    };
  }

  public getWithdrawCapacityLimit(shares: bigint): CapacityLimit {
    const assets = this.toAssets(shares);
    const { liquidity } = this;

    if (assets > liquidity)
      return {
        value: liquidity,
        limiter: CapacityLimitReason.liquidity,
      };

    return {
      value: assets,
      limiter: CapacityLimitReason.balance,
    };
  }

  /**
   * Returns a new vault derived from this vault, whose interest has been accrued up to the given timestamp.
   * @param timestamp The timestamp at which to accrue interest. Must be greater than or equal to each of the vault's market's `lastUpdate`.
   */
  public accrueInterest(timestamp: BigIntish) {
    const vault = new AccrualVault(
      this,
      // Keep withdraw queue order.
      this.withdrawQueue.map((marketId) => {
        const { config, position } = this.allocations.get(marketId)!;

        return {
          config,
          position: position.accrueInterest(timestamp),
        };
      }),
    );

    if (vault.lostAssets != null) {
      vault.lostAssets += MathLib.max(
        vault.lastTotalAssets - vault.lostAssets - vault.totalAssets,
        0n,
      );

      vault.totalAssets += vault.lostAssets;
    }

    const feeAssets = MathLib.wMulDown(vault.totalInterest, vault.fee);

    vault.totalAssets -= feeAssets;

    const feeShares = vault.toShares(feeAssets, "Down");

    vault.totalAssets += feeAssets;
    vault.totalSupply += feeShares;
    vault.lastTotalAssets = vault.totalAssets;

    return vault;
  }
}
