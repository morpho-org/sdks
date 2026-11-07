import { type Address, type Hex, isAddressEqual, zeroAddress } from "viem";
import { VaultV2Errors } from "../../errors.js";
import { MathLib, type RoundingDirection } from "../../math/index.js";
import { type IToken, WrappedToken } from "../../token/index.js";
import type { BigIntish, Hash } from "../../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../../utils.js";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter.js";
import { VaultV2Utils } from "./VaultV2Utils.js";

/** Plain input shape for one Vault V2 liquidity allocation. */
export interface IVaultV2Allocation {
  id: Hash;
  absoluteCap: bigint;
  relativeCap: bigint;
  allocation: bigint;
}

/**
 * Plain input shape for a Morpho Vault V2.
 *
 * Build it with `fetchVaultV2` or `fetchAccrualVaultV2` from `@morpho-org/blue-sdk-viem` (or
 * `getData()` on a `@morpho-org/morpho-sdk` Vault V2 entity) and don't edit its fields afterwards:
 * `@morpho-org/morpho-sdk` derives the deposit share-price bound, the withdrawal and in-kind
 * redemption share allowances, the force-withdraw share-price floor and the Vault V1 `migrateToV2`
 * destination share-price bound from them and does not check them against the chain.
 */
export interface IVaultV2 extends IToken {
  asset: Address;
  /**
   * Stored total assets at `lastUpdate`, excluding virtually accrued interest.
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
  /**
   * Whether the performance fee recipient can receive vault shares. Defaults to `true`;
   * `fetchVaultV2` reads it with `canReceiveShares` when the performance fee is nonzero. Set it
   * explicitly when building a snapshot by hand.
   */
  performanceFeeRecipientCanReceiveShares?: boolean;
  /**
   * Whether the management fee recipient can receive vault shares. Defaults to `true`;
   * `fetchVaultV2` reads it with `canReceiveShares` when the management fee is nonzero. Set it
   * explicitly when building a snapshot by hand.
   */
  managementFeeRecipientCanReceiveShares?: boolean;
  /**
   * Vault shares held by `DEAD_ADDRESS` (the vault's dead deposit). `fetchVaultV2` and
   * `fetchAccrualVaultV2` read it; `undefined` when the snapshot was not fetched with it.
   */
  readonly deadShares?: bigint;
  /**
   * `deadShares` converted to assets by the vault's `convertToAssets` at the fetched block (rounded
   * down). `undefined` when the snapshot was not fetched with it.
   */
  readonly deadAssets?: bigint;
  /**
   * Absolute caps keyed by cap id. `fetchAccrualVaultV2` fills it for every adapter's own cap id
   * (`adapterCapId`) and, for market adapters, every market's `adapterMarketCapId`, so validators
   * can skip zero-cap entries. `undefined` when the snapshot was not fetched with it.
   */
  readonly absoluteCaps?: Readonly<Record<Hash, bigint>>;
}

/** Represents a Morpho Vault V2 and its fee, adapter, and accounting state. */
export class VaultV2 extends WrappedToken implements IVaultV2 {
  public readonly asset: Address;

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
  /** Whether the performance fee recipient can receive vault shares. */
  public performanceFeeRecipientCanReceiveShares;
  /** Whether the management fee recipient can receive vault shares. */
  public managementFeeRecipientCanReceiveShares;
  /** Vault shares held by `DEAD_ADDRESS`; `undefined` when not fetched. */
  public readonly deadShares?: bigint;
  /** `deadShares` converted to assets at the fetched block; `undefined` when not fetched. */
  public readonly deadAssets?: bigint;
  /** Absolute caps keyed by cap id; `undefined` when not fetched. */
  public readonly absoluteCaps?: Readonly<Record<Hash, bigint>>;

  constructor({
    asset,
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
    performanceFeeRecipientCanReceiveShares = true,
    managementFeeRecipientCanReceiveShares = true,
    deadShares,
    deadAssets,
    absoluteCaps,
    ...config
  }: IVaultV2) {
    super(config, asset);

    this.asset = asset;
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
    this.performanceFeeRecipientCanReceiveShares =
      performanceFeeRecipientCanReceiveShares;
    this.managementFeeRecipientCanReceiveShares =
      managementFeeRecipientCanReceiveShares;
    if (deadShares != null) this.deadShares = deadShares;
    if (deadAssets != null) this.deadAssets = deadAssets;
    if (absoluteCaps != null) this.absoluteCaps = absoluteCaps;
  }

  /**
   * Converts Vault V2 shares to underlying assets using the stored pre-accrual totals.
   *
   * Pairs `_totalAssets` with `totalSupply` and rounds down. Accrue the vault first when a
   * post-accrual conversion is required.
   *
   * @param shares - Vault shares to convert, in the share token's smallest unit.
   * @returns The equivalent underlying assets, rounded down to the asset token's smallest unit.
   * @throws {DivisionByZeroError} when `totalSupply + virtualShares` is zero.
   * @example
   * ```ts
   * import { fetchVaultV2 } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const vault = await fetchVaultV2(vaultV2Address, client);
   * const assets = vault.toAssets(1_000_000_000_000_000_000n);
   * // assets satisfies bigint
   * ```
   */
  public toAssets(shares: BigIntish) {
    return this._unwrap(shares, "Down");
  }

  /**
   * Converts underlying assets to Vault V2 shares using the stored pre-accrual totals.
   *
   * Pairs `_totalAssets` with `totalSupply`. Accrue the vault first when a post-accrual conversion
   * is required.
   *
   * @param assets - Underlying assets to convert, in the asset token's smallest unit.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The equivalent amount of Vault V2 shares, rounded in the requested direction.
   * @example
   * ```ts
   * import { fetchVaultV2 } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const vault = await fetchVaultV2(vaultV2Address, client);
   * const shares = vault.toShares(1_000_000n, "Up");
   * // shares satisfies bigint
   * ```
   */
  public toShares(assets: BigIntish, rounding: RoundingDirection = "Down") {
    return this._wrap(assets, rounding);
  }

  protected _wrap(amount: BigIntish, rounding: RoundingDirection) {
    // Pair pre-accrue `_totalAssets` with pre-accrue `totalSupply`; call `AccrualVaultV2.accrueInterest` for post-accrue math.
    return MathLib.mulDiv(
      amount,
      this.totalSupply + this.virtualShares,
      this._totalAssets + 1n,
      rounding,
    );
  }

  protected _unwrap(amount: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(
      amount,
      this._totalAssets + 1n,
      this.totalSupply + this.virtualShares,
      rounding,
    );
  }
}

/** Plain input shape for a Morpho Vault V2 paired with accrued adapter state. */
export interface IAccrualVaultV2 extends Omit<IVaultV2, "adapters"> {}

/**
 * Represents a Morpho Vault V2 with accrued adapter and liquidity state.
 *
 * Build it with `fetchAccrualVaultV2` from `@morpho-org/blue-sdk-viem` (or `getData()` on a
 * `@morpho-org/morpho-sdk` Vault V2 entity) and don't edit its state afterwards, including
 * `accrualLiquidityAdapter`, `accrualAdapters`, `assetBalance` and `forceDeallocatePenalties`:
 * `@morpho-org/morpho-sdk` derives its slippage and share-price bounds from this state and does not
 * check it against the chain.
 */
export class AccrualVaultV2 extends VaultV2 implements IAccrualVaultV2 {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
   * Returns the vault's deposit capacity for a requested underlying asset amount.
   * Headroom accounts for interest accrued since the last allocation, as of the vault's
   * accrual timestamp, not the eventual inclusion time. Accruing only to the current block
   * is insufficient for cap-limited MAX deposits: interest earned before inclusion can
   * make them revert. Callers must project to their expected inclusion time plus a margin
   * for delays, and refresh the quote if that horizon expires. No buffer is added internally;
   * changes to rates, allocations or caps can still invalidate the quote.
   * Uses the liquidity adapter's optional `pendingAllocationIncrease` before cap checks.
   * Pending interest uses the liquidity adapter's nested market or Vault V1 snapshot, so
   * first call `accrueInterest` at that buffered inclusion timestamp; if it is not after
   * the vault's `lastUpdate`, nested adapters are not accrued and pending may be understated.
   * A Vault V1 liquidity adapter with zero parent allocation also skips accrual, so residual
   * shares are valued at its unaccrued Vault V1 snapshot.
   *
   * Returns the requested amount when no liquidity adapter is configured. Otherwise, applies the
   * liquidity adapter's capacity and every hydrated absolute and relative allocation cap.
   *
   * @param assets - Maximum underlying assets to deposit, in the asset token's smallest unit.
   * @returns A capacity limit containing the depositable asset amount and its binding reason.
   * @throws {VaultV2Errors.UnsupportedLiquidityAdapter} when a nonzero liquidity adapter lacks
   *   hydrated adapter state or allocation-cap state.
   * @throws {InvalidMarketParamsError} when a configured Morpho Blue market liquidity adapter's
   *   liquidity data cannot be decoded.
   * @example
   * ```ts
   * import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const fetched = await fetchAccrualVaultV2(vaultV2Address, client);
   * const { timestamp } = await client.getBlock();
   * // Illustrative delays; choose both for the chain and transaction submission path.
   * const expectedInclusionTimestamp = timestamp + 30n;
   * const inclusionMargin = 30n;
   * const { vault } = fetched.accrueInterest(expectedInclusionTimestamp + inclusionMargin);
   * const limit = vault.maxDeposit(1_000_000n);
   * // limit satisfies CapacityLimit
   * ```
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

    const pending =
      this.accrualLiquidityAdapter?.pendingAllocationIncrease?.(
        this.liquidityData,
        this.liquidityAllocations,
      ) ?? 0n;
    for (const allocation of this.liquidityAllocations) {
      const allocationLimit = VaultV2Utils.allocationHeadroom(
        { ...allocation, allocation: allocation.allocation + pending },
        this._totalAssets,
      );
      if (liquidityAdapterLimit.value > allocationLimit.value)
        liquidityAdapterLimit = allocationLimit;
    }

    return liquidityAdapterLimit;
  }

  /**
   * Returns the underlying assets withdrawable for a requested Vault V2 share amount.
   *
   * Caps the converted assets by the vault's asset balance plus its hydrated liquidity adapter's
   * withdrawal capacity. A Vault V1 liquidity adapter with zero parent allocation contributes
   * zero, even when it still holds residual Vault V1 shares.
   *
   * @param shares - Maximum Vault V2 shares to redeem, in the share token's smallest unit.
   * @returns A capacity limit containing the withdrawable asset amount and either the `balance` or
   *   `liquidity` limiting reason.
   * @throws {DivisionByZeroError} when `totalSupply + virtualShares` is zero.
   * @throws {InvalidMarketParamsError} when a configured Morpho Blue market liquidity adapter's
   *   liquidity data cannot be decoded.
   * @example
   * ```ts
   * import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const vault = await fetchAccrualVaultV2(vaultV2Address, client);
   * const limit = vault.maxWithdraw(1_000_000_000_000_000_000n);
   * // limit satisfies CapacityLimit
   * ```
   */
  public maxWithdraw(shares: BigIntish): CapacityLimit {
    const assets = this.toAssets(shares);

    let liquidity = this.assetBalance;
    if (
      this.liquidityAdapter !== zeroAddress &&
      this.accrualLiquidityAdapter != null
    )
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
   * Projects the vault's interest and fee accounting to a timestamp without mutating this instance.
   *
   * Sums the vault's asset balance and every adapter's projected real assets, caps asset growth by
   * `maxRate`, and mints projected performance and management fee shares. A fee share amount is
   * zero when its recipient cannot receive vault shares.
   * Timestamps before this vault's `lastUpdate` return an unchanged copy and zero fee
   * shares without accruing nested adapters. At `lastUpdate`, loss realization still runs,
   * matching the vault contract's zero-elapsed accrual. At or after `lastUpdate`, every adapter
   * implementing `accrueInterest` is projected to `timestamp`; contributing nested markets and
   * positions are advanced only when older than `timestamp`. When registered among
   * `accrualAdapters`, the liquidity adapter reuses that accrued instance, while an unregistered
   * liquidity adapter remains unchanged.
   * Adapters without `accrueInterest`, zero-allocation or zero-share Vault V1 adapters, and nested
   * markets already ahead of `timestamp` keep their snapshots.
   *
   * @param timestamp - Accrual timestamp in seconds.
   * @returns An object containing the accrued `AccrualVaultV2`, projected performance fee shares,
   *   and projected management fee shares.
   * @throws {UnknownMarketAllocationError} when a nested Vault V1 withdraw queue references a
   *   market without matching allocation state.
   * @throws {UnsupportedMarketIrmError} when forward projection of an underlying market with positive
   *   debt requires an unsupported IRM.
   * @example
   * ```ts
   * import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
   * const block = await client.getBlock();
   * const vault = await fetchAccrualVaultV2(vaultV2Address, client, {
   *   blockNumber: block.number,
   * });
   * const result = vault.accrueInterest(block.timestamp);
   * // result satisfies {
   * //   vault: AccrualVaultV2;
   * //   performanceFeeShares: bigint;
   * //   managementFeeShares: bigint;
   * // }
   * ```
   */
  public accrueInterest(timestamp: BigIntish) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.lastUpdate;
    if (elapsed < 0n) {
      const vault = new AccrualVaultV2(
        this,
        this.accrualLiquidityAdapter,
        this.accrualAdapters,
        this.assetBalance,
        this.forceDeallocatePenalties,
      );
      return { vault, performanceFeeShares: 0n, managementFeeShares: 0n };
    }

    const accrualAdapters = this.accrualAdapters.map(
      (adapter) => adapter.accrueInterest?.(timestamp) ?? adapter,
    );
    const liquidityAdapter = this.accrualLiquidityAdapter;
    const accrualLiquidityAdapter =
      liquidityAdapter &&
      (accrualAdapters.find((adapter) =>
        isAddressEqual(adapter.address, liquidityAdapter.address),
      ) ??
        liquidityAdapter);

    const vault = new AccrualVaultV2(
      this,
      accrualLiquidityAdapter,
      accrualAdapters,
      this.assetBalance,
      this.forceDeallocatePenalties,
    );

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
      interest > 0n &&
      vault.performanceFee > 0n &&
      vault.performanceFeeRecipientCanReceiveShares
        ? MathLib.wMulDown(interest, vault.performanceFee)
        : 0n;
    const managementFeeAssets =
      elapsed > 0n &&
      vault.managementFee > 0n &&
      vault.managementFeeRecipientCanReceiveShares
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

    vault._totalAssets = newTotalAssets;
    if (performanceFeeShares) vault.totalSupply += performanceFeeShares;
    if (managementFeeShares) vault.totalSupply += managementFeeShares;
    vault.lastUpdate = timestamp;

    return { vault, performanceFeeShares, managementFeeShares };
  }
}
