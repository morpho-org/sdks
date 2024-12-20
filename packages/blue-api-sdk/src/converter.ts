import {
  AccrualPosition,
  AccrualVault,
  type Address,
  Market,
  MarketParams,
  MathLib,
  Position,
  Token,
  Vault,
  VaultConfig,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  VaultUtils,
} from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS, isDefined } from "@morpho-org/morpho-ts";

import type {
  Chain as ApiChain,
  Market as ApiMarket,
  MarketPosition as ApiMarketPosition,
  MarketState as ApiMarketState,
  PublicAllocatorConfig as ApiPublicAllocatorConfig,
  PublicAllocatorFlowCaps as ApiPublicAllocatorFlowCaps,
  Asset as ApiToken,
  User as ApiUser,
  Vault as ApiVault,
  VaultAllocation as ApiVaultAllocation,
  VaultState as ApiVaultState,
  Maybe,
} from "./types.js";

export interface PartialApiTokenPrice {
  priceUsd?: ApiToken["priceUsd"];
  spotPriceEth?: ApiToken["spotPriceEth"];
}

export interface PartialApiToken
  extends Pick<ApiToken, "address" | "decimals" | "symbol">,
    PartialApiTokenPrice {
  name?: ApiToken["name"];
}

export interface PartialApiMarketParams
  extends Pick<ApiMarket, "oracleAddress" | "irmAddress" | "lltv"> {
  collateralAsset: Maybe<Pick<ApiToken, "address">>;
  loanAsset: Pick<ApiToken, "address">;
}

export interface PartialApiMarket
  extends PartialApiMarketParams,
    Pick<ApiMarket, "collateralPrice"> {
  state: Maybe<
    Pick<
      ApiMarketState,
      | "borrowAssets"
      | "supplyAssets"
      | "borrowShares"
      | "supplyShares"
      | "timestamp"
      | "fee"
      | "rateAtTarget"
    >
  >;
}

export interface PartialApiMarketPosition
  extends Pick<
    ApiMarketPosition,
    "supplyShares" | "borrowShares" | "collateral"
  > {
  user: Pick<ApiUser, "address">;
  market: Pick<ApiMarket, "uniqueKey">;
}

export interface PartialApiMarketAccrualPosition
  extends Omit<PartialApiMarketPosition, "market"> {
  market: PartialApiMarket;
}

export interface PartialApiVaultConfig
  extends Pick<ApiVault, "address" | "symbol" | "name"> {
  asset: Pick<ApiToken, "address" | "decimals">;
  chain: Pick<ApiChain, "id">;
}

export interface PartialApiPublicAllocatorFlowCaps
  extends Pick<ApiPublicAllocatorFlowCaps, "maxIn" | "maxOut"> {
  market: Pick<ApiMarket, "uniqueKey">;
}

export interface PartialApiPublicAllocatorConfig
  extends Pick<ApiPublicAllocatorConfig, "fee" | "accruedFee" | "admin"> {
  flowCaps: PartialApiPublicAllocatorFlowCaps[];
}

export interface PartialApiVaultAllocation
  extends Pick<ApiVaultAllocation, "supplyQueueIndex"> {
  market: PartialApiMarket & Pick<ApiMarket, "uniqueKey">;
}

export interface PartialApiVaultState
  extends Pick<
    ApiVaultState,
    | "totalAssets"
    | "totalSupply"
    | "owner"
    | "curator"
    | "guardian"
    | "fee"
    | "feeRecipient"
    | "skimRecipient"
    | "timelock"
    | "pendingGuardian"
    | "pendingGuardianValidAt"
    | "pendingOwner"
    | "pendingTimelock"
    | "pendingTimelockValidAt"
  > {
  allocation: Maybe<PartialApiVaultAllocation[]>;
}

export interface PartialApiVault
  extends PartialApiVaultConfig,
    Pick<ApiVault, "address" | "symbol" | "name"> {
  state: Maybe<PartialApiVaultState>;
  publicAllocatorConfig: Maybe<PartialApiPublicAllocatorConfig>;
}

export interface PartialApiAccrualVaultAllocation
  extends PartialApiVaultAllocation,
    Pick<
      ApiVaultAllocation,
      | "supplyShares"
      | "supplyCap"
      | "pendingSupplyCap"
      | "pendingSupplyCapValidAt"
      | "removableAt"
    > {}

export interface PartialApiAccrualVaultState extends PartialApiVaultState {
  allocation: Maybe<PartialApiAccrualVaultAllocation[]>;
}

export interface PartialApiAccrualVault extends PartialApiVault {
  state: Maybe<PartialApiAccrualVaultState>;
}

export interface ConverterOptions {
  parseAddress: (value: string) => Address;
  parseNumber: (value: number, decimals: number) => bigint;
}

export class BlueSdkConverter {
  constructor(protected readonly options: ConverterOptions) {}

  public getPriceUsd(
    dto: PartialApiTokenPrice,
    ethPriceUsd?: ApiToken["priceUsd"],
  ) {
    let price: bigint | undefined;

    if (dto.priceUsd != null)
      price = this.options.parseNumber(dto.priceUsd, 18);
    else if (dto.spotPriceEth != null && ethPriceUsd != null)
      price = MathLib.wMulDown(
        this.options.parseNumber(dto.spotPriceEth, 18),
        this.options.parseNumber(ethPriceUsd, 18),
      );

    return price;
  }

  public getToken(dto: PartialApiToken, ethPriceUsd?: ApiToken["priceUsd"]) {
    return new Token({
      ...dto,
      address: this.options.parseAddress(dto.address),
      price: this.getPriceUsd(dto, ethPriceUsd),
    });
  }

  public getMarketParams(dto: PartialApiMarketParams) {
    return new MarketParams({
      collateralToken: this.options.parseAddress(
        dto.collateralAsset?.address ?? ZERO_ADDRESS,
      ),
      loanToken: this.options.parseAddress(dto.loanAsset.address),
      oracle: this.options.parseAddress(dto.oracleAddress),
      irm: this.options.parseAddress(dto.irmAddress),
      lltv: dto.lltv,
    });
  }

  public getMarket(dto: PartialApiMarket & { state: null }): null;
  public getMarket(dto: PartialApiMarket): Market;
  public getMarket(dto: PartialApiMarket) {
    if (dto.state == null) return null;

    const params = this.getMarketParams(dto);
    const fee = this.options.parseNumber(dto.state.fee, 18);
    const price = dto.collateralPrice ?? 1n;

    return new Market({
      params,
      totalSupplyAssets: dto.state.supplyAssets,
      totalBorrowAssets: dto.state.borrowAssets,
      totalSupplyShares: dto.state.supplyShares,
      totalBorrowShares: dto.state.borrowShares,
      lastUpdate: dto.state.timestamp,
      fee,
      price,
      rateAtTarget: dto.state.rateAtTarget ?? undefined,
    });
  }

  public getPosition(dto: PartialApiMarketPosition) {
    return new Position({
      ...dto,
      marketId: dto.market.uniqueKey,
      user: this.options.parseAddress(dto.user.address),
    });
  }

  public getAccrualPosition(
    dto: PartialApiMarketAccrualPosition & { market: { state: null } },
  ): null;
  public getAccrualPosition(
    dto: PartialApiMarketAccrualPosition,
  ): AccrualPosition;
  public getAccrualPosition(dto: PartialApiMarketAccrualPosition) {
    const market = this.getMarket(dto.market);
    if (market == null) return null;

    return new AccrualPosition(
      {
        ...dto,
        user: this.options.parseAddress(dto.user.address),
      },
      market,
    );
  }

  public getVaultConfig(dto: PartialApiVaultConfig) {
    return new VaultConfig(
      {
        ...dto,
        decimalsOffset: VaultUtils.decimalsOffset(dto.asset.decimals),
        asset: dto.asset.address,
      },
      dto.chain.id,
    );
  }

  public getVault(dto: PartialApiVault & { state: null }): null;
  public getVault(dto: PartialApiVault): Vault;
  public getVault({ state, publicAllocatorConfig, ...dto }: PartialApiVault) {
    if (state == null) return null;

    return new Vault({
      ...state,
      ...this.getVaultConfig(dto),
      fee: this.options.parseNumber(state.fee ?? 0, 18),
      pendingOwner: state.pendingOwner ?? ZERO_ADDRESS,
      pendingTimelock: {
        value: state.pendingTimelock ?? 0n,
        validAt: state.pendingTimelockValidAt ?? 0n,
      },
      pendingGuardian: {
        value: state.pendingGuardian ?? ZERO_ADDRESS,
        validAt: state.pendingGuardianValidAt ?? 0n,
      },
      lastTotalAssets: state.totalAssets,
      supplyQueue:
        state.allocation
          ?.filter((allocation) => isDefined(allocation.supplyQueueIndex))
          .sort(
            (allocationA, allocationB) =>
              allocationA.supplyQueueIndex! - allocationB.supplyQueueIndex!,
          )
          .map((allocation) => allocation.market.uniqueKey) ?? [],
      withdrawQueue:
        state.allocation?.map(({ market }) => market.uniqueKey) ?? [],
      publicAllocatorConfig: publicAllocatorConfig ?? undefined,
    });
  }

  public getVaultMarketAllocation(
    vault: Address,
    dto: PartialApiAccrualVaultAllocation,
    publicAllocatorConfig?: Maybe<PartialApiPublicAllocatorConfig>,
  ) {
    return new VaultMarketAllocation({
      config: this.getVaultMarketConfig(
        vault,
        dto,
        publicAllocatorConfig?.flowCaps.find(
          ({ market: { uniqueKey } }) => uniqueKey === dto.market.uniqueKey,
        ),
      ),
      position: this.getAccrualPosition({
        user: { address: vault },
        market: dto.market,
        supplyShares: dto.supplyShares,
        borrowShares: 0n,
        collateral: 0n,
      }),
    });
  }

  public getVaultMarketConfig(
    vault: Address,
    dto: PartialApiAccrualVaultAllocation,
    flowCaps?: Maybe<PartialApiPublicAllocatorFlowCaps>,
  ) {
    return new VaultMarketConfig({
      vault,
      marketId: dto.market.uniqueKey,
      cap: dto.supplyCap,
      enabled: dto.supplyCap !== 0n,
      pendingCap: {
        value: dto.pendingSupplyCap ?? 0n,
        validAt: dto.pendingSupplyCapValidAt ?? 0n,
      },
      removableAt: dto.removableAt,
      publicAllocatorConfig: this.getVaultMarketPublicAllocatorConfig(
        vault,
        flowCaps ?? { ...dto, maxIn: 0n, maxOut: 0n },
      ),
    });
  }

  public getVaultMarketPublicAllocatorConfig(
    vault: Address,
    dto: PartialApiPublicAllocatorFlowCaps,
  ) {
    return new VaultMarketPublicAllocatorConfig({
      ...dto,
      vault,
      marketId: dto.market.uniqueKey,
    });
  }

  public getAccrualVault(dto: PartialApiAccrualVault & { state: null }): null;
  public getAccrualVault(dto: PartialApiAccrualVault): AccrualVault;
  public getAccrualVault(dto: PartialApiAccrualVault) {
    const { state, publicAllocatorConfig } = dto;
    if (state == null) return null;

    return new AccrualVault(
      this.getVault(dto),
      state.allocation
        ?.map((allocation) =>
          this.getVaultMarketAllocation(
            dto.address,
            allocation,
            publicAllocatorConfig,
          ),
        )
        .filter(isDefined) ?? [],
    );
  }
}
