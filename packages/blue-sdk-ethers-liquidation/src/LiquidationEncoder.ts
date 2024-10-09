import { Address, ChainId } from "@morpho-org/blue-sdk";
import { AbstractSigner, MaxUint256, Provider } from "ethers";
import { ExecutorEncoder } from "executooor";
import { curvePools, mainnetAddresses } from "./addresses";
import { CurveStableSwapNG__factory } from "./contracts/curve";
import * as pendle from "./tokens/pendle";
import {
  USD0_USD0PP_USD0_INDEX,
  USD0_USD0PP_USDPP_INDEX,
  USD0_USDC_USD0_INDEX,
  USD0_USDC_USDC_INDEX,
} from "./tokens/usual";

export class LiquidationEncoder extends ExecutorEncoder {
  constructor(address: string, runner: AbstractSigner<Provider>) {
    super(address, runner);
  }

  get provider() {
    return this.runner.provider!;
  }

  async handlePendleTokens(
    chainId: ChainId,
    collatToken: string,
    seizedAssets: bigint,
    pendleTokens: pendle.PendleTokenListResponse,
  ): Promise<{ srcAmount: bigint; srcToken: string }> {
    if (!pendle.isPendlePTToken(collatToken, chainId, pendleTokens)) {
      return {
        srcAmount: seizedAssets,
        srcToken: collatToken,
      };
    }

    const pendleMarketResponse = await pendle.getPendleMarketForPTToken(
      chainId,
      collatToken,
    );
    if (pendleMarketResponse.total !== 1) {
      throw Error("Invalid Pendle market result");
    }
    const pendleMarketData = pendleMarketResponse.results[0]!;
    const maturity = pendleMarketData.pt.expiry!;
    if (!maturity) {
      throw Error("Pendle market not found");
    }

    let srcAmount = seizedAssets;
    let srcToken = pendleMarketData.underlyingAsset.address;

    if (new Date(maturity) < new Date()) {
      // Pendle market is expired, we can directly redeem the collateral
      // If called before YT's expiry, both PT & YT of equal amounts are needed and will be burned. Else, only PT is needed and will be burned.
      const redeemCallData = await pendle.getPendleRedeemCallData(chainId, {
        receiver: this.address,
        slippage: 0.04,
        yt: pendleMarketData.yt.address,
        amountIn: seizedAssets.toString(),
        tokenOut: pendleMarketData.underlyingAsset.address,
        enableAggregator: true,
      });

      this.erc20Approve(srcToken, redeemCallData.tx.to, MaxUint256)
        .erc20Approve(collatToken, redeemCallData.tx.to, MaxUint256)
        .pushCall(
          redeemCallData.tx.to,
          redeemCallData.tx.value ? redeemCallData.tx.value : 0n,
          redeemCallData.tx.data,
        );
    } else {
      // Pendle market is not expired, we need to swap the collateral token (PT) to the underlying token
      const swapCallData = await pendle.getPendleSwapCallData(
        chainId,
        pendleMarketData.address,
        {
          receiver: this.address,
          slippage: 0.04,
          tokenIn: collatToken,
          tokenOut: pendleMarketData.underlyingAsset.address,
          amountIn: seizedAssets.toString(),
        },
      );
      this.erc20Approve(srcToken, swapCallData.tx.to, MaxUint256)
        .erc20Approve(collatToken, swapCallData.tx.to, MaxUint256)
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
    const withdrawableUSD0Amount = await this.getCurveWithdrawalAmount(
      amount,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    const minUSD0Amount = await this.getCurveSwapInputAmountFromOutput(
      expectedDestAmount,
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      curvePools["usd0usdc"],
    );

    // Encode the remove liquidity call to the USD0/USD0++ pool
    // go from USD0USD0++ -> USDO
    await this.encodeRemoveLiquidityFromCurvePool(
      amount,
      curvePools["usd0usd0++"],
      USD0_USD0PP_USD0_INDEX,
      minUSD0Amount,
      receiver,
    );

    // Encode the swap call to the USD0/USDC pool
    // go from USD0 -> USDC
    await this.encodeCurveSwap(
      withdrawableUSD0Amount,
      curvePools["usd0usdc"],
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      expectedDestAmount,
      receiver,
    );

    // Get the amount of USDC that can be swapped from the withdraw USD0 tokens from USD0/USD0++ pool
    const swappableAmount = await this.getCurveSwapOutputAmountFromInput(
      withdrawableUSD0Amount,
      USD0_USD0PP_USDPP_INDEX,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await this.getCurveSwapOutputAmountFromInput(
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
    const swappableAmount = await this.getCurveSwapOutputAmountFromInput(
      amount,
      USD0_USD0PP_USDPP_INDEX,
      USD0_USD0PP_USD0_INDEX,
      curvePools["usd0usd0++"],
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await this.getCurveSwapOutputAmountFromInput(
      swappableAmount,
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      curvePools["usd0usdc"],
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    // go from USD0 -> USDC
    const minUSD0Amount = await this.getCurveSwapInputAmountFromOutput(
      expectedDestAmount,
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      curvePools["usd0usd0++"],
    );

    // Encode the swap call to the USD0/USD0++ pool
    // go from USD0++ -> USD0
    await this.encodeCurveSwap(
      amount,
      curvePools["usd0usd0++"],
      USD0_USD0PP_USDPP_INDEX,
      USD0_USD0PP_USD0_INDEX,
      minUSD0Amount,
      receiver,
    );

    // Encode the swap call to the USD0/USDC pool
    // go from USD0 -> USDC
    await this.encodeCurveSwap(
      swappableAmount,
      curvePools["usd0usdc"],
      USD0_USDC_USD0_INDEX,
      USD0_USDC_USDC_INDEX,
      expectedDestAmount,
      receiver,
    );

    return finalUSDCAmount;
  }

  async getCurveWithdrawalAmount(
    amount: bigint,
    tokenIndex: number,
    curvePool: Address,
  ): Promise<bigint> {
    const contract = CurveStableSwapNG__factory.connect(
      curvePool,
      this.provider,
    );

    /**
     * @notice Calculate the amount received when withdrawing a single coin
     * @param _burn_amount Amount of LP tokens to burn in the withdrawal
     * @param i Index value of the coin to withdraw
     * @return Amount of coin received
     */
    const result = await contract.calc_withdraw_one_coin!(amount, tokenIndex);
    return result;
  }

  async getCurveSwapOutputAmountFromInput(
    amount: bigint,
    inputTokenIndex: number,
    outputTokenIndex: number,
    curvePool: Address,
  ): Promise<bigint> {
    const contract = CurveStableSwapNG__factory.connect(
      curvePool,
      this.provider,
    );

    /**
     * @notice Calculate the current output dy given input dx
     * @dev Index values can be found via the `coins` public getter method
     * @param i Index value for the coin to send
     * @param j Index value of the coin to receive
     * @param dx Amount of `i` being exchanged
     * @return Amount of `j` predicted
     */
    const result = await contract.get_dy!(
      inputTokenIndex,
      outputTokenIndex,
      amount,
    );
    return result;
  }

  async getCurveSwapInputAmountFromOutput(
    destAmount: bigint,
    inputTokenIndex: number,
    outputTokenIndex: number,
    curvePool: Address,
  ): Promise<bigint> {
    const contract = CurveStableSwapNG__factory.connect(
      curvePool,
      this.provider,
    );

    /**
     * @notice Calculate the current input dx given output dy
     * @dev Index values can be found via the `coins` public getter method
     * @param i Index value for the coin to send
     * @param j Index value of the coin to receive
     * @param dy Amount of `j` being received after exchange
     * @return Amount of `i` predicted
     */
    const result = await contract.get_dx!(
      inputTokenIndex,
      outputTokenIndex,
      destAmount,
    );
    return result;
  }

  async encodeRemoveLiquidityFromCurvePool(
    amount: bigint,
    curvePool: Address,
    withdrawnTokenIndex: number,
    minReceived: bigint,
    receiver: string,
  ) {
    const contract = CurveStableSwapNG__factory.connect(
      curvePool,
      this.provider,
    );

    /**
     * @notice Withdraw a single coin from the pool
     * @param _burn_amount Amount of LP tokens to burn in the withdrawal
     * @param i Index value of the coin to withdraw
     * @param _min_received Minimum amount of coin to receive
     * @param _receiver Address that receives the withdrawn coins
     * @return Amount of coin received
     */
    this.pushCall(
      curvePool,
      0n,
      contract.interface.encodeFunctionData(
        "remove_liquidity_one_coin(uint256,int128,uint256,address)",
        [amount, withdrawnTokenIndex, minReceived, receiver],
      ),
    );
  }

  async encodeCurveSwap(
    amount: bigint,
    curvePool: Address,
    inputTokenIndex: number,
    outputTokenIndex: number,
    minDestAmount: bigint,
    receiver: string,
  ) {
    const contract = CurveStableSwapNG__factory.connect(
      curvePool,
      this.provider,
    );
    /**
     * @notice Perform an exchange between two coins
     * @dev Index values can be found via the `coins` public getter method
     * @param i Index value for the coin to send
     * @param j Index value of the coin to receive
     * @param _dx Amount of `i` being exchanged
     * @param _min_dy Minimum amount of `j` to receive
     * @param _receiver Address that receives `j`
     * @return Actual amount of `j` received
     */
    this.pushCall(
      curvePool,
      0n,
      contract.interface.encodeFunctionData(
        "exchange(int128,int128,uint256,uint256,address)",
        [inputTokenIndex, outputTokenIndex, amount, minDestAmount, receiver],
      ),
    );
  }
}
