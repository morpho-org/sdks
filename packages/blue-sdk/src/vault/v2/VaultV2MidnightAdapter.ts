import type { Address, BigIntish, Hash } from "../../types.js";
import { type IVaultV2Adapter, VaultV2Adapter } from "./VaultV2Adapter.js";
import {
  type IVaultV2MidnightAdapterCollateralParams,
  type IVaultV2MidnightAdapterMarket,
  type IVaultV2MidnightAdapterMarketData,
  type VaultV2MidnightAdapterMarketData,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";
import { VaultV2Utils } from "./VaultV2Utils.js";

/** Plain input shape for a Vault V2 Midnight adapter. */
export interface IVaultV2MidnightAdapter
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  readonly type?: "VaultV2MidnightAdapter";
  /** Vault asset address. */
  readonly asset: Address;
  /** Midnight contract address. */
  readonly midnight: Address;
  /** Midnight market ids the adapter holds positions in (at most 250). */
  readonly marketIds: readonly Hash[];
  /** Stored per-market data keyed by Midnight market id: `netCredit` in asset units, `rate` WAD-scaled per second, `maturity` as a Unix timestamp in seconds. */
  readonly marketData: Readonly<
    Record<Hash, IVaultV2MidnightAdapterMarketData>
  >;
  /** Ascending duration-cap thresholds in seconds. */
  readonly durations: readonly BigIntish[];
  /** Stored cumulative net-credit totals in asset units: entry `i` sums `marketData.netCredit` over markets with `max(maturity - block.timestamp, 0) >= durations[i]` (inclusive, overlapping, not disjoint buckets). */
  readonly durationAllocations: readonly BigIntish[];
  /** Maximum time to maturity accepted on buys, in seconds. */
  readonly maxTtm: BigIntish;
  /** Minimum rate accepted on buys, WAD-scaled per second. */
  readonly minRate: BigIntish;
  /** Whether sales are blocked while the adapter has a shortfall. */
  readonly noSalesWithShortfall: boolean;
  /** Whether sales below face value are blocked. */
  readonly noSalesBelowFaceValue: boolean;
}

/**
 * Represents a Vault V2 adapter investing in Midnight markets. Allocation on
 * Midnight market IDs is face-value net credit, which can exceed discounted
 * `realAssets` before maturity; cap headroom is consumed at face value.
 */
export class VaultV2MidnightAdapter
  extends VaultV2Adapter
  implements IVaultV2MidnightAdapter
{
  /** Adapter type discriminator. */
  public declare readonly type: "VaultV2MidnightAdapter";
  /** Vault asset address. */
  public readonly asset: Address;
  /** Midnight contract address. */
  public readonly midnight: Address;
  /** Midnight market ids the adapter holds positions in (at most 250). */
  public readonly marketIds: readonly Hash[];
  /** Stored per-market data keyed by Midnight market id: `netCredit` in asset units, `rate` WAD-scaled per second, `maturity` as a Unix timestamp in seconds. */
  public readonly marketData: Readonly<
    Record<Hash, VaultV2MidnightAdapterMarketData>
  >;
  /** Ascending duration-cap thresholds in seconds. */
  public readonly durations: readonly bigint[];
  /** Stored cumulative net-credit totals in asset units: entry `i` sums `marketData.netCredit` over markets with `max(maturity - block.timestamp, 0) >= durations[i]` (inclusive, overlapping, not disjoint buckets). */
  public readonly durationAllocations: readonly bigint[];
  /** Maximum time to maturity accepted on buys, in seconds. */
  public readonly maxTtm: bigint;
  /** Minimum rate accepted on buys, WAD-scaled per second. */
  public readonly minRate: bigint;
  /** Whether sales are blocked while the adapter has a shortfall. */
  public readonly noSalesWithShortfall: boolean;
  /** Whether sales below face value are blocked. */
  public readonly noSalesBelowFaceValue: boolean;

  /**
   * Returns the adapter allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter allocation-cap id.
   * @throws {viem.InvalidAddressError} when `address` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.adapterCapId(
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  static adapterCapId(address: Address): Hash {
    return VaultV2Utils.adapterCapId(address);
  }

  /**
   * Returns the collateral-token allocation-cap id.
   *
   * @param token - Collateral token address.
   * @returns The collateral-token allocation-cap id.
   * @throws {viem.InvalidAddressError} when `token` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.collateralTokenCapId(
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  static collateralTokenCapId(token: Address): Hash {
    return VaultV2MidnightAdapterUtils.collateralTokenCapId(token);
  }

  /**
   * Returns the collateral-parameters allocation-cap id.
   *
   * @param params - Midnight collateral parameters.
   * @returns The collateral-parameters allocation-cap id.
   * @throws {viem.InvalidAddressError} when `params.token` or `params.oracle` is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when `params.lltv` or `params.liquidationCursor` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.collateralParamsCapId({
   *   token: "0x0000000000000000000000000000000000000001",
   *   lltv: 860000000000000000n,
   *   liquidationCursor: 800000000000000000n,
   *   oracle: "0x0000000000000000000000000000000000000002",
   * });
   * ```
   */
  static collateralParamsCapId(
    params: IVaultV2MidnightAdapterCollateralParams,
  ): Hash {
    return VaultV2MidnightAdapterUtils.collateralParamsCapId(params);
  }

  /**
   * Returns an enter-gate allocation-cap id.
   *
   * @param gate - Enter-gate address.
   * @returns The enter-gate allocation-cap id.
   * @throws {viem.InvalidAddressError} when `gate` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.enterGateCapId(
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  static enterGateCapId(gate: Address): Hash {
    return VaultV2MidnightAdapterUtils.gateCapId("enterGate", gate);
  }

  /**
   * Returns a liquidator-gate allocation-cap id.
   *
   * @param gate - Liquidator-gate address.
   * @returns The liquidator-gate allocation-cap id.
   * @throws {viem.InvalidAddressError} when `gate` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.liquidatorGateCapId(
   *   "0x0000000000000000000000000000000000000001",
   * );
   * ```
   */
  static liquidatorGateCapId(gate: Address): Hash {
    return VaultV2MidnightAdapterUtils.gateCapId("liquidatorGate", gate);
  }

  /**
   * Returns an RCF-threshold allocation-cap id.
   *
   * @param threshold - RCF threshold.
   * @returns The RCF-threshold allocation-cap id.
   * @throws {viem.IntegerOutOfRangeError} when `threshold` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.rcfThresholdCapId(1n);
   * ```
   */
  static rcfThresholdCapId(threshold: BigIntish): Hash {
    return VaultV2MidnightAdapterUtils.rcfThresholdCapId(threshold);
  }

  /**
   * Returns a duration allocation-cap id.
   *
   * @param address - Adapter address.
   * @param duration - Duration in seconds.
   * @returns The duration allocation-cap id.
   * @throws {viem.InvalidAddressError} when `address` is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when `duration` is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.durationCapId(
   *   "0x0000000000000000000000000000000000000001",
   *   3600n,
   * );
   * ```
   */
  static durationCapId(address: Address, duration: BigIntish): Hash {
    return VaultV2MidnightAdapterUtils.durationCapId(address, duration);
  }

  constructor({
    address,
    parentVault,
    asset,
    skimRecipient,
    midnight,
    marketIds,
    marketData,
    durations,
    durationAllocations,
    maxTtm,
    minRate,
    noSalesWithShortfall,
    noSalesBelowFaceValue,
  }: IVaultV2MidnightAdapter) {
    super({
      type: "VaultV2MidnightAdapter",
      address,
      parentVault,
      skimRecipient,
      adapterId: VaultV2MidnightAdapter.adapterCapId(address),
    });
    this.asset = asset;
    this.midnight = midnight;
    this.marketIds = [...marketIds];
    this.marketData = Object.fromEntries(
      Object.entries(marketData).map(([id, data]) => [
        id,
        {
          netCredit: BigInt(data.netCredit),
          rate: BigInt(data.rate),
          maturity: BigInt(data.maturity),
          index: BigInt(data.index),
          forceSellable: data.forceSellable,
        },
      ]),
    );
    this.durations = durations.map(BigInt);
    this.durationAllocations = durationAllocations.map(BigInt);
    this.maxTtm = BigInt(maxTtm);
    this.minRate = BigInt(minRate);
    this.noSalesWithShortfall = noSalesWithShortfall;
    this.noSalesBelowFaceValue = noSalesBelowFaceValue;
  }

  /**
   * Returns the allocation-cap ids for a Midnight market.
   *
   * @param market - Midnight market fields used by the adapter.
   * @returns Adapter, gate, RCF-threshold, and collateral cap ids in contract order.
   * @throws {viem.InvalidAddressError} when a gate, token, or oracle is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when an integer field is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const adapter = new VaultV2MidnightAdapter({
   *   address: "0x0000000000000000000000000000000000000003",
   *   parentVault: "0x0000000000000000000000000000000000000004",
   *   skimRecipient: "0x0000000000000000000000000000000000000005",
   *   asset: "0x0000000000000000000000000000000000000006",
   *   midnight: "0x0000000000000000000000000000000000000007",
   *   marketIds: [],
   *   marketData: {},
   *   durations: [],
   *   durationAllocations: [],
   *   maxTtm: 0n,
   *   minRate: 0n,
   *   noSalesWithShortfall: false,
   *   noSalesBelowFaceValue: false,
   * });
   * const ids = adapter.ids({
   *   collateralParams: [],
   *   maturity: 3600n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000001",
   *   liquidatorGate: "0x0000000000000000000000000000000000000002",
   * });
   * ```
   */
  public ids(market: IVaultV2MidnightAdapterMarket): readonly Hash[] {
    return VaultV2MidnightAdapterUtils.ids({
      adapterId: this.adapterId,
      market,
    });
  }
}
