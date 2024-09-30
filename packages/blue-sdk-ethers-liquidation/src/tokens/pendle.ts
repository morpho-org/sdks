import { BigNumberish, MaxUint256 } from "ethers";

import { Address, ChainId, Market } from "@morpho-org/blue-sdk";
import { LiquidationEncoder } from "../LiquidationEncoder";
import { pendleTokens } from "../addresses";

export const PENDLE_API_URL = "https://api-v2.pendle.finance/core/";

export const PENDLE_ROUTER_ADDRESS =
  "0x888888888889758F76e7103c6CbF23ABbF58F946";

export const getPendleSwapApiPath = (chainId: BigNumberish) =>
  `v1/sdk/${chainId}/markets`;
export const getPendleRedeemApiPath = (chainId: BigNumberish) =>
  `v1/sdk/${chainId}/redeem`;

export const getPendleSwapApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleSwapApiPath(chainId), PENDLE_API_URL).toString();
export const getPendleRedeemApiUrl = (chainId: BigNumberish) =>
  new URL(getPendleRedeemApiPath(chainId), PENDLE_API_URL).toString();

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

export const pendleMarkets: Record<ChainId, Record<string, PendleMarket>> = {
  [ChainId.EthMainnet]: {
    "0xa0021EF8970104c2d008F38D92f115ad56a9B8e1": {
      maturity: new Date("2024-07-25T00:00:00.000Z"),
      address: "0x19588F29f9402Bb508007FeADd415c875Ee3f19F",
      underlyingTokenAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
      yieldTokenAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    },
    "0xf7906F274c174A52d444175729E3fa98f9bde285": {
      maturity: new Date("2024-12-26T00:00:00.000Z"),
      address: "0xD8F12bCDE578c653014F27379a6114F67F0e445f",
      underlyingTokenAddress: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
      yieldTokenAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    },
    "0xAE5099C39f023C91d3dd55244CAFB36225B0850E": {
      maturity: new Date("2024-10-24T00:00:00.000Z"),
      address: "0xbBf399db59A845066aAFce9AE55e68c505FA97B7",
      underlyingTokenAddress: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
      yieldTokenAddress: "0x279e76FA6310976dc651c5F48EC7e768e9e2CCb4",
    },
    "0x6ee2b5E19ECBa773a352E5B21415Dc419A700d1d": {
      maturity: new Date("2024-12-26T00:00:00.000Z"),
      address: "0x792b9eDe7a18C26b814f87Eb5E0c8D26AD189780",
      underlyingTokenAddress: "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88",
      yieldTokenAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    },
    "0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": {
      maturity: new Date("2024-06-27T00:00:00.000Z"),
      address: "0xF32e58F92e60f4b0A37A69b95d642A471365EAe8",
      underlyingTokenAddress: "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88",
      yieldTokenAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    },
  },
  [ChainId.BaseMainnet]: {},
};

async function getPendleApiData<T extends Record<string, any>, U>(
  chainId: number,
  endpoint: string,
  params: T,
): Promise<U> {
  const queryParams = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
  const url = `${PENDLE_API_URL}v1/sdk/${chainId}${endpoint}?${queryParams}`;

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

export async function handlePendleTokens(
  chainId: ChainId,
  market: Market,
  seizedAssets: bigint,
  executorAddress: string,
  encoder: LiquidationEncoder,
): Promise<{ srcAmount: bigint; srcToken: string }> {
  if (!pendleTokens[chainId].has(market.config.collateralToken)) {
    return { srcAmount: seizedAssets, srcToken: market.config.collateralToken };
  }

  const pendleMarketData =
    pendleMarkets[chainId][market.config.collateralToken];
  const maturity = pendleMarketData?.maturity;
  if (!maturity) {
    throw Error("Pendle market not found");
  }

  let srcAmount = seizedAssets;
  let srcToken = pendleMarketData.underlyingTokenAddress;

  if (maturity < new Date()) {
    // Pendle market is expired, we can directly redeem the collateral
    const redeemCallData = await getPendleRedeemCallData(chainId, {
      receiver: executorAddress,
      slippage: 0.04,
      yt: pendleMarketData.yieldTokenAddress,
      amountIn: seizedAssets.toString(),
      tokenOut: pendleMarketData.underlyingTokenAddress,
      enableAggregator: true,
    });
    encoder
      .erc20Approve(srcToken, redeemCallData.tx.to, MaxUint256)
      .erc20Approve(
        market.config.collateralToken,
        redeemCallData.tx.to,
        MaxUint256,
      )
      .pushCall(
        redeemCallData.tx.to,
        redeemCallData.tx.value ? redeemCallData.tx.value : 0n,
        redeemCallData.tx.data,
      );
  } else {
    // Pendle market is not expired, we need to swap the collateral token (PT) to the underlying token
    const swapCallData = await getPendleSwapCallData(
      chainId,
      pendleMarketData.address,
      {
        receiver: executorAddress,
        slippage: 0.04,
        tokenIn: market.config.collateralToken,
        tokenOut: pendleMarketData.underlyingTokenAddress,
        amountIn: seizedAssets.toString(),
      },
    );
    encoder
      .erc20Approve(srcToken, swapCallData.tx.to, MaxUint256)
      .erc20Approve(
        market.config.collateralToken,
        swapCallData.tx.to,
        MaxUint256,
      )
      .pushCall(
        swapCallData.tx.to,
        swapCallData.tx.value ? swapCallData.tx.value : 0n,
        swapCallData.tx.data,
      );
    srcAmount = BigInt(swapCallData.data.amountOut);
  }

  return { srcAmount, srcToken };
}
