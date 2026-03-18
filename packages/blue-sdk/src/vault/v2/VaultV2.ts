import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, type Hash, type Hex, zeroAddress } from "viem";
import { VaultV2Errors } from "../../errors.js";
import { MarketParams } from "../../market/index.js";
import { MathLib, type RoundingDirection } from "../../math/index.js";
import { type IToken, WrappedToken } from "../../token/index.js";
import type { BigIntish, MarketId } from "../../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../../utils.js";
import type {
  ForceWithdrawResult,
  IAccrualVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { AccrualVaultV2MorphoVaultV1Adapter } from "./VaultV2MorphoVaultV1Adapter.js";

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
    /**
     * The force deallocate penalty for each adapter, keyed by adapter address.
     */
    public forceDeallocatePenalties: Record<Address, bigint>,
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
   * Returns the maximum amount of assets that can be withdrawn from the vault,
   * taking into account the liquidity freed by force-deallocating adapters.
   *
   * Returns the deallocation path sorted from largest to smallest contribution,
   * covering exactly the needed deallocation amount.
   * Returns an empty deallocations array if normal withdraw suffices or if
   * total liquidity (including force deallocation) is insufficient.
   *
   * @param shares The maximum amount of shares to redeem.
   * @param maxPenalty The maximum penalty to consider for force-deallocating adapters.
   */
  public maxForceWithdraw(
    shares: BigIntish,
    maxPenalty = 0n,
  ): ForceWithdrawResult {
    const { value, limiter } = this.maxWithdraw(shares);

    if (limiter !== CapacityLimitReason.liquidity)
      return { value, limiter, deallocations: [] };

    const assets = this.toAssets(shares);

    // Collect eligible adapters with their per-market data.
    const eligibleAdapters: {
      adapter: IAccrualVaultV2Adapter;
      isLiquidityAdapter: boolean;
    }[] = [];

    const remainingLiquidity = new Map<MarketId, bigint>();

    for (const adapter of this.accrualAdapters) {
      const penalty = this.forceDeallocatePenalties[adapter.address];
      if (!isDefined(penalty)) continue;
      if (penalty > maxPenalty) continue;

      const isLiquidityAdapter = adapter.address === this.liquidityAdapter;
      eligibleAdapters.push({ adapter, isLiquidityAdapter });

      for (const [marketId, { liquidity }] of adapter
        .maxDeallocatableAssets()
        .entries()) {
        const existing = remainingLiquidity.get(marketId);
        if (!isDefined(existing) || liquidity > existing)
          remainingLiquidity.set(marketId, liquidity);
      }
    }

    // Amount already counted by maxWithdraw via the liquidity adapter's
    // normal route; must not be double-counted.
    const liquidityAdapterNormal =
      this.accrualLiquidityAdapter != null
        ? this.accrualLiquidityAdapter.maxWithdraw(this.liquidityData).value
        : 0n;

    // Reserve the normal-path consumption on its specific market so that
    // force-path adapters sharing that market cannot double-count it.
    if (liquidityAdapterNormal > 0n && this.liquidityData !== "0x") {
      const normalMarketId = MarketParams.fromHex(this.liquidityData).id;
      const prev = remainingLiquidity.get(normalMarketId);
      if (prev != null)
        remainingLiquidity.set(
          normalMarketId,
          MathLib.zeroFloorSub(prev, liquidityAdapterNormal),
        );
    }

    // Sort adapters by naive deallocatable estimate (sum of
    // min(supplyAssets, liquidity) per market) so the largest contributors
    // are processed first.
    const adapterEntries = eligibleAdapters.map((entry) => {
      let estimate = 0n;
      for (const { supplyAssets, liquidity } of entry.adapter
        .maxDeallocatableAssets()
        .values()) {
        estimate += MathLib.min(supplyAssets, liquidity);
      }

      if (entry.isLiquidityAdapter)
        estimate = MathLib.zeroFloorSub(estimate, liquidityAdapterNormal);

      return { ...entry, estimate };
    });

    // Process queue-based adapters (VaultV1) last: their fixed withdraw queue
    // and budget cap can waste shared liquidity that order-independent adapters
    // (MarketV1) could have used, leading to under-reported totals.
    adapterEntries.sort((a, b) => {
      const aPrio =
        a.adapter instanceof AccrualVaultV2MorphoVaultV1Adapter ? 1 : 0;
      const bPrio =
        b.adapter instanceof AccrualVaultV2MorphoVaultV1Adapter ? 1 : 0;
      if (aPrio !== bPrio) return aPrio - bPrio;
      return a.estimate > b.estimate ? -1 : a.estimate < b.estimate ? 1 : 0;
    });

    // Process adapters in sorted order, tracking remaining per-market
    // liquidity to avoid double-counting shared markets.
    const deallocations: { adapter: Address; assets: bigint }[] = [];
    let totalForceDeallocatable = 0n;

    for (const { adapter, isLiquidityAdapter } of adapterEntries) {
      const { consumed, total: rawTotal } =
        adapter.computeActualDeallocatable(remainingLiquidity);

      // Deduct the liquidity adapter's normal-route contribution which was
      // already included in maxWithdraw's result.
      let effectiveTotal = rawTotal;
      if (isLiquidityAdapter)
        effectiveTotal = MathLib.zeroFloorSub(rawTotal, liquidityAdapterNormal);

      // Update remaining liquidity for subsequent adapters.
      for (const [marketId, c] of consumed) {
        const prev = remainingLiquidity.get(marketId) ?? 0n;
        remainingLiquidity.set(marketId, MathLib.zeroFloorSub(prev, c));
      }

      if (effectiveTotal > 0n) {
        totalForceDeallocatable += effectiveTotal;
        deallocations.push({
          adapter: adapter.address,
          assets: effectiveTotal,
        });
      }
    }

    const totalLiquidity = value + totalForceDeallocatable;

    if (assets > totalLiquidity)
      return {
        value: totalLiquidity,
        limiter: CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
        deallocations: [],
      };

    // Trim deallocations to cover exactly the needed amount.
    const needed = assets - value;
    const trimmedDeallocations: { adapter: Address; assets: bigint }[] = [];
    let remaining = needed;

    for (const dealloc of deallocations) {
      if (remaining <= 0n) break;

      const effective = MathLib.min(dealloc.assets, remaining);
      trimmedDeallocations.push({
        adapter: dealloc.adapter,
        assets: effective,
      });
      remaining -= effective;
    }

    return {
      value: assets,
      limiter: CapacityLimitReason.vaultV2_forceDeallocateBalance,
      deallocations: trimmedDeallocations,
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
      this.forceDeallocatePenalties,
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
