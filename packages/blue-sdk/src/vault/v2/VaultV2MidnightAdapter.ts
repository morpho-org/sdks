import type { Address, BigIntish, Hash } from "../../types.js";
import { type IVaultV2Adapter, VaultV2Adapter } from "./VaultV2Adapter.js";
import {
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
  /** Stored per-market data keyed by Midnight market id: `netCredit` in asset units, `netRate` WAD-scaled per second, `maturity` as a Unix timestamp in seconds. */
  readonly marketData: Readonly<
    Record<Hash, IVaultV2MidnightAdapterMarketData>
  >;
  /** Ascending duration-cap thresholds in seconds. */
  readonly durations: readonly BigIntish[];
  /** Stored cumulative net-credit totals in asset units: entry `i` sums `marketData.netCredit` over markets with `max(maturity - block.timestamp, 0) >= durations[i]` (inclusive, overlapping, not disjoint buckets). */
  readonly durationAllocations: readonly BigIntish[];
  /** Enter gate factory fixed at deployment (zero address when markets' enter gates are unrestricted). */
  readonly enterGateFactory: Address;
  /** Maximum time to maturity accepted on buys, in seconds. */
  readonly maxTtm: BigIntish;
  /** Minimum WAD-scaled net rate per second implied by a buy, relative to the paid assets. */
  readonly minNetBuyRate: BigIntish;
  /** Maximum WAD-scaled net rate per second implied by a sale, relative to the received assets; ignored for `forceSellable` markets. */
  readonly maxNetSellRate: BigIntish;
  /** Total shortfall, in asset units, that sales can still incur; ignored for `forceSellable` markets. */
  readonly shortfallAllowance: BigIntish;
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
  /** Stored per-market data keyed by Midnight market id: `netCredit` in asset units, `netRate` WAD-scaled per second, `maturity` as a Unix timestamp in seconds. */
  public readonly marketData: Readonly<
    Record<Hash, VaultV2MidnightAdapterMarketData>
  >;
  /** Ascending duration-cap thresholds in seconds. */
  public readonly durations: readonly bigint[];
  /** Stored cumulative net-credit totals in asset units: entry `i` sums `marketData.netCredit` over markets with `max(maturity - block.timestamp, 0) >= durations[i]` (inclusive, overlapping, not disjoint buckets). */
  public readonly durationAllocations: readonly bigint[];
  /** Enter gate factory fixed at deployment (zero address when markets' enter gates are unrestricted). */
  public readonly enterGateFactory: Address;
  /** Maximum time to maturity accepted on buys, in seconds. */
  public readonly maxTtm: bigint;
  /** Minimum WAD-scaled net rate per second implied by a buy, relative to the paid assets. */
  public readonly minNetBuyRate: bigint;
  /** Maximum WAD-scaled net rate per second implied by a sale, relative to the received assets; ignored for `forceSellable` markets. */
  public readonly maxNetSellRate: bigint;
  /** Total shortfall, in asset units, that sales can still incur; ignored for `forceSellable` markets. */
  public readonly shortfallAllowance: bigint;

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
   * Returns the market-family allocation-cap id (collateral params, RCF
   * threshold and liquidator gate; maturity and enter gate excluded).
   *
   * @param market - Midnight market fields used by the family id.
   * @returns The family allocation-cap id.
   * @throws {viem.InvalidAddressError} when a token, oracle, or the liquidator gate is not a valid address.
   * @throws {viem.IntegerOutOfRangeError} when an integer field is not a uint256.
   * @example
   * ```ts
   * import { VaultV2MidnightAdapter } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2MidnightAdapter.familyCapId({
   *   collateralParams: [],
   *   rcfThreshold: 0n,
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * ```
   */
  static familyCapId(
    market: Pick<
      IVaultV2MidnightAdapterMarket,
      "collateralParams" | "rcfThreshold" | "liquidatorGate"
    >,
  ): Hash {
    return VaultV2MidnightAdapterUtils.familyCapId(market);
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
    enterGateFactory,
    maxTtm,
    minNetBuyRate,
    maxNetSellRate,
    shortfallAllowance,
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
          netRate: BigInt(data.netRate),
          maturity: BigInt(data.maturity),
          index: BigInt(data.index),
          forceSellable: data.forceSellable,
          forceRemoved: data.forceRemoved,
          minForceSellPrice: BigInt(data.minForceSellPrice),
        },
      ]),
    );
    this.durations = durations.map(BigInt);
    this.durationAllocations = durationAllocations.map(BigInt);
    this.enterGateFactory = enterGateFactory;
    this.maxTtm = BigInt(maxTtm);
    this.minNetBuyRate = BigInt(minNetBuyRate);
    this.maxNetSellRate = BigInt(maxNetSellRate);
    this.shortfallAllowance = BigInt(shortfallAllowance);
  }

  /**
   * Returns the allocation-cap ids for a Midnight market.
   *
   * @param market - Midnight market fields used by the adapter.
   * @returns Adapter, family, and collateral-token cap ids in contract order.
   * @throws {viem.InvalidAddressError} when the liquidator gate, a token, or an oracle is not a valid address.
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
   *   enterGateFactory: "0x0000000000000000000000000000000000000000",
   *   maxTtm: 0n,
   *   minNetBuyRate: 0n,
   *   maxNetSellRate: 0n,
   *   shortfallAllowance: 0n,
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
