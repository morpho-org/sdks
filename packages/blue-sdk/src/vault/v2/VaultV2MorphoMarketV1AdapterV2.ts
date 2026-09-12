import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";
import {
  type Market,
  MarketParams,
  marketParamsAbi,
} from "../../market/index.js";
import type { BigIntish, Hash, MarketId } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
import type {
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { VaultV2Adapter } from "./VaultV2Adapter.js";

/** Plain input shape for a Vault V2 Morpho Blue market adapter using market ids. */
export interface IVaultV2MorphoMarketV1AdapterV2
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  type?: "VaultV2MorphoMarketV1AdapterV2";
  marketIds: MarketId[];
  adaptiveCurveIrm: Address;
  supplyShares: Record<MarketId, bigint>;
}

/** Represents a Vault V2 Morpho Blue market adapter using market ids. */
export class VaultV2MorphoMarketV1AdapterV2
  extends VaultV2Adapter
  implements IVaultV2MorphoMarketV1AdapterV2
{
  public declare readonly type: "VaultV2MorphoMarketV1AdapterV2";

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1AdapterV2.adapterCapId(adapter);
   * ```
   */
  static adapterCapId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", address],
      ),
    );
  }

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @deprecated Use {@link VaultV2MorphoMarketV1AdapterV2.adapterCapId}.
   */
  static adapterId(address: Address) {
    return VaultV2MorphoMarketV1AdapterV2.adapterCapId(address);
  }

  /**
   * Returns the collateral-wide allocation-cap id.
   *
   * @param address - Collateral token address.
   * @returns The collateral-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1AdapterV2.collateralCapId(collateral);
   * ```
   */
  static collateralCapId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", address],
      ),
    );
  }

  /**
   * Returns the collateral-wide allocation-cap id.
   *
   * @param address - Collateral token address.
   * @returns The collateral-wide allocation-cap id.
   * @deprecated Use {@link VaultV2MorphoMarketV1AdapterV2.collateralCapId}.
   */
  static collateralId(address: Address) {
    return VaultV2MorphoMarketV1AdapterV2.collateralCapId(address);
  }

  /**
   * Returns the adapter-market allocation-cap id.
   *
   * @param address - Adapter address.
   * @param params - Morpho Blue market parameters.
   * @returns The adapter-market allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(
   *   adapter,
   *   marketParams,
   * );
   * ```
   */
  static adapterMarketCapId(address: Address, params: MarketParams) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", address, params],
      ),
    );
  }

  /**
   * Returns the adapter-market allocation-cap id.
   *
   * @param address - Adapter address.
   * @param params - Morpho Blue market parameters.
   * @returns The adapter-market allocation-cap id.
   * @deprecated Use {@link VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId}.
   */
  static marketParamsId(address: Address, params: MarketParams) {
    return VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(address, params);
  }

  public marketIds: MarketId[];
  public adaptiveCurveIrm: Address;
  public supplyShares: Record<MarketId, bigint>;

  constructor({
    marketIds,
    adaptiveCurveIrm,
    supplyShares,
    ...vaultV2Adapter
  }: IVaultV2MorphoMarketV1AdapterV2) {
    super({
      ...vaultV2Adapter,
      type: "VaultV2MorphoMarketV1AdapterV2",
      adapterId: VaultV2MorphoMarketV1AdapterV2.adapterCapId(
        vaultV2Adapter.address,
      ),
    });

    this.marketIds = marketIds;
    this.adaptiveCurveIrm = adaptiveCurveIrm;
    this.supplyShares = supplyShares;
  }

  /**
   * Returns this adapter's allocation-cap ids for a Morpho Blue market.
   *
   * @param params - Morpho Blue market parameters.
   * @returns A readonly tuple containing the adapter, collateral, and adapter-market
   *   allocation-cap ids, in that order.
   * @example
   * ```ts
   * import {
   *   MarketParams,
   *   VaultV2MorphoMarketV1AdapterV2,
   * } from "@morpho-org/blue-sdk";
   * import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
   *
   * const marketParams = MarketParams.idle(ZERO_ADDRESS);
   * const adapter = new VaultV2MorphoMarketV1AdapterV2({
   *   address: ZERO_ADDRESS,
   *   parentVault: ZERO_ADDRESS,
   *   skimRecipient: ZERO_ADDRESS,
   *   marketIds: [],
   *   adaptiveCurveIrm: ZERO_ADDRESS,
   *   supplyShares: {},
   * });
   * const [adapterCapId, collateralCapId, adapterMarketCapId] =
   *   adapter.ids(marketParams);
   * ```
   */
  public ids(
    params: MarketParams,
  ): readonly [
    adapterCapId: Hash,
    collateralCapId: Hash,
    adapterMarketCapId: Hash,
  ] {
    return [
      this.adapterId,
      VaultV2MorphoMarketV1AdapterV2.collateralCapId(params.collateralToken),
      VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(this.address, params),
    ];
  }
}

/** Plain input shape for an accrued Vault V2 Morpho Blue market-id adapter. */
export interface IAccrualVaultV2MorphoMarketV1AdapterV2
  extends IVaultV2MorphoMarketV1AdapterV2 {}

/** Represents an accrued Vault V2 Morpho Blue market-id adapter. */
export class AccrualVaultV2MorphoMarketV1AdapterV2
  extends VaultV2MorphoMarketV1AdapterV2
  implements IAccrualVaultV2MorphoMarketV1AdapterV2, IAccrualVaultV2Adapter
{
  constructor(
    adapter: IAccrualVaultV2MorphoMarketV1AdapterV2,
    public markets: Market[],
  ) {
    super(adapter);
  }

  realAssets(timestamp?: BigIntish) {
    return this.markets.reduce(
      (total, market) =>
        total +
        market
          .accrueInterest(timestamp)
          .toSupplyAssets(this.supplyShares[market.id] ?? 0n),
      0n,
    );
  }

  /**
   * Returns a new adapter whose underlying markets have been accrued up to the
   * given timestamp.
   * @param timestamp The timestamp at which to accrue interest. Must be greater
   * than or equal to each market's `lastUpdate`.
   * @returns A new `AccrualVaultV2MorphoMarketV1AdapterV2` with every market
   * accrued to `timestamp`.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes a
   * market's `lastUpdate`.
   * @example
   * ```ts
   * const accrued = adapter.accrueInterest(adapter.markets[0]!.lastUpdate);
   * // accrued.markets[0]!.lastUpdate === the passed timestamp
   * ```
   */
  accrueInterest(timestamp: BigIntish) {
    return new AccrualVaultV2MorphoMarketV1AdapterV2(
      this,
      this.markets.map((market) => market.accrueInterest(timestamp)),
    );
  }

  maxDeposit(_data: Hex, assets: BigIntish) {
    return {
      value: BigInt(assets),
      limiter: CapacityLimitReason.balance,
    };
  }

  maxWithdraw(data: Hex) {
    const marketId = MarketParams.fromHex(data).id;
    // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
    const market = this.markets.find((market) => market.id === marketId);

    return (
      market?.getWithdrawCapacityLimit({
        supplyShares: this.supplyShares[marketId] ?? 0n,
      }) ?? {
        value: 0n,
        limiter: CapacityLimitReason.position,
      }
    );
  }
}
