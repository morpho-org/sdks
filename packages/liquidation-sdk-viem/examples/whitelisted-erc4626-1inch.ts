import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import {
  type Address,
  ChainId,
  ChainUtils,
  type MarketId,
  UnknownTokenPriceError,
  erc20WrapperTokens,
  getChainAddresses,
  isMarketId,
} from "@morpho-org/blue-sdk";

import {
  fetchAccrualPosition,
  safeGetAddress,
  safeParseNumber,
} from "@morpho-org/blue-sdk-viem";
import {
  Flashbots,
  LiquidationEncoder,
  Pendle,
  apiSdk,
  fetchBestSwap,
  mainnetAddresses,
} from "@morpho-org/liquidation-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Chain,
  type LocalAccount,
  type Transport,
  type WalletClient,
  erc20Abi,
  erc4626Abi,
  maxUint256,
  parseEther,
} from "viem";
import {
  estimateFeesPerGas,
  estimateGas,
  getBlock,
  getTransactionCount,
  readContract,
  sendTransaction,
} from "viem/actions";

const converter = new BlueSdkConverter({
  parseAddress: safeGetAddress,
  parseNumber: safeParseNumber,
});

export const check = async <
  client extends WalletClient<Transport, Chain, Account>,
>(
  executorAddress: Address,
  client: client,
  flashbotsAccount: LocalAccount,
  additionalMarketIds: MarketId[] = [],
) => {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);

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

  const pendleTokens = await Pendle.getTokens(chainId);

  return Promise.all(
    (positions ?? []).map(async (position) => {
      if (position.market.collateralAsset == null) return;

      const accrualPosition = await fetchAccrualPosition(
        position.user.address,
        position.market.uniqueKey,
        client,
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

        // const erc4626 = ERC4626__factory.connect(
        //   market.config.collateralToken,
        //   signer.provider,
        // );

        const [
          collateralUnderlyingAsset,
          loanMorphoAllowance,
          ...triedLiquidity
        ] = await Promise.all([
          // Convex staking wrapper tokens expose both EIP-4626's `asset` and OZ's ERC20Wrapper's `underlying` view function.
          readContract(client, {
            address: market.config.collateralToken,
            abi: erc4626Abi,
            functionName: "asset",
          }).catch(() => undefined),
          readContract(client, {
            address: loanToken.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [executorAddress, morpho],
          }),
          ...new Array(10)
            .fill(undefined)
            .map((_v, i) => seizableCollateral / 2n ** BigInt(i))
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
                withdrawnAssets: await readContract(client, {
                  address: market.config.collateralToken,
                  abi: erc4626Abi,
                  functionName: "previewRedeem",
                  args: [seizedAssets],
                  blockTag: "pending",
                })
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

                const encoder = new LiquidationEncoder(executorAddress, client);

                let dstAmount = 0n;
                // Handle Pendle Tokens
                // To retrieve the tokens, we need to call the Pendle API to get the swap calldata
                ({ srcAmount, srcToken } = await encoder.handlePendleTokens(
                  market.config.collateralToken,
                  seizedAssets,
                  pendleTokens,
                ));

                // As there is no liquidity for sUSDS, we use the sUSDS withdrawal function to get USDS instead
                if (
                  market.config.collateralToken === mainnetAddresses.sUsds &&
                  chainId === ChainId.EthMainnet
                ) {
                  const usdsWithdrawalAmount =
                    await encoder.previewUSDSWithdrawalAmount(srcAmount);

                  encoder.erc20Approve(
                    mainnetAddresses.sUsds,
                    mainnetAddresses.sUsds,
                    maxUint256,
                  );
                  encoder.usdsWithdraw(
                    usdsWithdrawalAmount,
                    executorAddress,
                    executorAddress,
                  );
                  srcAmount = usdsWithdrawalAmount;
                  srcToken = mainnetAddresses.usds!;
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
                    const bestSwap = await fetchBestSwap({
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
                    dstAmount = BigInt(bestSwap.dstAmount);

                    if (
                      dstAmount < repaidAssets.wadMulDown(BigInt.WAD + slippage)
                    )
                      return;
                    encoder
                      .erc20Approve(srcToken, bestSwap.tx.to, srcAmount)
                      .pushCall(
                        bestSwap.tx.to,
                        BigInt(bestSwap.tx.value),
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
                  withdrawnAssets != null &&
                  !(mainnetAddresses.sUsds && chainId === ChainId.EthMainnet)
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
                    maxUint256,
                  );

                encoder.morphoBlueLiquidate(
                  morpho,
                  market.config,
                  user,
                  seizedAssets,
                  0n,
                  encoder.flush(),
                );

                const populatedTx = await encoder.encodeExec();
                const [gasLimit, block, txCount, { maxFeePerGas }] =
                  await Promise.all([
                    estimateGas(client, populatedTx),
                    getBlock(client),
                    getTransactionCount(client, {
                      address: client.account.address,
                    }), // Always use latest committed nonce (not pending) to guarantee tx can be included.
                    estimateFeesPerGas(client),
                  ]);

                if (block == null) throw Error("could not fetch latest block");

                const { baseFeePerGas } = block;
                if (baseFeePerGas == null)
                  throw Error("could not fetch latest baseFeePerGas");

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
                  nonce: txCount + 1,
                  gas: gasLimit, // Avoid estimating gas again.
                  maxFeePerGas,
                };

                if (chainId === ChainId.EthMainnet) {
                  const signedBundle = await Flashbots.signBundle([
                    {
                      transaction,
                      client,
                    },
                  ]);

                  return await Flashbots.sendRawBundle(
                    signedBundle,
                    block.number + 1n,
                    flashbotsAccount,
                  );
                }

                return await sendTransaction(client, transaction);
              } catch (error) {
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
      } catch (error) {
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

const main = async <client extends WalletClient<Transport, Chain, Account>>(
  executorAddress: Address,
  client: client,
  flashbotsAccount: LocalAccount,
  additionalMarketIds: string[] = [],
) =>
  await check(
    executorAddress,
    client,
    flashbotsAccount,
    additionalMarketIds.filter(isMarketId),
  );

export default main;
