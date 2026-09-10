import { Time } from "@morpho-org/morpho-ts";
import { UnknownMarketAllocationError } from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { MathLib, type RoundingDirection } from "../math/index.js";
import { VaultToken } from "../token/index.js";
import type { Address, BigIntish, MarketId } from "../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../utils.js";
import type { IVaultConfig } from "./VaultConfig.js";
import {
  type IVaultMarketAllocation,
  VaultMarketAllocation,
} from "./VaultMarketAllocation.js";

/** Pending governance value and the timestamp at which it becomes valid. */
export interface Pending<T> {
  value: T;
  validAt: bigint;
}

/** PublicAllocator configuration attached to a MetaMorpho vault. */
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

/** Plain input shape for a MetaMorpho vault. */
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

/** Represents a MetaMorpho vault and its governance, queue, and accounting state. */
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
   * Returns interest accrued since the vault's last accounting update, floored at zero.
   *
   * @returns The non-negative difference between `totalAssets` and `lastTotalAssets`, in the
   *   underlying asset's smallest unit.
   * @example
   * ```ts
   * import { fetchVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchVault(vaultAddress, client);
   * const interest = vault.totalInterest;
   * // interest satisfies bigint
   * ```
   */
  get totalInterest() {
    return MathLib.zeroFloorSub(this.totalAssets, this.lastTotalAssets);
  }

  /**
   * Converts Vault V1 shares to underlying assets using the current totals and virtual offsets.
   *
   * @param shares - Vault shares to convert, in the share token's smallest unit.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The corresponding underlying assets, rounded in the requested direction.
   * @example
   * ```ts
   * import { fetchVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchVault(vaultAddress, client);
   * const assets = vault.toAssets(1_000_000_000_000_000_000n);
   * // assets satisfies bigint
   * ```
   */
  public toAssets(shares: BigIntish, rounding: RoundingDirection = "Down") {
    return this._unwrap(shares, rounding);
  }

  /**
   * Converts underlying assets to Vault V1 shares using the current totals and virtual offsets.
   *
   * @param assets - Underlying assets to convert, in the asset token's smallest unit.
   * @param rounding - Optional rounding direction. Defaults to `"Up"`.
   * @returns The corresponding vault shares, rounded in the requested direction.
   * @example
   * ```ts
   * import { fetchVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchVault(vaultAddress, client);
   * const shares = vault.toShares(1_000_000n);
   * // shares satisfies bigint
   * ```
   */
  public toShares(assets: BigIntish, rounding: RoundingDirection = "Up") {
    return this._wrap(assets, rounding);
  }
}

/** Aggregated vault allocation exposure for one collateral asset. */
export interface CollateralAllocation {
  address: Address;
  lltvs: Set<bigint>;
  oracles: Set<Address>;
  markets: Set<MarketId>;
  /** @deprecated Sum `vault.getAllocationProportion(marketId)` over `markets`. */
  proportion: bigint;
}

/** Plain input shape for a MetaMorpho vault paired with accrued market allocations. */
export interface IAccrualVault
  extends Omit<IVault, "withdrawQueue" | "totalAssets"> {}

/** Represents a MetaMorpho vault with accrued market allocation state. */
export class AccrualVault extends Vault implements IAccrualVault {
  /**
   * @inheritdoc
   * Reflects the sum of assets of the vault's allocations.
   * Only includes virtually accrued interest if the vault's allocations include virtually accrued interest.
   */
  declare totalAssets: bigint;

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
   * Returns the vault assets immediately withdrawable from its allocated markets.
   *
   * @returns The sum of each allocation's position- and market-limited withdraw capacity, in the
   *   underlying asset's smallest unit.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const liquidity = vault.liquidity;
   * // liquidity satisfies bigint
   * ```
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
   * Returns the vault's current allocation-weighted experienced APY before its performance fee.
   *
   * Use `getApy(timestamp)` to project the APY at a specific timestamp.
   *
   * @returns The current gross annual yield as a decimal JavaScript number, or `0` for an empty
   *   vault.
   * @throws {BlueErrors.InvalidInterestAccrual} when the current timestamp precedes an allocation
   *   market's `lastUpdate`.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const apy = vault.apy;
   * // apy satisfies number
   * ```
   */
  get apy() {
    return this.getApy();
  }

  /**
   * Returns the vault's current allocation-weighted experienced APY after its performance fee.
   *
   * Use `getNetApy(timestamp)` to project the net APY at a specific timestamp.
   *
   * @returns The current net annual yield as a decimal JavaScript number, or `0` for an empty
   *   vault.
   * @throws {BlueErrors.InvalidInterestAccrual} when the current timestamp precedes an allocation
   *   market's `lastUpdate`.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const netApy = vault.netApy;
   * // netApy satisfies number
   * ```
   */
  get netApy() {
    return this.getNetApy();
  }

  /**
   * The MetaMorpho vault's per-second rate at which interest _would_ accrue,
   * weighted-averaged over its market deposits, before deducting the performance fee,
   * if interest was to be accrued on each market at the given timestamp.
   */
  private _getAvgRate(timestamp: BigIntish = Time.timestamp()) {
    if (this.totalAssets === 0n) return 0n;

    return (
      this.allocations
        .values()
        .reduce(
          (total, { position }) =>
            total +
            position.market.getAvgSupplyRate(timestamp) * position.supplyAssets,
          0n,
        ) / this.totalAssets
    );
  }

  /**
   * Calculates the allocation-weighted experienced APY before fees if each market accrued at a
   * timestamp.
   *
   * @param timestamp - Optional Unix timestamp in seconds. Defaults to the current timestamp.
   * @returns The projected gross annual yield as a decimal JavaScript number, or `0` for an empty
   *   vault.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes an allocation market's
   *   `lastUpdate`.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const apy = vault.getApy();
   * // apy satisfies number
   * ```
   */
  public getApy(timestamp: BigIntish = Time.timestamp()) {
    if (this.totalAssets === 0n) return 0;

    return MarketUtils.rateToApy(this._getAvgRate(timestamp));
  }

  /**
   * Calculates the allocation-weighted experienced APY after fees if each market accrued at a
   * timestamp.
   *
   * @param timestamp - Optional Unix timestamp in seconds. Defaults to the current timestamp.
   * @returns The projected net annual yield as a decimal JavaScript number, or `0` for an empty
   *   vault.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes an allocation market's
   *   `lastUpdate`.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const netApy = vault.getNetApy();
   * // netApy satisfies number
   * ```
   */
  public getNetApy(timestamp: BigIntish = Time.timestamp()) {
    return MarketUtils.rateToApy(
      MathLib.wMulDown(this._getAvgRate(timestamp), MathLib.WAD - this.fee),
    );
  }

  /**
   * Returns one market's share of the vault's allocated assets, rounded down.
   *
   * @param marketId - Market whose allocation proportion to read.
   * @returns The WAD-scaled allocation proportion, or `0n` when the vault is empty or the market
   *   is not allocated.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const marketId = vault.withdrawQueue[0]!;
   * const proportion = vault.getAllocationProportion(marketId);
   * // proportion satisfies bigint
   * ```
   */
  public getAllocationProportion(marketId: MarketId) {
    if (this.totalAssets === 0n) return 0n;

    const allocation = this.allocations.get(marketId);
    if (!allocation) return 0n;

    return MathLib.wDivDown(allocation.position.supplyAssets, this.totalAssets);
  }

  /**
   * Returns the vault's deposit capacity for a requested asset amount.
   *
   * @param assets - Maximum underlying asset amount being considered.
   * @returns A capacity limit containing the depositable asset amount and either the `cap` or
   *   `balance` limiting reason.
   * @deprecated Use {@link AccrualVault.maxDeposit} instead.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const limit = vault.getDepositCapacityLimit(1_000_000n);
   * // limit satisfies CapacityLimit
   * ```
   */
  public getDepositCapacityLimit(assets: bigint): CapacityLimit {
    return this.maxDeposit(assets);
  }

  /**
   * Returns the vault's withdraw capacity for a requested share amount.
   *
   * @param shares - Maximum vault share amount being considered.
   * @returns A capacity limit containing the withdrawable asset amount and either the `liquidity`
   *   or `balance` limiting reason.
   * @deprecated Use {@link AccrualVault.maxWithdraw} instead.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const limit = vault.getWithdrawCapacityLimit(
   *   1_000_000_000_000_000_000n,
   * );
   * // limit satisfies CapacityLimit
   * ```
   */
  public getWithdrawCapacityLimit(shares: bigint): CapacityLimit {
    return this.maxWithdraw(shares);
  }

  /**
   * Returns the requested asset amount depositable through markets in the supply queue.
   *
   * @param assets - Maximum underlying asset amount being considered.
   * @returns A capacity limit containing the depositable asset amount and either the `cap` or
   *   `balance` limiting reason.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const limit = vault.maxDeposit(1_000_000n);
   * // limit satisfies CapacityLimit
   * ```
   */
  public maxDeposit(assets: BigIntish): CapacityLimit {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    assets = BigInt(assets);

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

  /**
   * Returns the underlying asset amount withdrawable for a requested vault share amount.
   *
   * @param shares - Maximum vault share amount being considered.
   * @returns A capacity limit containing the withdrawable asset amount and either the `liquidity`
   *   or `balance` limiting reason.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const vault = await fetchAccrualVault(vaultAddress, client);
   * const limit = vault.maxWithdraw(1_000_000_000_000_000_000n);
   * // limit satisfies CapacityLimit
   * ```
   */
  public maxWithdraw(shares: BigIntish): CapacityLimit {
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
   * Projects the vault's market interest, loss accounting, and performance fees to a timestamp.
   *
   * Returns a new `AccrualVault` and leaves this instance unchanged.
   *
   * @param timestamp - Optional accrual timestamp in seconds. Must not precede any allocation
   *   market's `lastUpdate`; defaults each allocation to its own `lastUpdate`.
   * @returns A new vault whose market positions, realized losses, and fee shares reflect the
   *   projected accounting.
   * @throws {UnknownMarketAllocationError} when the withdraw queue references a market without an
   *   allocation.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes an allocation market's
   *   `lastUpdate`.
   * @example
   * ```ts
   * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() });
   * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
   * const block = await client.getBlock();
   * const vault = await fetchAccrualVault(vaultAddress, client, {
   *   blockNumber: block.number,
   * });
   * const accrued = vault.accrueInterest(block.timestamp);
   * // accrued satisfies AccrualVault
   * ```
   */
  public accrueInterest(timestamp?: BigIntish) {
    const vault = new AccrualVault(
      this,
      // Keep withdraw queue order.
      this.withdrawQueue.map((marketId) => {
        const allocation = this.allocations.get(marketId);
        // Fail loudly rather than silently dropping the market: a stale
        // `withdrawQueue` entry (e.g., one mutated after construction to
        // reference a market that is no longer allocated) would otherwise
        // crash with an opaque "Cannot destructure property 'config' of
        // 'undefined'" via the non-null assertion below.
        if (allocation == null)
          throw new UnknownMarketAllocationError(marketId);

        const { config, position } = allocation;
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

      // The constructor cached proportions against allocated assets only. Adding `lostAssets`
      // changes their denominator, so recompute them against the final `totalAssets`.
      for (const exposure of vault.collateralAllocations.values()) {
        exposure.proportion = exposure.markets
          .values()
          .reduce(
            (total, marketId) =>
              total + vault.getAllocationProportion(marketId),
            0n,
          );
      }
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
