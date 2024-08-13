import {
  AccrualPosition,
  AccrualVault,
  Address,
  Market,
  MarketConfig,
  MathLib,
  Position,
  TokenWithPrice,
  VaultConfig,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  VaultUtils,
} from "@morpho-org/blue-sdk";
import { safeGetAddress, safeParseNumber } from "@morpho-org/blue-sdk-ethers";
import { Time, isDefined } from "@morpho-org/morpho-ts";

import {
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
} from "./types";

export interface PartialBlueApiTokenPrice {
  priceUsd?: BlueApiToken["priceUsd"];
  spotPriceEth?: BlueApiToken["spotPriceEth"];
}

export interface PartialBlueApiToken
  extends Pick<BlueApiToken, "address" | "decimals" | "symbol">,
    PartialBlueApiTokenPrice {
  name?: BlueApiToken["name"];
}

export interface PartialBlueApiMarketConfig
  extends Pick<BlueApiMarket, "oracleAddress" | "irmAddress" | "lltv"> {
  collateralAsset: Maybe<Pick<BlueApiToken, "address">>;
  loanAsset: Pick<BlueApiToken, "address">;
}

export interface PartialBlueApiMarket
  extends PartialBlueApiMarketConfig,
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
      | "rateAtUTarget"
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

export namespace BlueSdkConverters {
  export function getPriceUsd(
    dto: PartialBlueApiTokenPrice,
    ethPriceUsd?: BlueApiToken["priceUsd"],
  ) {
    let price: bigint | undefined;

    if (dto.priceUsd != null) price = safeParseNumber(dto.priceUsd, 18);
    else if (dto.spotPriceEth != null && ethPriceUsd != null)
      price = MathLib.wMulDown(
        safeParseNumber(dto.spotPriceEth, 18),
        safeParseNumber(ethPriceUsd, 18),
      );

    return price;
  }

  export function getTokenWithPrice(
    dto: PartialBlueApiToken,
    ethPriceUsd?: BlueApiToken["priceUsd"],
  ) {
    return new TokenWithPrice(
      {
        ...dto,
        address: safeGetAddress(dto.address),
      },
      getPriceUsd(dto, ethPriceUsd),
    );
  }

  export function getMarketConfig(dto: PartialBlueApiMarketConfig) {
    return new MarketConfig({
      collateralToken: safeGetAddress(
        dto.collateralAsset?.address ??
          "0x0000000000000000000000000000000000000000",
      ),
      loanToken: safeGetAddress(dto.loanAsset.address),
      oracle: safeGetAddress(dto.oracleAddress),
      irm: safeGetAddress(dto.irmAddress),
      lltv: dto.lltv,
    });
  }

  export function getMarket(dto: PartialBlueApiMarket) {
    if (dto.state == null) return null;

    const config = getMarketConfig(dto);
    const fee = safeParseNumber(dto.state.fee, 18);
    const price = dto.collateralPrice ?? 1n;

    const rateAtTarget =
      // rateAtUTarget is not typed nullable, but it will be as soon as a non-compatible IRM is enabled.
      dto.state.rateAtUTarget != null
        ? // API rate at targed is annualized, while the Market rateAtTarget is per second.
          safeParseNumber(dto.state.rateAtUTarget, 18) / Time.s.from.y(1n)
        : undefined;

    return new Market({
      config,
      totalSupplyAssets: dto.state.supplyAssets,
      totalBorrowAssets: dto.state.borrowAssets,
      totalSupplyShares: dto.state.supplyShares,
      totalBorrowShares: dto.state.borrowShares,
      lastUpdate: dto.state.timestamp,
      fee,
      price,
      rateAtTarget,
    });
  }

  export function getPosition(dto: PartialBlueApiMarketPosition) {
    return new Position({
      ...dto,
      marketId: dto.market.uniqueKey,
      user: safeGetAddress(dto.user.address),
    });
  }

  export function getAccrualPosition(dto: PartialBlueApiMarketAccrualPosition) {
    const market = BlueSdkConverters.getMarket(dto.market);
    if (market == null) return null;

    return new AccrualPosition(
      {
        ...dto,
        user: safeGetAddress(dto.user.address),
      },
      market,
    );
  }

  export function getVaultConfig(dto: PartialBlueApiVaultConfig) {
    return new VaultConfig(
      {
        ...dto,
        decimals: Math.max(18, dto.asset.decimals),
        decimalsOffset: VaultUtils.decimalsOffset(dto.asset.decimals),
        asset: dto.asset.address,
      },
      dto.chain.id,
    );
  }

  export function getVaultMarketAllocation(
    vault: Address,
    dto: PartialBlueApiVaultAllocation,
    publicAllocatorConfig?: Maybe<PartialBlueApiPublicAllocatorConfig>,
  ) {
    const position = BlueSdkConverters.getAccrualPosition({
      user: { address: vault },
      market: dto.market,
      supplyShares: dto.supplyShares,
      borrowShares: 0n,
      collateral: 0n,
    });
    if (!position) return;

    return new VaultMarketAllocation({
      config: BlueSdkConverters.getVaultMarketConfig(
        vault,
        dto,
        publicAllocatorConfig?.flowCaps.find(
          ({ market: { uniqueKey } }) => uniqueKey === dto.market.uniqueKey,
        ),
      ),
      position,
    });
  }

  export function getVaultMarketConfig(
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
      publicAllocatorConfig: flowCaps
        ? BlueSdkConverters.getVaultMarketPublicAllocatorConfig(vault, flowCaps)
        : undefined,
    });
  }

  export function getVaultMarketPublicAllocatorConfig(
    vault: Address,
    dto: PartialBlueApiPublicAllocatorFlowCaps,
  ) {
    return new VaultMarketPublicAllocatorConfig({
      ...dto,
      vault,
      marketId: dto.market.uniqueKey,
    });
  }

  export function getAccrualVault({
    state,
    publicAllocatorConfig,
    ...dto
  }: PartialBlueApiVault) {
    if (state == null) return null;

    return new AccrualVault(
      {
        ...state,
        config: BlueSdkConverters.getVaultConfig(dto),
        fee: safeParseNumber(state.fee),
        pendingOwner:
          state.pendingOwner ?? "0x0000000000000000000000000000000000000000",
        pendingTimelock: {
          value: state.pendingTimelock ?? 0n,
          validAt: state.pendingTimelockValidAt ?? 0n,
        },
        pendingGuardian: {
          value:
            state.pendingGuardian ??
            "0x0000000000000000000000000000000000000000",
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
          BlueSdkConverters.getVaultMarketAllocation(
            dto.address,
            allocation,
            publicAllocatorConfig,
          ),
        )
        .filter(isDefined) ?? [],
    );
  }
}
