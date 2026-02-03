import { type Address, type Hash, type Hex, zeroAddress } from "viem";
import { VaultV2Errors } from "../../errors";
import { MathLib, type RoundingDirection } from "../../math";
import { type IToken, WrappedToken } from "../../token";
import type { BigIntish } from "../../types";
import { type CapacityLimit, CapacityLimitReason } from "../../utils";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2Allocation {
  id: Hash;
  absoluteCap: bigint;
  relativeCap: bigint;
  allocation: bigint;
}

export interface IVaultV2 extends IToken {
  asset: Address;
  /**
   * The total assets, *including* virtually accrued interest.
   */
  totalAssets: bigint;
  /**
   * The total assets, *excluding* virtually accrued interest.
   */
  _totalAssets: bigint;
  /**
   * The total supply of shares.
   */
  totalSupply: bigint;
  virtualShares: bigint;
  maxRate: bigint;
  lastUpdate: bigint;
  adapters: Address[];
  liquidityAdapter: Address;
  liquidityData: Hex;
  liquidityAllocations: IVaultV2Allocation[] | undefined;
  performanceFee: bigint;
  managementFee: bigint;
  performanceFeeRecipient: Address;
  managementFeeRecipient: Address;
}

export class VaultV2 extends WrappedToken implements IVaultV2 {
  public readonly asset: Address;

  public totalAssets;
  public _totalAssets;
  public totalSupply;
  public virtualShares;

  public maxRate;
  public lastUpdate;

  public adapters;
  public liquidityAdapter;
  public liquidityData;
  public liquidityAllocations;

  public performanceFee;
  public managementFee;
  public performanceFeeRecipient;
  public managementFeeRecipient;

  constructor({
    asset,
    totalAssets,
    _totalAssets,
    totalSupply,
    virtualShares,
    maxRate,
    lastUpdate,
    adapters,
    liquidityAdapter,
    liquidityData,
    liquidityAllocations,
    performanceFee,
    managementFee,
    performanceFeeRecipient,
    managementFeeRecipient,
    ...config
  }: IVaultV2) {
    super(config, asset);

    this.asset = asset;
    this.totalAssets = totalAssets;
    this._totalAssets = _totalAssets;
    this.totalSupply = totalSupply;
    this.virtualShares = virtualShares;
    this.maxRate = maxRate;
    this.lastUpdate = lastUpdate;
    this.adapters = adapters;
    this.liquidityAdapter = liquidityAdapter;
    this.liquidityData = liquidityData;
    this.liquidityAllocations = liquidityAllocations;
    this.performanceFee = performanceFee;
    this.managementFee = managementFee;
    this.performanceFeeRecipient = performanceFeeRecipient;
    this.managementFeeRecipient = managementFeeRecipient;
  }

  public toAssets(shares: BigIntish) {
    return this._unwrap(shares, "Down");
  }

  public toShares(assets: BigIntish) {
    return this._wrap(assets, "Down");
  }

  protected _wrap(amount: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(
      amount,
      this.totalSupply + this.virtualShares,
      this.totalAssets + 1n,
      rounding,
    );
  }

  protected _unwrap(amount: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(
      amount,
      this.totalAssets + 1n,
      this.totalSupply + this.virtualShares,
      rounding,
    );
  }
}

export interface IAccrualVaultV2 extends Omit<IVaultV2, "adapters"> {}

export class AccrualVaultV2 extends VaultV2 implements IAccrualVaultV2 {
  constructor(
    vault: IAccrualVaultV2,
    public accrualLiquidityAdapter: IAccrualVaultV2Adapter | undefined,
    public accrualAdapters: IAccrualVaultV2Adapter[],
    public assetBalance: bigint,
  ) {
    super({ ...vault, adapters: accrualAdapters.map((a) => a.address) });
  }

  /**
   * Returns the maximum amount of assets that can be deposited to the vault.
   * @param assets The maximum amount of assets to deposit.
   */
  public maxDeposit(assets: BigIntish): CapacityLimit {
    if (this.liquidityAdapter === zeroAddress)
      return { value: BigInt(assets), limiter: CapacityLimitReason.balance };

    let liquidityAdapterLimit: CapacityLimit | undefined;
    if (this.accrualLiquidityAdapter != null)
      liquidityAdapterLimit = this.accrualLiquidityAdapter.maxDeposit(
        this.liquidityData,
        assets,
      );

    if (this.liquidityAllocations == null || liquidityAdapterLimit == null)
      throw new VaultV2Errors.UnsupportedLiquidityAdapter(
        this.liquidityAdapter,
      );

    // At this stage: `liquidityAdapterLimit.value <= assets`

    for (const { absoluteCap, relativeCap, allocation } of this
      .liquidityAllocations) {
      // `absoluteCap` can be set lower than `allocation`.
      const absoluteMaxDeposit = MathLib.zeroFloorSub(absoluteCap, allocation);
      if (liquidityAdapterLimit.value > absoluteMaxDeposit)
        liquidityAdapterLimit = {
          value: absoluteMaxDeposit,
          limiter: CapacityLimitReason.vaultV2_absoluteCap,
        };

      if (relativeCap !== MathLib.WAD) {
        // `relativeCap` can be set lower than `allocation / totalAssets`.
        const relativeMaxDeposit = MathLib.zeroFloorSub(
          MathLib.wMulDown(this.totalAssets, relativeCap),
          allocation,
        );
        if (liquidityAdapterLimit.value > relativeMaxDeposit)
          liquidityAdapterLimit = {
            value: relativeMaxDeposit,
            limiter: CapacityLimitReason.vaultV2_relativeCap,
          };
      }
    }

    return liquidityAdapterLimit;
  }

  /**
   * Returns the maximum amount of assets that can be withdrawn from the vault.
   * @param shares The maximum amount of shares to redeem.
   */
  public maxWithdraw(shares: BigIntish): CapacityLimit {
    const assets = this.toAssets(shares);
    if (this.liquidityAdapter === zeroAddress)
      return { value: BigInt(assets), limiter: CapacityLimitReason.balance };

    let liquidity = this.assetBalance;
    if (this.accrualLiquidityAdapter != null)
      liquidity += this.accrualLiquidityAdapter.maxWithdraw(
        this.liquidityData,
      ).value;

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
   * @param timestamp The timestamp at which to accrue interest. Must be greater than or equal to the vault's `lastUpdate`.
   */
  public accrueInterest(timestamp: BigIntish) {
    const vault = new AccrualVaultV2(
      this,
      this.accrualLiquidityAdapter,
      this.accrualAdapters,
      this.assetBalance,
    );

    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.lastUpdate;
    if (elapsed < 0n)
      throw new VaultV2Errors.InvalidInterestAccrual(
        this.address,
        timestamp,
        this.lastUpdate,
      );

    // Corresponds to the `firstTotalAssets == 0` onchain check.
    if (elapsed === 0n)
      return { vault, performanceFeeShares: 0n, managementFeeShares: 0n };

    const realAssets = vault.accrualAdapters.reduce(
      (curr, adapter) => curr + adapter.realAssets(timestamp),
      vault.assetBalance,
    );
    const maxTotalAssets =
      vault._totalAssets +
      MathLib.wMulDown(vault._totalAssets * elapsed, vault.maxRate);
    const newTotalAssets = MathLib.min(realAssets, maxTotalAssets);
    const interest = MathLib.zeroFloorSub(newTotalAssets, vault._totalAssets);

    const performanceFeeAssets =
      interest > 0n && vault.performanceFee > 0n
        ? MathLib.wMulDown(interest, vault.performanceFee)
        : 0n;
    const managementFeeAssets =
      elapsed > 0n && vault.managementFee > 0n
        ? MathLib.wMulDown(newTotalAssets * elapsed, vault.managementFee)
        : 0n;

    const newTotalAssetsWithoutFees =
      newTotalAssets - performanceFeeAssets - managementFeeAssets;
    const performanceFeeShares = MathLib.mulDivDown(
      performanceFeeAssets,
      vault.totalSupply + vault.virtualShares,
      newTotalAssetsWithoutFees + 1n,
    );
    const managementFeeShares = MathLib.mulDivDown(
      managementFeeAssets,
      vault.totalSupply + vault.virtualShares,
      newTotalAssetsWithoutFees + 1n,
    );

    vault.totalAssets = newTotalAssets;
    vault._totalAssets = newTotalAssets;
    if (performanceFeeShares) vault.totalSupply += performanceFeeShares;
    if (managementFeeShares) vault.totalSupply += managementFeeShares;
    vault.lastUpdate = BigInt(timestamp);

    return { vault, performanceFeeShares, managementFeeShares };
  }
}
