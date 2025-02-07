import { ChainId } from "@morpho-org/blue-sdk";
import { getAddress } from "viem";

export namespace Spectra {
  export const apiUrl = (chainId: ChainId) => {
    switch (chainId) {
      case ChainId.EthMainnet:
        return "https://app.spectra.finance/api/v1/MAINNET/pools";
      case ChainId.BaseMainnet:
        return "https://app.spectra.finance/api/v1/BASE/pools";
      default:
        return undefined;
    }
  };

  export type PrincipalToken = {
    address: string;
    name: string;
    symbol: string;
    decimals: bigint;
    chainId: bigint;
    rate: bigint;
    yt: YieldToken;
    ibt: InterestBearingToken;
    underlying: UnderlyingAsset;
    maturity: bigint;
    createdAt: bigint;
    pools: Pool[];
    maturityValue: MaturityValue;
  };

  export type YieldToken = {
    address: string;
    decimals: bigint;
    chainId: bigint;
  };

  export type InterestBearingToken = {
    address: string;
    name: string;
    symbol: string;
    decimals: bigint;
    chainId: bigint;
    rate: bigint;
    apr: APR;
    price: Price;
    protocol: string;
  };

  export type APR = {
    total: number;
    details: {
      base: number;
      rewards: Record<string, number>;
    };
  };

  export type Price = {
    underlying: number;
    usd: number;
  };

  export type UnderlyingAsset = {
    address: string;
    name: string;
    symbol: string;
    decimals: bigint;
    chainId: bigint;
    price: {
      usd: number;
    };
  };

  export type Pool = {
    address: string;
    chainId: bigint;
    lpt: LPToken;
    liquidity: Liquidity;
    impliedApy: number | null;
    lpApy: LPApy;
    ibtToPt: bigint | null;
    ptToIbt: bigint | null;
    ptPrice: TokenPrice;
    ytPrice: TokenPrice;
    ibtAmount: bigint;
    ptAmount: bigint;
    feeRate: bigint;
  };

  export type LPToken = {
    address: string;
    decimals: bigint;
    chainId: bigint;
    supply: bigint;
  };

  export type Liquidity = {
    underlying: number;
    usd: number;
  };

  export type LPApy = {
    total: number | null;
    details: {
      fees: number;
      pt: number | null;
      ibt: number;
    };
  };

  export type TokenPrice = {
    underlying: number;
    usd: number;
  };

  export type MaturityValue = {
    underlying: bigint;
    usd: number;
  };

  export async function getTokens(chainId: ChainId): Promise<PrincipalToken[]> {
    const url = apiUrl(chainId);

    if (!url) {
      return [];
    }

    const res = await fetch(url);

    if (!res.ok) return [];

    return (await res.json()) as PrincipalToken[];
  }

  export function isPT(token: string, spectraTokens: PrincipalToken[]) {
    return spectraTokens.some(
      (tokenInfo) => getAddress(tokenInfo.address) === token,
    );
  }

  export function getPTInfo(token: string, spectraTokens: PrincipalToken[]) {
    return spectraTokens.find(
      (tokenInfo) => getAddress(tokenInfo.address) === token,
    )!;
  }
}
