import { type Address, type Hash, type Hex, zeroAddress } from "viem";
import { VaultV2Errors } from "../../errors.js";
import { MarketParams } from "../../market/index.js";
import { MathLib, type RoundingDirection } from "../../math/index.js";
import { type IToken, WrappedToken } from "../../token/index.js";
import type { BigIntish, MarketId } from "../../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../../utils.js";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter.js";
import { AccrualVaultV2MorphoMarketV1Adapter } from "./VaultV2MorphoMarketV1Adapter.js";
import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "./VaultV2MorphoMarketV1AdapterV2.js";
import { AccrualVaultV2MorphoVaultV1Adapter } from "./VaultV2MorphoVaultV1Adapter.js";

export interface IVaultV2Allocation {
  id: Hash;
  absoluteCap: bigint;
  relativeCap: bigint;
  allocation: bigint;
}

export interface ForceDeallocateAction {
  /** The adapter address to force-deallocate from. */
  adapter: Address;
  /** The amount of assets to deallocate. */
  amount: bigint;
  /** The market params, required for market-level adapter deallocations. */
  marketParams?: MarketParams;
}

export interface MaxForceDeallocateResult {
  /** The total maximum value that can be force-deallocated. */
  totalValue: bigint;
  /** The individual deallocation actions. */
  actions: ForceDeallocateAction[];
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
   * Returns the maximum amount of assets that can be force-deallocated from adapters
   * with zero force-deallocate penalty, along with the individual deallocation actions.
   *
   * Constraints:
   * - Only considers adapters with `forceDeallocatePenalties === 0`.
   * - Tracks shared market liquidity across adapters to avoid exceeding per-market limits.
   * - Excludes the liquidity adapter's market supply from available liquidity
   *   (VaultV1: all its markets, MarketV1: its specific markets).
   * - VaultV1 adapters follow their fixed withdraw queue order.
   * - MarketV1 adapters can withdraw from markets in any order.
   */
  public maxForceDeallocate(): MaxForceDeallocateResult {
    const availableLiquidity = new Map<MarketId, bigint>();

    // Step 1: Collect all unique markets and their liquidity from zero-penalty adapters.
    for (const adapter of this.accrualAdapters) {
      if (this.forceDeallocatePenalties[adapter.address] !== 0n) continue;

      if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
        for (const {
          position,
        } of adapter.accrualVaultV1.allocations.values()) {
          if (!availableLiquidity.has(position.marketId))
            availableLiquidity.set(
              position.marketId,
              position.market.liquidity,
            );
        }
      } else if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
        for (const position of adapter.positions) {
          if (!availableLiquidity.has(position.marketId))
            availableLiquidity.set(
              position.marketId,
              position.market.liquidity,
            );
        }
      } else if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
        for (const market of adapter.markets) {
          if (!availableLiquidity.has(market.id))
            availableLiquidity.set(market.id, market.liquidity);
        }
      }
    }

    // Step 2: Subtract the liquidity adapter's supply to preserve normal withdrawal capacity.
    if (this.accrualLiquidityAdapter != null) {
      const liqAdapter = this.accrualLiquidityAdapter;

      if (liqAdapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
        const vaultV1 = liqAdapter.accrualVaultV1;
        let remaining = vaultV1.toAssets(liqAdapter.shares);

        for (const marketId of vaultV1.withdrawQueue) {
          if (remaining === 0n) break;

          const allocation = vaultV1.allocations.get(marketId);
          if (allocation == null) continue;

          const { position } = allocation;
          const canWithdraw = MathLib.min(
            MathLib.min(position.supplyAssets, position.market.liquidity),
            remaining,
          );

          if (canWithdraw > 0n) {
            const current = availableLiquidity.get(marketId);
            if (current != null)
              availableLiquidity.set(
                marketId,
                MathLib.zeroFloorSub(current, canWithdraw),
              );
            remaining -= canWithdraw;
          }
        }
      } else if (
        liqAdapter instanceof AccrualVaultV2MorphoMarketV1Adapter ||
        liqAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
      ) {
        const liqMarketId = MarketParams.fromHex(this.liquidityData).id;
        const current = availableLiquidity.get(liqMarketId);
        if (current != null) {
          const reserved = liqAdapter.maxWithdraw(this.liquidityData).value;
          availableLiquidity.set(
            liqMarketId,
            MathLib.zeroFloorSub(current, reserved),
          );
        }
      }
    }

    // Step 3: Process adapters.
    const actions: ForceDeallocateAction[] = [];
    let totalValue = 0n;

    // MarketV1 adapters first (flexible withdrawal order).
    for (const adapter of this.accrualAdapters) {
      if (this.forceDeallocatePenalties[adapter.address] !== 0n) continue;

      if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
        for (const position of adapter.positions) {
          const available = availableLiquidity.get(position.marketId) ?? 0n;
          const amount = MathLib.min(position.supplyAssets, available);

          if (amount > 0n) {
            actions.push({
              adapter: adapter.address,
              amount,
              marketParams: position.market.params,
            });
            totalValue += amount;
            availableLiquidity.set(position.marketId, available - amount);
          }
        }
      } else if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
        for (const market of adapter.markets) {
          const supplyAssets = market.toSupplyAssets(
            adapter.supplyShares[market.id] ?? 0n,
          );
          const available = availableLiquidity.get(market.id) ?? 0n;
          const amount = MathLib.min(supplyAssets, available);

          if (amount > 0n) {
            actions.push({
              adapter: adapter.address,
              amount,
              marketParams: market.params,
            });
            totalValue += amount;
            availableLiquidity.set(market.id, available - amount);
          }
        }
      }
    }

    // VaultV1 adapters (constrained by fixed withdraw queue order).
    for (const adapter of this.accrualAdapters) {
      if (this.forceDeallocatePenalties[adapter.address] !== 0n) continue;
      if (!(adapter instanceof AccrualVaultV2MorphoVaultV1Adapter)) continue;

      const vaultV1 = adapter.accrualVaultV1;
      const targetAssets = vaultV1.toAssets(adapter.shares);
      let remaining = targetAssets;

      for (const marketId of vaultV1.withdrawQueue) {
        if (remaining === 0n) break;

        const allocation = vaultV1.allocations.get(marketId);
        if (allocation == null) continue;

        const positionSupply = allocation.position.supplyAssets;
        const marketLiq = availableLiquidity.get(marketId) ?? 0n;
        const canWithdraw = MathLib.min(
          MathLib.min(positionSupply, marketLiq),
          remaining,
        );

        if (canWithdraw > 0n) {
          remaining -= canWithdraw;
          availableLiquidity.set(marketId, marketLiq - canWithdraw);
        }
      }

      const amount = targetAssets - remaining;
      if (amount > 0n) {
        actions.push({ adapter: adapter.address, amount });
        totalValue += amount;
      }
    }

    return { totalValue, actions };
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
