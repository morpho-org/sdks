import type { Address } from "viem";
import { MathLib, type RoundingDirection } from "../math";
import { type IToken, WrappedToken } from "../token";
import type { BigIntish } from "../types";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2 extends IToken {
  asset: Address;
  totalSupply: bigint;
  totalAssets: bigint;
  performanceFee: bigint;
  managementFee: bigint;
  virtualShares: bigint;
  lastUpdate: bigint;
  adapters: Address[];
  maxRate: bigint;
  liquidityAdapter: Address;
  performanceFeeRecipient: Address;
  managementFeeRecipient: Address;
}

export class VaultV2 extends WrappedToken implements IVaultV2 {
  public readonly asset: Address;

  /**
   * The ERC4626 vault's total supply of shares.
   */
  public totalSupply: bigint;

  /**
   * The ERC4626 vault's total assets, without accrued interest
   */
  public totalAssets: bigint;

  public virtualShares: bigint;

  public lastUpdate: bigint;

  public adapters: Address[];

  public maxRate: bigint;

  public performanceFee: bigint;
  public managementFee: bigint;

  public liquidityAdapter: Address;

  public performanceFeeRecipient: Address;
  public managementFeeRecipient: Address;

  constructor({
    totalSupply,
    asset,
    totalAssets,
    virtualShares,
    lastUpdate,
    adapters,
    maxRate,
    performanceFee,
    managementFee,
    liquidityAdapter,
    performanceFeeRecipient,
    managementFeeRecipient,
    ...config
  }: IVaultV2) {
    super(config, asset);
    this.totalSupply = totalSupply;
    this.totalAssets = totalAssets;
    this.virtualShares = virtualShares;
    this.lastUpdate = lastUpdate;
    this.asset = asset;
    this.maxRate = maxRate;
    this.adapters = adapters;
    this.performanceFee = performanceFee;
    this.managementFee = managementFee;
    this.liquidityAdapter = liquidityAdapter;
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
    public readonly accrualAdapters: IAccrualVaultV2Adapter[],
    public readonly assetBalance: bigint,
  ) {
    super({ ...vault, adapters: accrualAdapters.map((a) => a.address) });
  }

  public accrueInterest(timestamp: BigIntish) {
    const vault = new AccrualVaultV2(
      this,
      this.accrualAdapters,
      this.assetBalance,
    );
    const elapsed = BigInt(timestamp) - vault.lastUpdate;

    if (elapsed <= 0n)
      return { vault, performanceFeeShares: 0n, managementFeeShares: 0n };

    const realAssets = vault.accrualAdapters.reduce(
      (curr, adapter) => curr + adapter.realAssets(timestamp),
      vault.assetBalance,
    );
    const maxTotalAssets =
      vault.totalAssets +
      MathLib.wMulDown(vault.totalAssets * elapsed, vault.maxRate);
    const newTotalAssets = MathLib.min(realAssets, maxTotalAssets);
    const interest = MathLib.zeroFloorSub(newTotalAssets, vault.totalAssets);

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
    if (performanceFeeShares) vault.totalSupply += performanceFeeShares;
    if (managementFeeShares) vault.totalSupply += managementFeeShares;

    vault.lastUpdate = BigInt(timestamp);

    return { vault, performanceFeeShares, managementFeeShares };
  }
}
