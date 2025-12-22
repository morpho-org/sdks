import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";
import { type Market, MarketParams, marketParamsAbi } from "../../market";
import type { BigIntish, MarketId } from "../../types";
import { CapacityLimitReason } from "../../utils";
import { VaultV2Adapter } from "./VaultV2Adapter";
import type { IAccrualVaultV2Adapter, IVaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2MorphoMarketV1AdapterV2
  extends Omit<IVaultV2Adapter, "adapterId"> {
  marketIds: MarketId[];
  adaptiveCurveIrm: Address;
  supplyShares: Record<MarketId, bigint>;
}

export class VaultV2MorphoMarketV1AdapterV2
  extends VaultV2Adapter
  implements IVaultV2MorphoMarketV1AdapterV2
{
  static adapterId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", address],
      ),
    );
  }

  static collateralId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", address],
      ),
    );
  }

  static marketParamsId(address: Address, params: MarketParams) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", address, params],
      ),
    );
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
      adapterId: VaultV2MorphoMarketV1AdapterV2.adapterId(
        vaultV2Adapter.address,
      ),
    });

    this.marketIds = marketIds;
    this.adaptiveCurveIrm = adaptiveCurveIrm;
    this.supplyShares = supplyShares;
  }

  public ids(params: MarketParams) {
    return [
      this.adapterId,
      VaultV2MorphoMarketV1AdapterV2.collateralId(params.collateralToken),
      VaultV2MorphoMarketV1AdapterV2.marketParamsId(this.address, params),
    ];
  }
}

export interface IAccrualVaultV2MorphoMarketV1AdapterV2
  extends IVaultV2MorphoMarketV1AdapterV2 {}

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

  maxDeposit(_data: Hex, assets: BigIntish) {
    return {
      value: BigInt(assets),
      limiter: CapacityLimitReason.balance,
    };
  }

  maxWithdraw(data: Hex) {
    const marketId = MarketParams.fromHex(data).id;
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
