import {
  AccrualPosition,
  AccrualVault,
  type Address,
  Market,
  MarketParams,
  MathLib,
  Position,
  Token,
  VaultConfig,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  VaultUtils,
} from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS, isDefined } from "@morpho-org/morpho-ts";

import type {
  Chain as BlueApiChain,
  Market as BlueApiMarket,
  MarketPosition as BlueApiMarketPosition,
  MarketState as BlueApiMarketState,
  PublicAllocatorConfig as BlueApiPublicAllocatorConfig,
  PublicAllocatorFlowCaps as BlueApiPublicAllocatorFlowCaps,
  Asset as BlueApiToken,
  User as BlueApiUser,
  Vault as BlueApiVault,
  VaultAllocation as BlueApiVaultAllocation,
  VaultState as BlueApiVaultState,
  Maybe,
} from "./types.js";

export interface PartialBlueApiTokenPrice {
  priceUsd?: BlueApiToken["priceUsd"];
  spotPriceEth?: BlueApiToken["spotPriceEth"];
}

export interface PartialBlueApiToken
  extends Pick<BlueApiToken, "address" | "decimals" | "symbol">,
    PartialBlueApiTokenPrice {
  name?: BlueApiToken["name"];
}

export interface PartialBlueApiMarketParams
  extends Pick<BlueApiMarket, "oracleAddress" | "irmAddress" | "lltv"> {
  collateralAsset: Maybe<Pick<BlueApiToken, "address">>;
  loanAsset: Pick<BlueApiToken, "address">;
}

export interface PartialBlueApiMarket
  extends PartialBlueApiMarketParams,
    Pick<BlueApiMarket, "collateralPrice"> {
  state: Maybe<
    Pick<
      BlueApiMarketState,
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

export interface PartialBlueApiMarketPosition
  extends Pick<
    BlueApiMarketPosition,
    "supplyShares" | "borrowShares" | "collateral"
  > {
  user: Pick<BlueApiUser, "address">;
  market: Pick<BlueApiMarket, "uniqueKey">;
}

export interface PartialBlueApiMarketAccrualPosition
  extends Omit<PartialBlueApiMarketPosition, "market"> {
  market: PartialBlueApiMarket;
}

export interface PartialBlueApiVaultConfig
  extends Pick<BlueApiVault, "address" | "symbol" | "name"> {
  asset: Pick<BlueApiToken, "address" | "decimals">;
  chain: Pick<BlueApiChain, "id">;
}

export interface PartialBlueApiPublicAllocatorFlowCaps
  extends Pick<BlueApiPublicAllocatorFlowCaps, "maxIn" | "maxOut"> {
  market: Pick<BlueApiMarket, "uniqueKey">;
}

export interface PartialBlueApiPublicAllocatorConfig
  extends Pick<BlueApiPublicAllocatorConfig, "fee" | "accruedFee" | "admin"> {
  flowCaps: PartialBlueApiPublicAllocatorFlowCaps[];
}

export interface PartialBlueApiVaultAllocation
  extends Pick<
    BlueApiVaultAllocation,
    | "supplyQueueIndex"
    | "supplyShares"
    | "supplyCap"
    | "pendingSupplyCap"
    | "pendingSupplyCapValidAt"
    | "removableAt"
  > {
  market: PartialBlueApiMarket & Pick<BlueApiMarket, "uniqueKey">;
}

export interface PartialBlueApiVaultState
  extends Pick<
    BlueApiVaultState,
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
  allocation: Maybe<PartialBlueApiVaultAllocation[]>;
}

export interface PartialBlueApiVault
  extends PartialBlueApiVaultConfig,
    Pick<BlueApiVault, "address" | "symbol" | "name"> {
  state: Maybe<PartialBlueApiVaultState>;
  publicAllocatorConfig: Maybe<PartialBlueApiPublicAllocatorConfig>;
}

export interface ConverterOptions {
  parseAddress: (value: string) => Address;
  parseNumber: (value: number, decimals: number) => bigint;
}

export class BlueSdkConverter {
  constructor(protected readonly options: ConverterOptions) {}

  public getPriceUsd(
    dto: PartialBlueApiTokenPrice,
    ethPriceUsd?: BlueApiToken["priceUsd"],
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

  public getToken(
    dto: PartialBlueApiToken,
    ethPriceUsd?: BlueApiToken["priceUsd"],
  ) {
    return new Token({
      ...dto,
      address: this.options.parseAddress(dto.address),
      price: this.getPriceUsd(dto, ethPriceUsd),
    });
  }

  public getMarketParams(dto: PartialBlueApiMarketParams) {
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

  public getMarket(dto: PartialBlueApiMarket) {
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

  public getPosition(dto: PartialBlueApiMarketPosition) {
    return new Position({
      ...dto,
      marketId: dto.market.uniqueKey,
      user: this.options.parseAddress(dto.user.address),
    });
  }

  public getAccrualPosition(dto: PartialBlueApiMarketAccrualPosition) {
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

  public getVaultConfig(dto: PartialBlueApiVaultConfig) {
    return new VaultConfig(
      {
        ...dto,
        decimalsOffset: VaultUtils.decimalsOffset(dto.asset.decimals),
        asset: dto.asset.address,
      },
      dto.chain.id,
    );
  }

  public getVaultMarketAllocation(
    vault: Address,
    dto: PartialBlueApiVaultAllocation,
    publicAllocatorConfig?: Maybe<PartialBlueApiPublicAllocatorConfig>,
  ) {
    const position = this.getAccrualPosition({
      user: { address: vault },
      market: dto.market,
      supplyShares: dto.supplyShares,
      borrowShares: 0n,
      collateral: 0n,
    });
    if (!position) return;

    return new VaultMarketAllocation({
      config: this.getVaultMarketConfig(
        vault,
        dto,
        publicAllocatorConfig?.flowCaps.find(
          ({ market: { uniqueKey } }) => uniqueKey === dto.market.uniqueKey,
        ),
      ),
      position,
    });
  }

  public getVaultMarketConfig(
    vault: Address,
    dto: PartialBlueApiVaultAllocation,
    flowCaps?: Maybe<PartialBlueApiPublicAllocatorFlowCaps>,
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
    dto: PartialBlueApiPublicAllocatorFlowCaps,
  ) {
    return new VaultMarketPublicAllocatorConfig({
      ...dto,
      vault,
      marketId: dto.market.uniqueKey,
    });
  }

  public getAccrualVault({
    state,
    publicAllocatorConfig,
    ...dto
  }: PartialBlueApiVault) {
    if (state == null) return null;

    return new AccrualVault(
      {
        ...state,
        ...this.getVaultConfig(dto),
        fee: this.options.parseNumber(state.fee, 18),
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
        publicAllocatorConfig: publicAllocatorConfig || undefined,
      },
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
