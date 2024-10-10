import type { Address, BigIntish, ChainId } from "@morpho-org/blue-sdk";
import type { Hex } from "viem";

export namespace Pendle {
  export const API_URL = "https://api-v2.pendle.finance/core/";

  export const ROUTER_ADDRESS =
    "0x888888888889758F76e7103c6CbF23ABbF58F946" as const;

  export const getSwapApiPath = (chainId: BigIntish) =>
    `v1/sdk/${chainId}/markets`;
  export const getRedeemApiPath = (chainId: BigIntish) =>
    `v1/sdk/${chainId}/redeem`;
  export const getTokensApiPath = (chainId: BigIntish) =>
    `v1/${chainId}/assets/pendle-token/list`;
  export const getMarketsApiPath = (chainId: BigIntish) =>
    `v1/${chainId}/markets`;

  export const getSwapApiUrl = (chainId: BigIntish) =>
    new URL(getSwapApiPath(chainId), API_URL).toString();
  export const getRedeemApiUrl = (chainId: BigIntish) =>
    new URL(getRedeemApiPath(chainId), API_URL).toString();
  export const getTokensApiUrl = (chainId: BigIntish) =>
    new URL(getTokensApiPath(chainId), API_URL).toString();
  export const getMarketsApiUrl = (chainId: BigIntish) =>
    new URL(getMarketsApiPath(chainId), API_URL).toString();

  export interface Market {
    maturity: Date;
    address: Address;
    underlyingTokenAddress: Address;
    yieldTokenAddress: Address;
  }

  export interface SwapParams {
    receiver: string;
    slippage: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
  }

  export interface RedeemParams {
    receiver: string;
    slippage: number;
    yt: string;
    amountIn: string;
    tokenOut: string;
    enableAggregator: boolean;
  }

  export interface SwapCallData {
    tx: {
      data: Hex;
      to: Address;
      value: string;
    };
    data: {
      amountOut: string;
      priceImpact: number;
    };
  }

  export interface VersionResponse {
    major: number;
    minor: number;
    patch: number;
  }

  export interface TokenInfoResponse {
    chainId: number;
    address: string;
    decimals: number;
    name: string;
    symbol: string;
    logoURI: string;
    tags: string[];
  }

  export interface TagDefinitionResponse {
    name: string;
    description: string;
  }

  export interface TokenListResponse {
    name: string;
    timestamp: string;
    version: VersionResponse;
    tokens: TokenInfoResponse[];
    tokenMap: {
      [key: string]: TokenInfoResponse;
    };
    keywords: string[];
    logoURI: string;
    tags: {
      [key: string]: TagDefinitionResponse;
    };
  }

  export interface MarketData {
    total: number;
    limit: number;
    skip: number;
    results: MarketResult[];
  }

  export interface MarketResult {
    id: string;
    chainId: number;
    address: string;
    symbol: string;
    expiry: string;
    pt: Token;
    yt: Token;
    sy: Token;
    lp: Token;
    accountingAsset: Asset;
    underlyingAsset: Asset;
    basePricingAsset: Asset;
    protocol: string;
    underlyingPool: string;
    proSymbol: string;
    proIcon: string;
    assetRepresentation: string;
    isWhitelistedPro: boolean;
    isWhitelistedSimple: boolean;
    votable: boolean;
    isActive: boolean;
    isWhitelistedLimitOrder: boolean;
    accentColor: string;
    totalPt: number;
    totalSy: number;
    totalLp: number;
    liquidity: {
      usd: number;
      acc: number;
    };
    tradingVolume: {
      usd: number;
    };
    underlyingInterestApy: number;
    underlyingRewardApy: number;
    underlyingApy: number;
    impliedApy: number;
    ytFloatingApy: number;
    ptDiscount: number;
    swapFeeApy: number;
    pendleApy: number;
    arbApy: number;
    aggregatedApy: number;
    maxBoostedApy: number;
    lpRewardApy: number;
    voterApy: number;
    ytRoi: number;
    ptRoi: number;
    dataUpdatedAt: string;
    categoryIds: string[];
    timestamp: string;
    scalarRoot: number;
    initialAnchor: number;
    extendedInfo: ExtendedInfo;
    isFeatured: boolean;
    isPopular: boolean;
    tvlThresholdTimestamp: string;
    isNew: boolean;
    name: string;
    simpleName: string;
    simpleSymbol: string;
    simpleIcon: string;
    proName: string;
    farmName: string;
    farmSymbol: string;
    farmSimpleName: string;
    farmSimpleSymbol: string;
    farmSimpleIcon: string;
    farmProName: string;
    farmProSymbol: string;
    farmProIcon: string;
  }

  export interface Token {
    id: string;
    chainId: number;
    address: string;
    symbol: string;
    decimals: number;
    expiry: string | null;
    accentColor: string;
    price: {
      usd: number;
      acc?: number;
    };
    priceUpdatedAt: string;
    name: string;
    baseType: string;
    types: string[];
    protocol?: string;
    underlyingPool?: string;
    proSymbol: string;
    proIcon: string;
    zappable: boolean;
    simpleName: string;
    simpleSymbol: string;
    simpleIcon: string;
    proName: string;
  }

  export interface Asset {
    id: string;
    chainId: number;
    address: Address;
    symbol: string;
    decimals: number;
    expiry: string | null;
    accentColor: string | null;
    price: {
      usd: number;
    };
    priceUpdatedAt: string;
    name: string;
    baseType: string;
    types: string[];
    protocol: string | null;
    proSymbol: string;
    proIcon: string;
    zappable: boolean;
    simpleName: string;
    simpleSymbol: string;
    simpleIcon: string;
    proName: string;
  }

  export interface ExtendedInfo {
    floatingPt: number;
    floatingSy: number;
    pyUnit: string;
    ptEqualsPyUnit: boolean;
    underlyingAssetWorthMore?: string;
    nativeWithdrawalURL?: string;
    movement10Percent: {
      ptMovementUpUsd: number;
      ptMovementDownUsd: number;
      ytMovementUpUsd: number;
      ytMovementDownUsd: number;
    };
    feeRate: number;
    yieldRange: {
      min: number;
      max: number;
    };
    sySupplyCap?: number;
    syCurrentSupply?: number;
  }

  export async function getApiData<T extends {}, U>(
    chainId: number,
    endpoint: string,
    params: T,
    api: "sdk" | "non-sdk" = "sdk",
  ) {
    const queryParams = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString();

    const apiPath = api === "sdk" ? `v1/sdk/${chainId}` : `v1/${chainId}`;
    const url = `${API_URL}${apiPath}${endpoint}?${queryParams}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) throw new Error(res.statusText);

    return res.json() as Promise<U>;
  }

  export async function getSwapCallData(
    chainId: number,
    marketAddress: string,
    params: SwapParams,
  ) {
    return getApiData<SwapParams, SwapCallData>(
      chainId,
      `/markets/${marketAddress}/swap`,
      params,
    );
  }

  export async function getRedeemCallData(
    chainId: number,
    params: RedeemParams,
  ) {
    return getApiData<RedeemParams, SwapCallData>(chainId, "/redeem", params);
  }

  export async function getTokens(chainId: number) {
    return getApiData<{}, TokenListResponse>(
      chainId,
      "/assets/pendle-token/list",
      {},
      "non-sdk",
    );
  }

  export async function getMarketForPTToken(chainId: number, token: string) {
    return getApiData<{}, MarketData>(
      chainId,
      `/markets?pt=${token}`,
      {},
      "non-sdk",
    );
  }

  export function isPTToken(
    token: string,
    chainId: ChainId,
    pendleTokens: TokenListResponse,
  ) {
    return pendleTokens.tokens.some(
      (tokenInfo) =>
        tokenInfo.address === token && chainId === tokenInfo.chainId,
    );
  }
}
