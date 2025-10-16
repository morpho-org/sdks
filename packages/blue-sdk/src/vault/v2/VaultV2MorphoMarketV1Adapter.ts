import {
  type Address,
  type Hex,
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { type IMarketParams, MarketParams } from "../../market";
import type { AccrualPosition } from "../../position";
import type { BigIntish } from "../../types";
import { CapacityLimitReason } from "../../utils";
import { VaultV2Adapter } from "./VaultV2Adapter";
import type { IAccrualVaultV2Adapter, IVaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2MorphoMarketV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId"> {
  marketParamsList: IMarketParams[];
}

const marketParamsAbi = {
  type: "tuple",
  components: [
    { type: "address", name: "loanToken" },
    { type: "address", name: "collateralToken" },
    { type: "address", name: "oracle" },
    { type: "address", name: "irm" },
    { type: "uint256", name: "lltv" },
  ],
} as const;

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

  maxWithdraw(_data: Hex) {
    const [marketParams] = decodeAbiParameters([marketParamsAbi], _data);
    const marketId = new MarketParams(marketParams).id;
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
}
