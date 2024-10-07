import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import {
  AbstractSigner,
  MaxUint256,
  Provider,
  Signer,
  Wallet,
  getDefaultProvider,
  parseEther,
  toBigInt,
} from "ethers";
import { MulticallWrapper } from "ethers-multicall-provider";
import { ERC20__factory, ERC4626__factory } from "ethers-types";

import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import {
  Address,
  ChainId,
  ChainUtils,
  Hex64,
  MarketId,
  UnknownTokenPriceError,
  erc20WrapperTokens,
  getChainAddresses,
  isMarketId,
} from "@morpho-org/blue-sdk";

import {
  fetchAccrualPositionFromConfig,
  safeGetAddress,
  safeParseNumber,
} from "@morpho-org/blue-sdk-ethers";
import {
  LiquidationEncoder,
  apiSdk,
  mainnetAddresses,
  pendle,
  pendleTokens,
  swap,
} from "@morpho-org/blue-sdk-ethers-liquidation";
import { Time } from "@morpho-org/morpho-ts";

const converter = new BlueSdkConverter({
  parseAddress: safeGetAddress,
  parseNumber: safeParseNumber,
});

export const check = async (
  executorAddress: string,
  signer: AbstractSigner<Provider>,
  flashbotsSigner: Signer,
  additionalMarketIds: MarketId[] = [],
) => {
  const [flashbotsProvider, network] = await Promise.all([
    FlashbotsBundleProvider.create(signer.provider, flashbotsSigner),
    signer.provider.getNetwork(),
  ]);

  const chainId = ChainUtils.parseSupportedChainId(network.chainId);

  const {
    markets: { items: markets },
  } = await apiSdk.getWhitelistedMarketIds({
    chainId,
  });

  const { morpho, wNative } = getChainAddresses(chainId);

  const {
    assetByAddress: { priceUsd: wethPriceUsd },
    marketPositions: { items: positions },
  } = await apiSdk.getLiquidatablePositions({
    chainId,
    wNative,
    marketIds: additionalMarketIds.concat(
      markets?.map(({ uniqueKey }) => uniqueKey) ?? [],
    ),
  });

  if (wethPriceUsd == null) return [];

  const ethPriceUsd = safeParseNumber(wethPriceUsd, 18);

  return Promise.all(
    (positions ?? []).map(async (position) => {
      if (position.market.collateralAsset == null) return;

      const accrualPosition = await fetchAccrualPositionFromConfig(
        position.user.address,
        converter.getMarketConfig(position.market),
        signer,
        { chainId },
      );

      const { user, market, seizableCollateral } =
        accrualPosition.accrueInterest(Time.timestamp());

      try {
        const collateralToken = converter.getTokenWithPrice(
          position.market.collateralAsset,
          wethPriceUsd,
        );
        if (collateralToken.price == null)
          throw new UnknownTokenPriceError(collateralToken.address);

        const loanToken = converter.getTokenWithPrice(
          position.market.loanAsset,
          wethPriceUsd,
        );
        if (loanToken.price == null)
          throw new UnknownTokenPriceError(loanToken.address);

        const erc4626 = ERC4626__factory.connect(
          market.config.collateralToken,
          signer.provider,
        );

        const [
          collateralUnderlyingAsset,
          loanMorphoAllowance,
          ...triedLiquidity
        ] = await Promise.all([
          // Convex staking wrapper tokens expose both EIP-4626's `asset` and OZ's ERC20Wrapper's `underlying` view function.
          erc4626
            .asset()
            .catch(() => undefined),
          ERC20__factory.connect(loanToken.address, signer.provider).allowance(
            executorAddress,
            morpho,
          ),
          ...new Array(10)
            .fill(undefined)
            .map((_v, i) => seizableCollateral / 2n ** toBigInt(i))
            .filter(
              (seizedAssets) =>
                collateralToken.toUsd(seizedAssets)! > parseEther("1000"), // Do not try seizing less than $1000 collateral.
            )
            .map(async (seizedAssets) => {
              const repaidShares =
                market.getLiquidationRepaidShares(seizedAssets);

              return {
                seizedAssets,
                repaidShares,
                repaidAssets: market.toBorrowAssets(repaidShares),
                withdrawnAssets: await erc4626
                  .previewRedeem(seizedAssets, { blockTag: "pending" })
                  // Convex staking wrapper tokens do not expose the ERC-4626 `previewRedeem` view function.
                  .catch(() => undefined),
              };
            }),
        ]);

        if (triedLiquidity.length === 0) throw Error("seized zero");

        const slippage =
          (market.config.liquidationIncentiveFactor - BigInt.WAD) / 2n;

        await Promise.allSettled(
          triedLiquidity.map(
            async ({ seizedAssets, repaidAssets, withdrawnAssets }) => {
              try {
                let srcToken =
                  collateralUnderlyingAsset ?? market.config.collateralToken;
                let srcAmount = withdrawnAssets ?? seizedAssets;

                const encoder = new LiquidationEncoder(executorAddress, signer);

                let dstAmount = 0n;
                // Handle Pendle Tokens
                // To retrieve the tokens, we need to call the Pendle API to get the swap calldata
                if (pendleTokens[chainId].has(market.config.collateralToken)) {
                  const pendleMarketData =
                    pendle.pendleMarkets[chainId][
                      market.config.collateralToken
                    ];
                  const maturity = pendleMarketData?.maturity;
                  if (!maturity) {
                    throw Error("Pendle market not found");
                  }

                  srcAmount = seizedAssets;
                  srcToken = pendleMarketData.underlyingTokenAddress;
                  if (maturity < new Date()) {
                    // Pendle market is expired, we can directly redeem the collateral
                    // If called before YT's expiry, both PT & YT of equal amounts are needed and will be burned. Else, only PT is needed and will be burned.
                    const redeemCallData = await pendle.getPendleRedeemCallData(
                      chainId,
                      {
                        receiver: executorAddress,
                        slippage: 0.04,
                        yt: pendleMarketData.yieldTokenAddress,
                        amountIn: seizedAssets.toString(),
                        tokenOut: pendleMarketData.underlyingTokenAddress,
                        enableAggregator: true,
                      },
                    );

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
                    const swapCallData = await pendle.getPendleSwapCallData(
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
                }

                switch (true) {
                  // In case of Usual tokens, there aren't much liquidity outside of curve, so we use it instead of 1inch/paraswap
                  // Process USD0/USD0++ collateral liquidation with specific process (using curve)
                  case market.config.collateralToken ===
                    mainnetAddresses["usd0usd0++"] &&
                    chainId === ChainId.EthMainnet:
                    dstAmount = await encoder.curveSwapUsd0Usd0PPForUsdc(
                      srcAmount,
                      accrualPosition.market.toBorrowAssets(
                        accrualPosition.market.getLiquidationRepaidShares(
                          seizedAssets,
                        ),
                      ),
                      executorAddress,
                    );
                    break;
                  // Process USD0++ colalteral liquidation with specific process (using curve)
                  case market.config.collateralToken ===
                    mainnetAddresses["usd0++"] &&
                    chainId === ChainId.EthMainnet: {
                    dstAmount = await encoder.swapUSD0PPToUSDC(
                      srcAmount,
                      accrualPosition.market.toBorrowAssets(
                        accrualPosition.market.getLiquidationRepaidShares(
                          seizedAssets,
                        ),
                      ),
                      executorAddress,
                    );
                    break;
                  }
                  // Default case, use 1inch/paraswap for other collaterals
                  default: {
                    const bestSwap = await swap.fetchBestSwap({
                      chainId,
                      src: srcToken,
                      dst: market.config.loanToken,
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
                    if (!bestSwap)
                      throw Error(
                        "could not fetch swap from both 1inch and paraswap",
                      );
                    dstAmount = toBigInt(bestSwap.dstAmount);

                    if (
                      dstAmount < repaidAssets.wadMulDown(BigInt.WAD + slippage)
                    )
                      return;
                    encoder
                      .erc20Approve(srcToken, bestSwap.tx.to, srcAmount)
                      .pushCall(
                        bestSwap.tx.to,
                        bestSwap.tx.value,
                        bestSwap.tx.data,
                      );
                    break;
                  }
                }

                // Handle ERC20Wrapper collateral tokens.
                if (
                  erc20WrapperTokens[chainId].has(market.config.collateralToken)
                )
                  encoder.erc20WrapperWithdrawTo(
                    market.config.collateralToken,
                    executorAddress,
                    seizedAssets,
                  );

                // Handle ERC4626 share tokens.
                // Convex staking wrapper tokens will have an underlying token but won't expose the corresponding withdrawn asset,
                // which are automatically withdrawn upon liquidation, at an exchange rate of 1.
                if (
                  collateralUnderlyingAsset != null &&
                  withdrawnAssets != null
                )
                  encoder.erc4626Redeem(
                    market.config.collateralToken,
                    seizedAssets,
                    executorAddress,
                    executorAddress,
                  );

                if (loanMorphoAllowance === 0n)
                  // Allows to handle changes in repaidAssets due to price changes and saves gas.
                  encoder.erc20Approve(
                    market.config.loanToken,
                    morpho,
                    MaxUint256,
                  );

                encoder.morphoBlueLiquidate(
                  morpho,
                  market.config,
                  user,
                  seizedAssets,
                  0n,
                  encoder.flush(),
                );

                const populatedTx = await encoder.populateExec();
                const [gasLimit, block, nonce] = await Promise.all([
                  signer.estimateGas(populatedTx),
                  signer.provider.getBlock("latest", false),
                  signer.getNonce(), // Always use latest committed nonce (not pending) to guarantee tx can be included.
                ]);

                if (block == null) throw Error("could not fetch latest block");

                const { baseFeePerGas } = block;
                if (baseFeePerGas == null)
                  throw Error("could not fetch latest baseFeePerGas");

                const maxFeePerGas =
                  FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(
                    baseFeePerGas,
                    1,
                  );
                const gasLimitUsd = ethPriceUsd.wadMulDown(
                  gasLimit * maxFeePerGas,
                );
                const profitUsd = loanToken.toUsd(dstAmount - repaidAssets)!;

                if (gasLimitUsd > profitUsd)
                  throw Error(
                    `gas cost ($${gasLimitUsd.formatWad(
                      2,
                    )}) > profit ($${profitUsd.formatWad(2)})`,
                  );

                const transaction = {
                  ...populatedTx,
                  chainId,
                  nonce,
                  gasLimit, // Avoid estimating gas again.
                  maxFeePerGas,
                };

                if (chainId === ChainId.EthMainnet) {
                  const signedBundle = await flashbotsProvider.signBundle([
                    {
                      signer,
                      transaction,
                    },
                  ]);

                  return await flashbotsProvider.sendRawBundle(
                    signedBundle,
                    block.number + 1,
                  );
                } else {
                  return await signer.sendTransaction(transaction);
                }
              } catch (error: any) {
                if (error instanceof Error)
                  // eslint-disable-next-line no-console
                  console.warn(
                    `Tried liquidating "${seizedAssets}" collateral ("${withdrawnAssets}" underlying) from "${user}" on market "${market.id}":`,
                    error.message,
                  );

                return;
              }
            },
          ),
        );
      } catch (error: any) {
        if (error instanceof Error)
          // eslint-disable-next-line no-console
          console.warn(
            `Could not liquidate user "${user}" on market "${market.id}":`,
            error.message,
          );

        return;
      }
    }),
  );
};

const main = async (
  executorAddress: Address,
  rpcUrl: string,
  liquidatorPrivateKey: Hex64,
  flashbotsPrivateKey: Hex64,
  additionalMarketIds: string[] = [],
) =>
  await check(
    executorAddress,
    new Wallet(
      liquidatorPrivateKey,
      MulticallWrapper.wrap(getDefaultProvider(rpcUrl)),
    ) as AbstractSigner<Provider>,
    new Wallet(flashbotsPrivateKey),
    additionalMarketIds.filter(isMarketId),
  );

export default main;
