import { ChainId, Market } from "@morpho-org/blue-sdk";
import {
  curvePools,
  mainnetAddresses,
  pendleTokens,
} from "@morpho-org/blue-sdk-ethers-liquidation";
import {
  encodeCurveSwap,
  encodeRemoveLiquidityFromCurvePool,
  getCurveSwapInputAmountFromOutput,
  getCurveSwapOutputAmountFromInput,
  getCurveWithdrawalAmount,
} from "@morpho-org/blue-sdk-ethers-liquidation/src/swap/curve";
import {
  getPendleRedeemCallData,
  getPendleSwapCallData,
  pendleMarkets,
} from "@morpho-org/blue-sdk-ethers-liquidation/src/tokens/pendle";
import {
  USD0_USD0PP_USD0_INDEX,
  USD0_USD0PP_USDPP_INDEX,
  USD0_USDC_USD0_INDEX,
  USD0_USDC_USDC_INDEX,
} from "@morpho-org/blue-sdk-ethers-liquidation/src/tokens/usual";
import { AbstractSigner, MaxUint256, Provider } from "ethers";
import { ExecutorEncoder } from "executooor";

export class LiquidationEncoder extends ExecutorEncoder {
  constructor(address: string, runner: AbstractSigner<Provider>) {
    super(address, runner);
  }

  get provider() {
    return this.runner.provider!;
  }

  async handlePendleTokens(
    chainId: ChainId,
    market: Market,
    seizedAssets: bigint,
    executorAddress: string,
  ): Promise<{ srcAmount: bigint; srcToken: string }> {
    if (!pendleTokens[chainId].has(market.config.collateralToken)) {
      return {
        srcAmount: seizedAssets,
        srcToken: market.config.collateralToken,
      };
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
      this.erc20Approve(srcToken, redeemCallData.tx.to, MaxUint256)
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
      this.erc20Approve(srcToken, swapCallData.tx.to, MaxUint256)
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

  /**
   *  Swaps USD0USD0++ for USDC through the USD0/USD0++ && USD0/USDC pools
   *  Route is USD0USD0++ -> USD0 -> USDC
   * @returns the total swapped USDC amount
   */
  async curveSwapUsd0Usd0PPForUsdc(
    amount: bigint,
    expectedDestAmount: bigint,
    receiver: string,
  ) {
    // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0USD0++ and USD0 tokens
    this.erc20Approve(
      mainnetAddresses["usd0usd0++"]!,
      curvePools["usd0usd0++"],
      MaxUint256,
    );
    this.erc20Approve(
      mainnetAddresses["usd0"]!,
      curvePools["usd0usdc"],
      MaxUint256,
    );

    // Get the amount of USD0 that can be withdrawn from the USD0/USD0++ pool with USD0USD0++ tokens
    const withdrawableUSD0Amount = await getCurveWithdrawalAmount(
      this.provider,
      amount,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
      this.provider,
      expectedDestAmount,
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      curvePools["usd0usdc"],
    );

    // Encode the remove liquidity call to the USD0/USD0++ pool
    // go from USD0USD0++ -> USDO
    await encodeRemoveLiquidityFromCurvePool(
      amount,
      curvePools["usd0usd0++"],
      USD0_USD0PP_USD0_INDEX,
      minUSD0Amount,
      receiver,
      this,
    );

    // Encode the swap call to the USD0/USDC pool
    // go from USD0 -> USDC
    await encodeCurveSwap(
      withdrawableUSD0Amount,
      curvePools["usd0usdc"],
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      expectedDestAmount,
      receiver,
      this,
    );

    // Get the amount of USDC that can be swapped from the withdraw USD0 tokens from USD0/USD0++ pool
    const swappableAmount = await getCurveSwapOutputAmountFromInput(
      this.provider,
      withdrawableUSD0Amount,
      USD0_USD0PP_USDPP_INDEX,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await getCurveSwapOutputAmountFromInput(
      this.provider,
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
  async swapUSD0PPToUSDC(
    amount: bigint,
    expectedDestAmount: bigint,
    receiver: string,
  ) {
    // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0++ and USD0 tokens
    this.erc20Approve(
      mainnetAddresses["usd0++"]!,
      curvePools["usd0usd0++"],
      MaxUint256,
    );
    this.erc20Approve(
      mainnetAddresses["usd0"]!,
      curvePools["usd0usdc"],
      MaxUint256,
    );

    // Get the amount of USD0 that can be swapped from the USD0++ tokens from USD0/USD0++ pool
    const swappableAmount = await getCurveSwapOutputAmountFromInput(
      this.provider,
      amount,
      USD0_USD0PP_USDPP_INDEX,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await getCurveSwapOutputAmountFromInput(
      this.provider,
      swappableAmount,
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      curvePools["usd0usdc"],
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    // go from USD0 -> USDC
    const minUSD0Amount = await getCurveSwapInputAmountFromOutput(
      this.provider,
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
      this,
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
      this,
    );

    return finalUSDCAmount;
  }
}
