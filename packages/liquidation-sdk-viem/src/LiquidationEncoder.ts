import {
  type Address,
  ChainId,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { ExecutorEncoder } from "executooor-viem";
import {
  type Account,
  type Chain,
  type Client,
  type Transport,
  encodeFunctionData,
} from "viem";
import { readContract } from "viem/actions";
import { daiUsdsConverterAbi, mkrSkyConverterAbi } from "./abis.js";
import { curveStableSwapNGAbi, sUsdsAbi } from "./abis.js";
import { curvePools, mainnetAddresses } from "./addresses.js";
import { fetchBestSwap } from "./swap/index.js";
import { Pendle, Sky, Usual } from "./tokens/index.js";

interface SwapAttempt {
  srcAmount: bigint;
  srcToken: Address;
}

export class LiquidationEncoder<
  client extends Client<Transport, Chain, Account> = Client<
    Transport,
    Chain,
    Account
  >,
> extends ExecutorEncoder<client> {
  async handlePendleTokens(
    collateralToken: Address,
    seizedAssets: bigint,
    pendleTokens: Pendle.TokenListResponse,
  ) {
    if (
      !Pendle.isPTToken(collateralToken, this.client.chain.id, pendleTokens)
    ) {
      return {
        srcAmount: seizedAssets,
        srcToken: collateralToken,
      };
    }

    const pendleMarketResponse = await Pendle.getMarketForPTToken(
      this.client.chain.id,
      collateralToken,
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
    const srcToken = pendleMarketData.underlyingAsset.address;

    if (new Date(maturity) < new Date()) {
      // Pendle market is expired, we can directly redeem the collateral
      // If called before YT's expiry, both PT & YT of equal amounts are needed and will be burned. Else, only PT is needed and will be burned.
      const redeemCallData = await Pendle.getRedeemCallData(
        this.client.chain.id,
        {
          receiver: this.address,
          slippage: 0.04,
          yt: pendleMarketData.yt.address,
          amountIn: seizedAssets.toString(),
          tokenOut: pendleMarketData.underlyingAsset.address,
          enableAggregator: true,
        },
      );

      this.erc20Approve(srcToken, redeemCallData.tx.to, MathLib.MAX_UINT_256)
        .erc20Approve(
          collateralToken,
          redeemCallData.tx.to,
          MathLib.MAX_UINT_256,
        )
        .pushCall(
          redeemCallData.tx.to,
          redeemCallData.tx.value ? BigInt(redeemCallData.tx.value) : 0n,
          redeemCallData.tx.data,
        );
    } else {
      // Pendle market is not expired, we need to swap the collateral token (PT) to the underlying token
      const swapCallData = await Pendle.getSwapCallData(
        this.client.chain.id,
        pendleMarketData.address,
        {
          receiver: this.address,
          slippage: 0.04,
          tokenIn: collateralToken,
          tokenOut: pendleMarketData.underlyingAsset.address,
          amountIn: seizedAssets.toString(),
        },
      );
      this.erc20Approve(srcToken, swapCallData.tx.to, MathLib.MAX_UINT_256)
        .erc20Approve(collateralToken, swapCallData.tx.to, MathLib.MAX_UINT_256)
        .pushCall(
          swapCallData.tx.to,
          swapCallData.tx.value ? BigInt(swapCallData.tx.value) : 0n,
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
    receiver: Address,
  ) {
    // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0USD0++ and USD0 tokens
    this.erc20Approve(
      mainnetAddresses["usd0usd0++"]!,
      curvePools["usd0usd0++"],
      MathLib.MAX_UINT_256,
    );
    this.erc20Approve(
      mainnetAddresses.usd0!,
      curvePools.usd0usdc,
      MathLib.MAX_UINT_256,
    );

    // Get the amount of USD0 that can be withdrawn from the USD0/USD0++ pool with USD0USD0++ tokens
    const withdrawableUSD0Amount = await this.getCurveWithdrawalAmount(
      curvePools["usd0usd0++"],
      amount,
      Usual.USD0_USD0PP_USD0_INDEX,
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    const minUSD0Amount = await this.getCurveSwapInputAmountFromOutput(
      curvePools.usd0usdc,
      expectedDestAmount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
    );

    // Encode the remove liquidity call to the USD0/USD0++ pool
    // go from USD0USD0++ -> USDO
    await this.removeLiquidityFromCurvePool(
      curvePools["usd0usd0++"],
      amount,
      Usual.USD0_USD0PP_USD0_INDEX,
      minUSD0Amount,
      receiver,
    );

    // Encode the swap call to the USD0/USDC pool
    // go from USD0 -> USDC
    await this.curveSwap(
      curvePools.usd0usdc,
      withdrawableUSD0Amount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
      expectedDestAmount,
      receiver,
    );

    // Get the amount of USDC that can be swapped from the withdraw USD0 tokens from USD0/USD0++ pool
    const swappableAmount = await this.getCurveSwapOutputAmountFromInput(
      curvePools["usd0usd0++"],
      withdrawableUSD0Amount,
      Usual.USD0_USD0PP_USDPP_INDEX,
      Usual.USD0_USD0PP_USD0_INDEX,
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await this.getCurveSwapOutputAmountFromInput(
      curvePools.usd0usdc,
      swappableAmount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
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
    receiver: Address,
  ) {
    // Approve USD0/USD0++ and USD0/USDC pools to spend the USD0++ and USD0 tokens
    this.erc20Approve(
      mainnetAddresses["usd0++"]!,
      curvePools["usd0usd0++"],
      MathLib.MAX_UINT_256,
    );
    this.erc20Approve(
      mainnetAddresses.usd0!,
      curvePools.usd0usdc,
      MathLib.MAX_UINT_256,
    );

    // Get the amount of USD0 that can be swapped from the USD0++ tokens from USD0/USD0++ pool
    const swappableAmount = await this.getCurveSwapOutputAmountFromInput(
      curvePools["usd0usd0++"],
      amount,
      Usual.USD0_USD0PP_USDPP_INDEX,
      Usual.USD0_USD0PP_USD0_INDEX,
    );

    // Get the final amount of USDC that can be swapped from the swappable USD0 amount from USD0/USDC pool
    const finalUSDCAmount = await this.getCurveSwapOutputAmountFromInput(
      curvePools.usd0usdc,
      swappableAmount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
    );

    // Get the min USD0 amount required to receive the loan expected USDC amount from the USD0/USDC pool
    // go from USD0 -> USDC
    const minUSD0Amount = await this.getCurveSwapInputAmountFromOutput(
      curvePools["usd0usd0++"],
      expectedDestAmount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
    );

    // Encode the swap call to the USD0/USD0++ pool
    // go from USD0++ -> USD0
    await this.curveSwap(
      curvePools["usd0usd0++"],
      amount,
      Usual.USD0_USD0PP_USDPP_INDEX,
      Usual.USD0_USD0PP_USD0_INDEX,
      minUSD0Amount,
      receiver,
    );

    // Encode the swap call to the USD0/USDC pool
    // go from USD0 -> USDC
    await this.curveSwap(
      curvePools.usd0usdc,
      swappableAmount,
      Usual.USD0_USDC_USD0_INDEX,
      Usual.USD0_USDC_USDC_INDEX,
      expectedDestAmount,
      receiver,
    );

    return finalUSDCAmount;
  }

  public getCurveWithdrawalAmount(
    pool: Address,
    amount: bigint,
    tokenIndex: bigint,
  ) {
    return readContract(this.client, {
      address: pool,
      abi: curveStableSwapNGAbi,
      functionName: "calc_withdraw_one_coin",
      /**
       * @notice Calculate the amount received when withdrawing a single coin
       * @param _burn_amount Amount of LP tokens to burn in the withdrawal
       * @param i Index value of the coin to withdraw
       * @return Amount of coin received
       */
      args: [amount, tokenIndex],
    });
  }

  public getCurveSwapOutputAmountFromInput(
    pool: Address,
    amount: bigint,
    inputTokenIndex: bigint,
    outputTokenIndex: bigint,
  ) {
    return readContract(this.client, {
      address: pool,
      abi: curveStableSwapNGAbi,
      functionName: "get_dy",
      /**
       * @notice Calculate the current output dy given input dx
       * @dev Index values can be found via the `coins` public getter method
       * @param i Index value for the coin to send
       * @param j Index value of the coin to receive
       * @param dx Amount of `i` being exchanged
       * @return Amount of `j` predicted
       */
      args: [inputTokenIndex, outputTokenIndex, amount],
    });
  }

  public getCurveSwapInputAmountFromOutput(
    pool: Address,
    destAmount: bigint,
    inputTokenIndex: bigint,
    outputTokenIndex: bigint,
  ) {
    return readContract(this.client, {
      address: pool,
      abi: curveStableSwapNGAbi,
      functionName: "get_dx",
      /**
       * @notice Calculate the current input dx given output dy
       * @dev Index values can be found via the `coins` public getter method
       * @param i Index value for the coin to send
       * @param j Index value of the coin to receive
       * @param dy Amount of `j` being received after exchange
       * @return Amount of `i` predicted
       */
      args: [inputTokenIndex, outputTokenIndex, destAmount],
    });
  }

  public removeLiquidityFromCurvePool(
    pool: Address,
    amount: bigint,
    withdrawnTokenIndex: bigint,
    minReceived: bigint,
    receiver: Address,
  ) {
    this.pushCall(
      pool,
      0n,
      encodeFunctionData({
        abi: curveStableSwapNGAbi,
        functionName: "remove_liquidity_one_coin",
        /**
         * @notice Withdraw a single coin from the pool
         * @param _burn_amount Amount of LP tokens to burn in the withdrawal
         * @param i Index value of the coin to withdraw
         * @param _min_received Minimum amount of coin to receive
         * @param _receiver Address that receives the withdrawn coins
         * @return Amount of coin received
         */
        args: [amount, withdrawnTokenIndex, minReceived, receiver],
      }),
    );
  }

  public curveSwap(
    pool: Address,
    amount: bigint,
    inputTokenIndex: bigint,
    outputTokenIndex: bigint,
    minDestAmount: bigint,
    receiver: Address,
  ) {
    this.pushCall(
      pool,
      0n,
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
      encodeFunctionData({
        abi: curveStableSwapNGAbi,
        functionName: "exchange",
        args: [
          inputTokenIndex,
          outputTokenIndex,
          amount,
          minDestAmount,
          receiver,
        ],
      }),
    );
  }

  public previewUSDSWithdrawalAmount(amount: bigint) {
    return readContract(this.client, {
      address: mainnetAddresses.sUsds!,
      abi: sUsdsAbi,
      functionName: "previewWithdraw",
      args: [amount],
    });
  }

  public usdsWithdraw(amount: bigint, owner: Address, receiver: Address) {
    this.pushCall(
      mainnetAddresses.sUsds!,
      0n,
      encodeFunctionData({
        abi: sUsdsAbi,
        functionName: "withdraw",
        args: [amount, receiver, owner],
      }),
    );
  }

  public mkrToSky(amount: bigint, user: Address) {
    this.pushCall(
      mainnetAddresses.mkrSkyConverter!,
      0n,
      encodeFunctionData({
        abi: mkrSkyConverterAbi,
        functionName: "mkrToSky",
        args: [user, amount],
      }),
    );
  }

  public skyToMkr(amount: bigint, user: Address) {
    this.pushCall(
      mainnetAddresses.mkrSkyConverter!,
      0n,
      encodeFunctionData({
        abi: mkrSkyConverterAbi,
        functionName: "skyToMkr",
        args: [user, amount],
      }),
    );
  }

  public daiToUsds(amount: bigint, user: Address) {
    this.pushCall(
      mainnetAddresses.daiUsdsConverter!,
      0n,
      encodeFunctionData({
        abi: daiUsdsConverterAbi,
        functionName: "daiToUsds",
        args: [user, amount],
      }),
    );
  }

  public usdsToDai(amount: bigint, user: Address) {
    this.pushCall(
      mainnetAddresses.daiUsdsConverter!,
      0n,
      encodeFunctionData({
        abi: daiUsdsConverterAbi,
        functionName: "usdsToDai",
        args: [user, amount],
      }),
    );
  }

  public async handleTokenSwap(
    chainId: ChainId,
    initialSrcToken: Address,
    initialSrcAmount: bigint,
    marketParams: MarketParams,
    slippage: bigint,
    repaidAssets: bigint,
  ) {
    let srcToken = initialSrcToken;
    const srcAmount = initialSrcAmount;
    const tries: SwapAttempt[] = [];
    let dstAmount = 0n;

    while (true) {
      const bestSwap = await fetchBestSwap({
        chainId,
        src: srcToken,
        dst: marketParams.loanToken,
        amount: srcAmount,
        from: this.address,
        slippage,
        includeTokensInfo: false,
        includeProtocols: false,
        includeGas: false,
        allowPartialFill: false,
        disableEstimate: true,
        usePermit2: false,
      });

      tries.push({ srcAmount, srcToken });

      if (!bestSwap)
        throw Error("could not fetch swap from both 1inch and paraswap");

      dstAmount = BigInt(bestSwap.dstAmount);

      if (dstAmount < repaidAssets.wadMulDown(BigInt.WAD + slippage)) {
        // If we don't have enough liquidity, we try to swap to the alternative token and retry
        if (
          Sky.isSkyToken(srcToken) &&
          chainId === ChainId.EthMainnet &&
          tries.length === 1
        ) {
          srcToken = Sky.getAlternativeToken(srcToken);
        }
        // If even using the alternative token we still don't have enough liquidity, we try with both tokens (and half the amount)
        else if (Sky.isTokenPair(tries[0]?.srcToken, tries[1]?.srcToken)) {
          const halfAmount = srcAmount / 2n;
          const firstToken = tries[0]?.srcToken;
          const secondToken = tries[1]?.srcToken;

          // We'll retry with both tokens and half the amount
          const firstSwap = await fetchBestSwap({
            chainId,
            src: firstToken!,
            dst: marketParams.loanToken,
            amount: halfAmount,
            from: this.address,
            slippage,
            includeTokensInfo: false,
            includeProtocols: false,
            includeGas: false,
            allowPartialFill: false,
            disableEstimate: true,
            usePermit2: false,
          });
          if (!firstSwap) return;

          const secondSwap = await fetchBestSwap({
            chainId,
            src: secondToken!,
            dst: marketParams.loanToken,
            amount: halfAmount,
            from: this.address,
            slippage,
            includeTokensInfo: false,
            includeProtocols: false,
            includeGas: false,
            allowPartialFill: false,
            disableEstimate: true,
            usePermit2: false,
          });
          if (!secondSwap) return;

          if (
            BigInt(firstSwap.dstAmount) + BigInt(secondSwap.dstAmount) <
            repaidAssets.wadMulDown(BigInt.WAD + slippage)
          )
            return;

          this.erc20Approve(firstToken!, firstSwap.tx.to, halfAmount)
            .pushCall(
              firstSwap.tx.to,
              BigInt(firstSwap.tx.value),
              firstSwap.tx.data,
            )
            .erc20Approve(secondToken!, secondSwap.tx.to, halfAmount)
            .pushCall(
              secondSwap.tx.to,
              BigInt(secondSwap.tx.value),
              secondSwap.tx.data,
            );

          break;
        } else return;
      } else if (Sky.isTokenPair(tries[0]?.srcToken, tries[1]?.srcToken)) {
        const conversionFunction = Sky.getConversionFunction(
          tries[0]?.srcToken!,
          tries[1]?.srcToken!,
        );

        this.erc20Approve(tries[0]?.srcToken!, bestSwap.tx.to, srcAmount)
          .erc20Approve(tries[1]?.srcToken!, bestSwap.tx.to, srcAmount)
          [conversionFunction](srcAmount, this.address);

        break;
      } else {
        this.erc20Approve(srcToken, bestSwap.tx.to, srcAmount).pushCall(
          bestSwap.tx.to,
          BigInt(bestSwap.tx.value),
          bestSwap.tx.data,
        );

        break;
      }
    }

    return { dstAmount };
  }
}
