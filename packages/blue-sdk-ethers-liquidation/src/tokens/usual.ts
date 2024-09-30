import { AbstractSigner, Provider } from "ethers";
import { LiquidationEncoder } from "../LiquidationEncoder";
import { curvePools } from "../addresses";
import {
  curveSwap,
  getCurveSwapInputAmountFromOutput,
  getCurveWithdrawalAmount,
  removeLiquidityFromCurvePool,
} from "../swap/curve";

export const USD0_USDC_USD0_INDEX = 0;
export const USD0_USDC_USDC_INDEX = 1;

export const USD0_USD0PP_USD0_INDEX = 0;
export const USD0_USD0PP_USDPP_INDEX = 1;

export async function swapUsd0Usd0PPToUSDC(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  expectedDestAmount: bigint,
  encoder: LiquidationEncoder,
  receiver: string,
) {
  const withdrawableUSD0Amount = await getCurveWithdrawalAmount(
    provider,
    amount,
    USD0_USD0PP_USD0_INDEX,
    curvePools["usd0usd0++"],
  );

  const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
    provider,
    expectedDestAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usdc"],
  );

  await removeLiquidityFromCurvePool(
    withdrawableUSD0Amount,
    curvePools["usd0usd0++"],
    USD0_USD0PP_USD0_INDEX,
    minUSD0Amount,
    receiver,
    encoder,
  );

  await curveSwap(
    minUSD0Amount,
    curvePools["usd0usdc"],
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    expectedDestAmount,
    receiver,
    encoder,
  );
}

export async function swapUSD0PPToUSDC(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  expectedDestAmount: bigint,
  encoder: LiquidationEncoder,
  receiver: string,
) {
  const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
    provider,
    expectedDestAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usd0++"],
  );

  await curveSwap(
    amount,
    curvePools["usd0usd0++"],
    USD0_USD0PP_USDPP_INDEX,
    USD0_USD0PP_USD0_INDEX,
    minUSD0Amount,
    receiver,
    encoder,
  );

  await curveSwap(
    minUSD0Amount,
    curvePools["usd0usdc"],
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    expectedDestAmount,
    receiver,
    encoder,
  );
}
