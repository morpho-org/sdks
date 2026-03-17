import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";
import {
  type IMarketParams,
  MarketParams,
  marketParamsAbi,
} from "../../market/index.js";
import { MathLib } from "../../math/index.js";
import type { AccrualPosition } from "../../position/index.js";
import type { BigIntish, MarketId } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
import { VaultV2Adapter } from "./VaultV2Adapter.js";
import type {
  AdapterDeallocatableResult,
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
  MarketDeallocatableData,
} from "./VaultV2Adapter.js";

export interface IVaultV2MorphoMarketV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId"> {
  marketParamsList: IMarketParams[];
}

export class VaultV2MorphoMarketV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoMarketV1Adapter
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

  public marketParamsList: MarketParams[];

  constructor({
    marketParamsList,
    ...vaultV2Adapter
  }: IVaultV2MorphoMarketV1Adapter) {
    super({
      ...vaultV2Adapter,
      adapterId: VaultV2MorphoMarketV1Adapter.adapterId(vaultV2Adapter.address),
    });

    this.marketParamsList = marketParamsList.map(
      (params) => new MarketParams(params),
    );
  }

  public ids(params: MarketParams) {
    return [
      this.adapterId,
      VaultV2MorphoMarketV1Adapter.collateralId(params.collateralToken),
      VaultV2MorphoMarketV1Adapter.marketParamsId(this.address, params),
    ];
  }
}

export interface IAccrualVaultV2MorphoMarketV1Adapter
  extends IVaultV2MorphoMarketV1Adapter {}

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
      (position) => position.marketId === marketId,
    );

    return (
      position?.market?.getWithdrawCapacityLimit(position) ?? {
        value: 0n,
        limiter: CapacityLimitReason.position,
      }
    );
  }

  maxDeallocatableAssets(): Map<MarketId, MarketDeallocatableData> {
    const result = new Map<MarketId, MarketDeallocatableData>();
    for (const position of this.positions) {
      const supplyAssets = position.market.toSupplyAssets(
        position.supplyShares,
      );
      const { liquidity } = position.market;
      const existing = result.get(position.marketId);
      if (existing) {
        existing.supplyAssets += supplyAssets;
      } else {
        result.set(position.marketId, { supplyAssets, liquidity });
      }
    }
    return result;
  }

  computeActualDeallocatable(
    remainingLiquidity: ReadonlyMap<MarketId, bigint>,
  ): AdapterDeallocatableResult {
    const consumed = new Map<MarketId, bigint>();
    let total = 0n;
    for (const [marketId, { supplyAssets }] of this.maxDeallocatableAssets()) {
      const remaining = remainingLiquidity.get(marketId) ?? 0n;
      const c = MathLib.min(supplyAssets, remaining);
      consumed.set(marketId, c);
      total += c;
    }
    return { consumed, total };
  }
}
