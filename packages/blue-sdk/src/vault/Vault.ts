import { CapacityLimit, CapacityLimitReason } from "../market";
import { MathLib, RoundingDirection } from "../maths";
import { VaultToken } from "../token";
import { Address, BigIntish, MarketId } from "../types";

import { VaultConfig } from "./VaultConfig";
import {
  InputVaultMarketAllocation,
  VaultMarketAllocation,
} from "./VaultMarketAllocation";
import { VaultUtils } from "./VaultUtils";

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

export interface InputVault {
  config: VaultConfig;
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
  publicAllocatorConfig?: VaultPublicAllocatorConfig;
}

export class Vault extends VaultToken implements InputVault {
  /**
   * The MetaMorpho vault's config.
   */
  public readonly config: VaultConfig;

  /**
   * The MetaMorpho vault's owner address.
   */
  owner: Address;
  /**
   * The MetaMorpho vault's curator address.
   */
  curator: Address;
  /**
   * The MetaMorpho vault's guardian address.
   */
  guardian: Address;
  /**
   * The MetaMorpho vault's skim recipient address (mostly used to skim reward tokens claimed to the vault).
   */
  skimRecipient: Address;
  /**
   * The MetaMorpho vault's fee recipient address.
   */
  feeRecipient: Address;

  /**
   * The MetaMorpho vault's timelock (in seconds).
   */
  timelock: bigint;
  /**
   * The MetaMorpho vault's fee.
   */
  fee: bigint;

  /**
   * The MetaMorpho vault's pending owner address and activation timestamp.
   */
  pendingOwner: Address;
  /**
   * The MetaMorpho vault's pending guardian address and activation timestamp.
   */
  pendingGuardian: Pending<Address>;
  /**
   * The MetaMorpho vault's pending timelock (in seconds) and activation timestamp.
   */
  pendingTimelock: Pending<bigint>;

  /**
   * The MetaMorpho vault's ordered supply queue.
   */
  supplyQueue: MarketId[];
  /**
   * The MetaMorpho vault's ordered withdraw queue.
   */
  withdrawQueue: MarketId[];

  /**
   * The ERC4626 vault's total supply of shares.
   */
  totalSupply: bigint;
  /**
   * The ERC4626 vault's total assets.
   */
  totalAssets: bigint;
  /**
   * The MetaMorpho vault's last total assets used to calculate performance fees.
   */
  lastTotalAssets: bigint;

  /**
   * The MetaMorpho vault's public allocator configuration.
   */
  publicAllocatorConfig?: VaultPublicAllocatorConfig;

  constructor({
    config,
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
  }: InputVault) {
    super(config, { totalAssets, totalSupply });

    this.config = config;
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
    this.totalSupply = totalSupply;
    this.totalAssets = totalAssets;
    this.lastTotalAssets = lastTotalAssets;
    this.publicAllocatorConfig = publicAllocatorConfig;
  }

  get asset() {
    return this.config.asset;
  }

  /**
   * The amount of interest in assets accrued since the last interaction with the vault.
   */
  get totalInterest() {
    return MathLib.zeroFloorSub(this.totalAssets, this.lastTotalAssets);
  }

  public toAssets(shares: bigint, rounding?: RoundingDirection) {
    return VaultUtils.toAssets(shares, this, this.config, rounding);
  }

  public toShares(assets: bigint, rounding?: RoundingDirection) {
    return VaultUtils.toShares(assets, this, this.config, rounding);
  }
}

export interface CollateralAllocation {
  address: Address;
  lltvs: Set<bigint>;
  oracles: Set<Address>;
  markets: Set<MarketId>;
  proportion: bigint;
}

export interface InputAccrualVault
  extends Omit<InputVault, "withdrawQueue" | "totalAssets"> {}

export class AccrualVault extends Vault implements InputAccrualVault {
  /**
   * The allocation of the vault on each market enabled.
   */
  public readonly allocations: Map<MarketId, VaultMarketAllocation>;

  /**
   * The proportion of assets of the vault supplied to markets collateralized by each collateral asset.
   */
  public readonly collateralAllocations: Map<Address, CollateralAllocation>;

  constructor(
    vault: InputAccrualVault,
    /**
     * The allocation of the vault on each market of the withdraw queue,
     * in the same order as the withdraw queue.
     */
    allocations: Omit<InputVaultMarketAllocation, "proportion">[],
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
      const address = position.market.config.collateralToken;

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

      exposure.lltvs.add(position.market.config.lltv);
      exposure.oracles.add(position.market.config.oracle);
      exposure.markets.add(marketId);
      exposure.proportion += this.getAllocationProportion(marketId);
    }
  }

  /**
   * The vault's liquidity directly available from allocated markets.
   */
  get liquidity() {
    return Array.from(this.allocations.values()).reduce(
      (total, { position }) => total + position.withdrawCapacityLimit.value,
      0n,
    );
  }

  /**
   * The MetaMorpho vault's average APY on its assets, including the performance fee.
   */
  get avgApy() {
    if (this.totalAssets === 0n) return 0n;

    return (
      Array.from(this.allocations.values()).reduce(
        (total, { position }) =>
          total + position.market.supplyApy * position.supplyAssets,
        0n,
      ) / this.totalAssets
    );
  }

  /**
   * The MetaMorpho vault's average APY on its assets, excluding the performance fee.
   */
  get netApy() {
    return MathLib.wMulDown(this.avgApy, MathLib.WAD - this.fee);
  }

  public getAllocationProportion(marketId: MarketId) {
    if (this.totalAssets === 0n) return 0n;

    const allocation = this.allocations.get(marketId);
    if (!allocation) return 0n;

    return MathLib.wDivDown(allocation.position.supplyAssets, this.totalAssets);
  }

  public getDepositCapacityLimit(assets: bigint): CapacityLimit {
    const suppliable = Array.from(this.allocations.values()).reduce(
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
      Array.from(this.allocations.values(), ({ config, position }) => ({
        config,
        position: position.accrueInterest(timestamp),
      })),
    );

    const feeAssets = MathLib.wMulDown(vault.totalInterest, vault.fee);

    vault.totalAssets -= feeAssets;

    const feeShares = vault.toShares(feeAssets, "Down");

    vault.totalAssets += feeAssets;
    vault.totalSupply += feeShares;
    vault.lastTotalAssets = vault.totalAssets;

    return vault;
  }
}
