import { ChainId, type Market } from "@morpho-org/blue-sdk";
import { retryPromiseLinearBackoff } from "@morpho-org/morpho-ts";
import type { Account, Address, Chain, Client, Transport } from "viem";
import type { LiquidationEncoder } from "../LiquidationEncoder.js";
import { Sky } from "../tokens/sky.js";
import { OneInch } from "./1inch.js";
import { Paraswap } from "./paraswap.js";
import type { SwapParams, SwapResponse } from "./types.js";
export * from "./1inch.js";
export * from "./paraswap.js";
export * from "./types.js";

interface SwapAttempt {
  srcAmount: bigint;
  srcToken: Address;
}

interface SwapResult {
  dstAmount: bigint;
  encoder: LiquidationEncoder;
}

export async function fetchBestSwap(
  swapParams: SwapParams,
): Promise<SwapResponse | null> {
  const results = await Promise.allSettled([
    retryPromiseLinearBackoff(() => OneInch.fetchSwap(swapParams), {
      timeout: 200,
      onError: (error) => {
        if (error instanceof Error) {
          if (error.message === "Not Found") return true;
        }
        return false;
      },
    }),
    retryPromiseLinearBackoff(() => Paraswap.fetchSwap(swapParams), {
      timeout: 200,
      onError: (error) => {
        if (error instanceof Error) {
          if (
            error.message === "Not Found" ||
            error.message.startsWith("invalid json response body")
          )
            return true;
        }
        return false;
      },
    }),
  ]);

  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<SwapResponse> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  if (successfulResults.length === 0) {
    return null;
  }

  // Compare the results and return the best one
  return successfulResults.reduce((best, current) => {
    const bestDstAmount = BigInt(best.dstAmount);
    const currentDstAmount = BigInt(current.dstAmount);

    if (currentDstAmount > bestDstAmount) {
      return current;
    }
    return best;
  });
}

export async function handleTokenSwap(
  chainId: ChainId,
  initialSrcToken: Address,
  initialSrcAmount: bigint,
  market: Market,
  executorAddress: Address,
  slippage: bigint,
  repaidAssets: bigint,
  encoder: LiquidationEncoder<Client<Transport, Chain, Account>>,
): Promise<SwapResult | undefined> {
  let srcToken = initialSrcToken;
  const srcAmount = initialSrcAmount;
  const tries: SwapAttempt[] = [];
  let dstAmount = 0n;

  while (true) {
    const bestSwap = await fetchBestSwap({
      chainId,
      src: srcToken,
      dst: market.params.loanToken,
      amount: srcAmount,
      from: executorAddress,
      slippage,
      includeTokensInfo: false,
      includeProtocols: false,
      includeGas: false,
      allowPartialFill: false,
      disableEstimate: true,
      usePermit2: false,
    });
    tries.push({ srcAmount, srcToken });

    if (!bestSwap) {
      throw Error("could not fetch swap from both 1inch and paraswap");
    }

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
          dst: market.params.loanToken,
          amount: halfAmount,
          from: executorAddress,
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
          dst: market.params.loanToken,
          amount: halfAmount,
          from: executorAddress,
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
        ) {
          return;
        }

        encoder
          .erc20Approve(firstToken!, firstSwap.tx.to, halfAmount)
          .pushCall(
            firstSwap.tx.to,
            BigInt(firstSwap.tx.value),
            firstSwap.tx.data,
          );

        encoder
          .erc20Approve(secondToken!, secondSwap.tx.to, halfAmount)
          .pushCall(
            secondSwap.tx.to,
            BigInt(secondSwap.tx.value),
            secondSwap.tx.data,
          );

        break;
      } else {
        return;
      }
    } else if (Sky.isTokenPair(tries[0]?.srcToken, tries[1]?.srcToken)) {
      const conversionFunction = Sky.getConversionFunction(
        tries[0]?.srcToken!,
        tries[1]?.srcToken!,
      );
      encoder.erc20Approve(tries[0]?.srcToken!, bestSwap.tx.to, srcAmount);
      encoder.erc20Approve(tries[1]?.srcToken!, bestSwap.tx.to, srcAmount);

      encoder[conversionFunction](srcAmount, executorAddress);
      break;
    } else {
      encoder
        .erc20Approve(srcToken, bestSwap.tx.to, srcAmount)
        .pushCall(bestSwap.tx.to, BigInt(bestSwap.tx.value), bestSwap.tx.data);
      break;
    }
  }

  return {
    dstAmount,
    encoder,
  };
}
