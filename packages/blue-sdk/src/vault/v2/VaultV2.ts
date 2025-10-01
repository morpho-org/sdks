import { type Address, zeroAddress } from "viem";
import { VaultV2Errors } from "../../errors";
import { type CapacityLimit, CapacityLimitReason } from "../../market";
import { MathLib, type RoundingDirection } from "../../math";
import { type IToken, WrappedToken } from "../../token";
import type { BigIntish } from "../../types";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter";
import { AccrualVaultV2MorphoVaultV1Adapter } from "./VaultV2MorphoVaultV1Adapter";

export interface IVaultV2Caps {
  absolute: bigint;
  relative: bigint;
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
  liquidityCaps: IVaultV2Caps | undefined;
  liquidityAllocation: bigint | undefined;
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
  public liquidityCaps;
  public liquidityAllocation;

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
    liquidityCaps,
    liquidityAllocation,
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
    this.liquidityCaps = liquidityCaps;
    this.liquidityAllocation = liquidityAllocation;
    this.performanceFee = performanceFee;
    this.managementFee = managementFee;
    this.performanceFeeRecipient = performanceFeeRecipient;
    this.managementFeeRecipient = managementFeeRecipient;
  }

  public toAssets(shares: bigint) {
    return this._unwrap(shares, "Down");
  }

  public toShares(assets: bigint) {
    return this._wrap(assets, "Down");
  }

  protected _wrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.mulDiv(
      amount,
      this.totalSupply + this.virtualShares,
      this.totalAssets + 1n,
      rounding,
    );
  }

  protected _unwrap(amount: bigint, rounding: RoundingDirection) {
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
    public accrualLiquidityAdapter: IAccrualVaultV2Adapter,
    public accrualAdapters: IAccrualVaultV2Adapter[],
    public assetBalance: bigint,
  ) {
    super({ ...vault, adapters: accrualAdapters.map((a) => a.address) });
  }

  /**
   * Returns the maximum amount of assets that can be deposited given a balance of assets.
   * @param assets The maximum amount of assets to deposit.
   */
  public maxDeposit(assets: bigint): CapacityLimit {
    if (this.liquidityAdapter === zeroAddress)
      return { value: 0n, limiter: CapacityLimitReason.liquidity };

    if (
      this.accrualLiquidityAdapter instanceof AccrualVaultV2MorphoVaultV1Adapter
    ) {
      return this.accrualLiquidityAdapter.accrualVaultV1.maxDeposit(assets);
    }

    throw new VaultV2Errors.UnsupportedLiquidityAdapter(this.liquidityAdapter);
  }

  /**
   * Returns the maximum amount of assets that can be withdrawn given an amount of shares to redeem.
   * @param shares The maximum amount of shares to redeem.
   */
  public maxWithdraw(shares: bigint): CapacityLimit {
    if (this.liquidityAdapter === zeroAddress)
      return { value: 0n, limiter: CapacityLimitReason.liquidity };

    if (
      this.accrualLiquidityAdapter instanceof AccrualVaultV2MorphoVaultV1Adapter
    ) {
      return this.accrualLiquidityAdapter.accrualVaultV1.maxWithdraw(shares);
    }

    throw new VaultV2Errors.UnsupportedLiquidityAdapter(this.liquidityAdapter);
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
