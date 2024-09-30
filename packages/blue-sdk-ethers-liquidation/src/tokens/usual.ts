import { AbstractSigner, MaxUint256, Provider } from "ethers";
import { LiquidationEncoder } from "../LiquidationEncoder";
import { curvePools } from "../addresses";
import { mainnetAddresses } from "../addresses";
import {
  encodeCurveSwap,
  encodeRemoveLiquidityFromCurvePool,
  getCurveSwapInputAmountFromOutput,
  getCurveSwapOutputAmountFromInput,
  getCurveWithdrawalAmount,
} from "../swap/curve";
export const USD0_USDC_USD0_INDEX = 0;
export const USD0_USDC_USDC_INDEX = 1;

export const USD0_USD0PP_USD0_INDEX = 0;
export const USD0_USD0PP_USDPP_INDEX = 1;

/**
 *  Swaps USD0USD0++ for USDC through the USD0/USD0++ && USD0/USDC pools
 *  Route is USD0USD0++ -> USD0 -> USDC
 * @returns the total swapped USDC amount
 */
export async function swapUsd0Usd0PPToUSDC(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  expectedDestAmount: bigint,
  encoder: LiquidationEncoder,
  receiver: string,
) {
  // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0USD0++ and USD0 tokens
  encoder.erc20Approve(
    mainnetAddresses["usd0usd0++"]!,
    curvePools["usd0usd0++"],
    MaxUint256,
  );
  encoder.erc20Approve(
    mainnetAddresses["usd0"]!,
    curvePools["usd0usdc"],
    MaxUint256,
  );

  // Get the amount of USD0 that can be withdrawn from the USD0/USD0++ pool with USD0USD0++ tokens
  const withdrawableUSD0Amount = await getCurveWithdrawalAmount(
    provider,
    amount,
    USD0_USD0PP_USD0_INDEX,
    curvePools["usd0usd0++"],
  );

  // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
  const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
    provider,
    expectedDestAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usdc"],
  );

  // Encode the remove liquidity call to the USD0/USD0++ pool
  // go from USD0USD0++ -> USDO
  await encodeRemoveLiquidityFromCurvePool(
    withdrawableUSD0Amount,
    curvePools["usd0usd0++"],
    USD0_USD0PP_USD0_INDEX,
    minUSD0Amount,
    receiver,
    encoder,
  );

  // Encode the swap call to the USD0/USDC pool
  // go from USD0 -> USDC
  await encodeCurveSwap(
    minUSD0Amount,
    curvePools["usd0usdc"],
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    expectedDestAmount,
    receiver,
    encoder,
  );

  // Get the amount of USDC that can be swapped from the withdraw USD0 tokens from USD0/USD0++ pool
  const swappableAmount = await getCurveSwapOutputAmountFromInput(
    provider,
    withdrawableUSD0Amount,
    USD0_USD0PP_USDPP_INDEX,
    USD0_USD0PP_USD0_INDEX,
    curvePools["usd0usd0++"],
  );

  // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
  const finalUSDCAmount = await getCurveSwapOutputAmountFromInput(
    provider,
    swappableAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usdc"],
  );

  return finalUSDCAmount;
}

/**
 *  Swaps USD0++ for USDC through the USD0/USD0++ && USD0/USDC pools
 *  Route is USD0++ -> USD0 -> USDC
 * @returns the total swapped USDC amount
 */
export async function swapUSD0PPToUSDC(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  expectedDestAmount: bigint,
  encoder: LiquidationEncoder,
  receiver: string,
) {
  // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0++ and USD0 tokens
  encoder.erc20Approve(
    mainnetAddresses["usd0++"]!,
    curvePools["usd0usd0++"],
    MaxUint256,
  );
  encoder.erc20Approve(
    mainnetAddresses["usd0"]!,
    curvePools["usd0usdc"],
    MaxUint256,
  );

  // Get the amount of USD0 that can be swapped from the USD0++ tokens from USD0/USD0++ pool
  const swappableAmount = await getCurveSwapOutputAmountFromInput(
    provider,
    amount,
    USD0_USD0PP_USDPP_INDEX,
    USD0_USD0PP_USD0_INDEX,
    curvePools["usd0usd0++"],
  );

  // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
  const finalUSDCAmount = await getCurveSwapOutputAmountFromInput(
    provider,
    swappableAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usdc"],
  );

  // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
  // go from USD0 -> USDC
  const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
    provider,
    expectedDestAmount,
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    curvePools["usd0usd0++"],
  );

  // Encode the swap call to the USD0/USD0++ pool
  // go from USD0++ -> USD0
  await encodeCurveSwap(
    amount,
    curvePools["usd0usd0++"],
    USD0_USD0PP_USDPP_INDEX,
    USD0_USD0PP_USD0_INDEX,
    minUSD0Amount,
    receiver,
    encoder,
  );

  // Encode the swap call to the USD0/USDC pool
  // go from USD0 -> USDC
  await encodeCurveSwap(
    swappableAmount,
    curvePools["usd0usdc"],
    USD0_USDC_USD0_INDEX,
    USD0_USDC_USDC_INDEX,
    expectedDestAmount,
    receiver,
    encoder,
  );

  return finalUSDCAmount;
}
