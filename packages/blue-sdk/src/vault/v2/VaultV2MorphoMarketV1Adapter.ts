import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";
import {
  type IMarketParams,
  MarketParams,
  marketParamsAbi,
} from "../../market/index.js";
import type { AccrualPosition } from "../../position/index.js";
import type { BigIntish } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
import type {
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { VaultV2Adapter } from "./VaultV2Adapter.js";

/** Plain input shape for a Vault V2 adapter investing in Morpho Blue markets. */
export interface IVaultV2MorphoMarketV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  type?: "VaultV2MorphoMarketV1Adapter";
  marketParamsList: IMarketParams[];
}

/** Represents a Vault V2 adapter investing in Morpho Blue markets. */
export class VaultV2MorphoMarketV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoMarketV1Adapter
{
  public declare readonly type: "VaultV2MorphoMarketV1Adapter";

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.adapterCapId(adapter);
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

  /** @deprecated Use {@link VaultV2MorphoMarketV1Adapter.adapterCapId}. */
  static adapterId(address: Address) {
    return VaultV2MorphoMarketV1Adapter.adapterCapId(address);
  }

  /**
   * Returns the collateral-wide allocation-cap id.
   *
   * @param address - Collateral token address.
   * @returns The collateral-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.collateralCapId(collateral);
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

  /** @deprecated Use {@link VaultV2MorphoMarketV1Adapter.collateralCapId}. */
  static collateralId(address: Address) {
    return VaultV2MorphoMarketV1Adapter.collateralCapId(address);
  }

  /**
   * Returns the adapter-market allocation-cap id.
   *
   * @param address - Adapter address.
   * @param params - Morpho Blue market parameters.
   * @returns The adapter-market allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.adapterMarketCapId(
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
   * @deprecated Use {@link VaultV2MorphoMarketV1Adapter.adapterMarketCapId}.
   */
  static marketParamsId(address: Address, params: MarketParams) {
    return VaultV2MorphoMarketV1Adapter.adapterMarketCapId(address, params);
  }

  public marketParamsList: MarketParams[];

  constructor({
    marketParamsList,
    ...vaultV2Adapter
  }: IVaultV2MorphoMarketV1Adapter) {
    super({
      ...vaultV2Adapter,
      type: "VaultV2MorphoMarketV1Adapter",
      adapterId: VaultV2MorphoMarketV1Adapter.adapterCapId(
        vaultV2Adapter.address,
      ),
    });

    this.marketParamsList = marketParamsList.map(
      (params) => new MarketParams(params),
    );
  }

  public ids(params: MarketParams) {
    return [
      this.adapterId,
      VaultV2MorphoMarketV1Adapter.collateralCapId(params.collateralToken),
      VaultV2MorphoMarketV1Adapter.adapterMarketCapId(this.address, params),
    ];
  }
}

/** Plain input shape for an accrued Morpho Blue market Vault V2 adapter. */
export interface IAccrualVaultV2MorphoMarketV1Adapter
  extends IVaultV2MorphoMarketV1Adapter {}

/** Represents an accrued Morpho Blue market Vault V2 adapter. */
export class AccrualVaultV2MorphoMarketV1Adapter
  extends VaultV2MorphoMarketV1Adapter
  implements IAccrualVaultV2MorphoMarketV1Adapter, IAccrualVaultV2Adapter
{
  constructor(
    adapter: IAccrualVaultV2MorphoMarketV1Adapter,
    public positions: AccrualPosition[],
  ) {
    super(adapter);
  }

  realAssets(timestamp?: BigIntish) {
    return this.positions.reduce(
      (total, position) =>
        total + position.accrueInterest(timestamp).supplyAssets,
      0n,
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
    const position = this.positions.find(
      // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
      (position) => position.marketId === marketId,
    );

    return (
      position?.market?.getWithdrawCapacityLimit(position) ?? {
        value: 0n,
        limiter: CapacityLimitReason.position,
      }
    );
  }
}
