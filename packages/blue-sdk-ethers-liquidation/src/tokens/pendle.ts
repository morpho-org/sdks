import { BigNumberish } from "ethers";

import { Address, ChainId } from "@morpho-org/blue-sdk";

export const PENDLE_API_URL = "https://api-v2.pendle.finance/core/";

export const PENDLE_ROUTER_ADDRESS =
  "0x888888888889758F76e7103c6CbF23ABbF58F946";

export const getPendleSwapApiPath = (chainId: BigNumberish) =>
  `v1/sdk/${chainId}/markets`;
export const getPendleRedeemApiPath = (chainId: BigNumberish) =>
  `v1/sdk/${chainId}/redeem`;
export const getPendleTokensApiPath = (chainId: BigNumberish) =>
  `v1/${chainId}/assets/pendle-token/list`;
export const getPendleMarketsApiPath = (chainId: BigNumberish) =>
  `v1/${chainId}/markets`;

export const getPendleSwapApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleSwapApiPath(chainId), PENDLE_API_URL).toString();
export const getPendleRedeemApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleRedeemApiPath(chainId), PENDLE_API_URL).toString();
export const getPendleTokensApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleTokensApiPath(chainId), PENDLE_API_URL).toString();
export const getPendleMarketsApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleMarketsApiPath(chainId), PENDLE_API_URL).toString();

export interface PendleMarket {
  maturity: Date;
  address: Address;
  underlyingTokenAddress: Address;
  yieldTokenAddress: Address;
}

export type PendleSwapParams = {
  receiver: string;
  slippage: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
};

export type PendleRedeemParams = {
  receiver: string;
  slippage: number;
  yt: string;
  amountIn: string;
  tokenOut: string;
  enableAggregator: boolean;
};

export type PendleSwapCallData = {
  tx: {
    data: string;
    to: string;
    value: string;
  };
  data: {
    amountOut: string;
    priceImpact: number;
  };
};

type VersionResponse = {
  major: number;
  minor: number;
  patch: number;
};

type TokenInfoResponse = {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  tags: string[];
};

type TagDefinitionResponse = {
  name: string;
  description: string;
};

export type PendleTokenListResponse = {
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
};

export type PendleMarketData = {
  total: number;
  limit: number;
  skip: number;
  results: MarketResult[];
};

interface MarketResult {
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

interface Token {
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

interface Asset {
  id: string;
  chainId: number;
  address: string;
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

interface ExtendedInfo {
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

async function getPendleApiData<T extends Record<string, any>, U>(
  chainId: number,
  endpoint: string,
  params: T,
  api: "sdk" | "non-sdk" = "sdk",
): Promise<U> {
  const queryParams = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();

  const apiPath = api === "sdk" ? `v1/sdk/${chainId}` : `v1/${chainId}`;
  const url = `${PENDLE_API_URL}${apiPath}${endpoint}?${queryParams}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<U>;
}

export async function getPendleSwapCallData(
  chainId: number,
  marketAddress: string,
  params: PendleSwapParams,
) {
  return getPendleApiData<PendleSwapParams, PendleSwapCallData>(
    chainId,
    `/markets/${marketAddress}/swap`,
    params,
  );
}

export async function getPendleRedeemCallData(
  chainId: number,
  params: PendleRedeemParams,
) {
  return getPendleApiData<PendleRedeemParams, PendleSwapCallData>(
    chainId,
    "/redeem",
    params,
  );
}

export async function getPendleTokens(chainId: number) {
  return getPendleApiData<{}, PendleTokenListResponse>(
    chainId,
    "/assets/pendle-token/list",
    {},
    "non-sdk",
  );
}

export async function getPendleMarketForPTToken(
  chainId: number,
  token: string,
) {
  return getPendleApiData<{}, PendleMarketData>(
    chainId,
    `/markets?pt=${token}`,
    {},
    "non-sdk",
  );
}

export function isPendlePTToken(
  token: string,
  chainId: ChainId,
  pendleTokens: PendleTokenListResponse,
) {
  return (
    pendleTokens.tokens.find(
      (tokenInfo) =>
        tokenInfo.address === token &&
        Number(chainId) === Number(tokenInfo.chainId),
    ) != undefined
  );
}
