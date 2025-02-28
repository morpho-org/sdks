import nock from "nock";
import "evm-maths";
import fetchMock from "fetch-mock";

import {
  type Address,
  ChainId,
  type InputMarketParams,
  type MarketId,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL, format } from "@morpho-org/morpho-ts";
import type { BuildTxInput } from "@paraswap/sdk";

import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import {
  Flashbots,
  type LiquidationEncoder,
} from "@morpho-org/liquidation-sdk-viem";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelistedMarkets.js";
import { OneInch, Paraswap, Spectra } from "../../src/index.js";
import * as swapMock from "../contracts/SwapMock.js";
import spectraTokens from "../mockData/spectraTokens.json";
import { type LiquidationTestContext, spectraTest } from "../setup.js";

interface SwapAmountConfig {
  srcAmount: bigint;
  dstAmount: string;
}

fetchMock.config.fallbackToNetwork = true;
fetchMock.config.overwriteRoutes = false;
fetchMock.config.warnOnFallback = false;

const oneInchSwapApiMatcher = new RegExp(`${OneInch.getSwapApiUrl(1)}.*`);
const paraSwapPriceApiMatcher = new RegExp(`${Paraswap.API_URL}/prices.*`);
const paraSwapTxApiMatcher = new RegExp(`${Paraswap.API_URL}/transactions.*`);

const { morpho } = addressesRegistry[ChainId.EthMainnet];

const borrower = testAccount(1);

describe("should liquidate Spectra Tokens", () => {
  let swapMockAddress: Address;

  beforeEach<LiquidationTestContext<typeof mainnet>>(async ({ client }) => {
    swapMockAddress = (await client.deployContractWait(swapMock))
      .contractAddress;

    vi.spyOn(Flashbots, "sendRawBundle").mockImplementation(async (txs) => {
      for (const serializedTransaction of txs) {
        await client.sendRawTransaction({ serializedTransaction });
      }
    });

    fetchMock.get(new RegExp(`${Spectra.apiUrl(1)}.*`), spectraTokens);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fetchMock.restore();
  });

  const syncTimestamp = async (client: AnvilTestClient, timestamp?: bigint) => {
    timestamp ??= (await client.timestamp()) + 60n;

    vi.useFakeTimers({
      now: Number(timestamp) * 1000,
      toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
    });

    await client.setNextBlockTimestamp({ timestamp });

    return timestamp;
  };

  const mockOneInch = (
    encoder: LiquidationEncoder<AnvilTestClient>,
    configs: SwapAmountConfig[],
  ) => {
    let chain = fetchMock;

    for (const config of configs) {
      chain = chain.get(
        oneInchSwapApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const dstToken = url.searchParams.get("dst") as Address;

          const amount = await encoder.client.readContract({
            address: dstToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [swapMockAddress],
          });
          await encoder.client.deal({
            erc20: dstToken,
            account: swapMockAddress,
            amount: amount + BigInt(config.dstAmount),
          });

          return {
            dstAmount: config.dstAmount,
            tx: {
              from: encoder.address,
              to: swapMockAddress,
              data: encodeFunctionData({
                abi: swapMock.abi,
                functionName: "swap",
                args: [
                  {
                    token: url.searchParams.get("src")! as Address,
                    amount: BigInt(url.searchParams.get("amount")!),
                  },
                  {
                    token: dstToken,
                    amount: BigInt(config.dstAmount),
                  },
                ],
              }),
              value: "0",
              gas: 0,
              gasPrice: "0",
            },
          };
        },
        {
          query: {
            amount: config.srcAmount.toString(),
          },
        },
      );
    }

    chain.mock(oneInchSwapApiMatcher, 404);
  };

  const mockParaSwap = (
    encoder: LiquidationEncoder<AnvilTestClient>,
    configs: SwapAmountConfig[],
  ) => {
    let priceChain = fetchMock;
    let txChain = fetchMock;

    for (const config of configs) {
      priceChain = priceChain.get(
        paraSwapPriceApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const srcToken = url.searchParams.get("srcToken") as Address;
          const destToken = url.searchParams.get("destToken") as Address;

          const amount = await encoder.client.readContract({
            address: destToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [swapMockAddress],
          });
          await encoder.client.deal({
            erc20: destToken,
            account: swapMockAddress,
            amount: amount + BigInt(config.dstAmount),
          });

          return {
            priceRoute: {
              blockNumber: 12345678,
              network: 1,
              srcToken,
              srcDecimals: 18,
              srcAmount: config.srcAmount,
              destToken,
              destDecimals: 18,
              destAmount: config.dstAmount,
              bestRoute: [
                {
                  percent: 100,
                  swaps: [
                    {
                      srcToken,
                      srcDecimals: 18,
                      destToken,
                      destDecimals: 18,
                      swapExchanges: [
                        {
                          exchange: "MockExchange",
                          srcAmount: config.srcAmount,
                          destAmount: config.dstAmount,
                          percent: 100,
                        },
                      ],
                    },
                  ],
                },
              ],
              gasCostUSD: "5",
              gasCost: "100000",
              side: "SELL",
              tokenTransferProxy: "0x216B4B4Ba9F3e719726886d34a177484278Bfcae",
              contractAddress: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
            },
          };
        },
        {
          query: {
            amount: config.srcAmount.toString(),
          },
        },
      );

      txChain = txChain.post(paraSwapTxApiMatcher, async (_uri, body) => {
        const { srcToken, destToken } = body as BuildTxInput;

        const amount = await encoder.client.readContract({
          address: destToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [swapMockAddress],
        });
        await encoder.client.deal({
          erc20: destToken as Address,
          account: swapMockAddress,
          amount: amount + BigInt(config.dstAmount),
        });

        return {
          from: encoder.address,
          to: swapMockAddress,
          value: "0",
          data: encodeFunctionData({
            abi: swapMock.abi,
            functionName: "swap",
            args: [
              {
                token: srcToken as Address,
                amount: config.srcAmount,
              },
              {
                token: destToken as Address,
                amount: BigInt(config.dstAmount),
              },
            ],
          }),
          gasPrice: "0",
          chainId: 1,
          gas: "0",
        };
      });
    }

    priceChain.mock(paraSwapPriceApiMatcher, 404);
    txChain.mock(paraSwapTxApiMatcher, 404);
  };

  // Cannot run concurrently because `fetch` is mocked globally.
  spectraTest.sequential(
    `should liquidate on a PT standard market before maturity`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1;
      const ethPriceUsd = 2_644;

      const marketParams = {
        collateralToken:
          "0xD0097149AA4CC0d0e1fC99B8BD73fC17dC32C1E9" as `0x${string}`,
        loanToken:
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
        lltv: 860000000000000000n,
        oracle: "0x1325Eb089Ac14B437E78D5D481e32611F6907eF8" as `0x${string}`,
        irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`,
      };

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "createMarket",
        args: [marketParams],
      });

      const marketId =
        "0x5cf7f105260f7a8b8896c2d33cf765640d722b6dd01fbaae2dcc6a867261aae0" as MarketId;

      const collateralToken = {
        address: marketParams.collateralToken as Address,
        decimals: 18,
      };
      const loanToken = {
        address: marketParams.loanToken as Address,
        decimals: 6,
      };

      const collateral = parseUnits("10000", collateralToken.decimals);
      const borrowed = parseUnits("8600", loanToken.decimals);

      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.deal({
        erc20: marketParams.loanToken,
        account: borrower.address,
        amount: borrowed,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.approve({
        account: borrower,
        address: loanToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supply",
        args: [marketParams, borrowed, 0n, borrower.address, "0x"],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [marketParams, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          marketParams as InputMarketParams,
          borrowed,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const timestamp = await syncTimestamp(client);

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, { data: { markets: { items: [{ uniqueKey: marketId }] } } })
        .post("/graphql")
        .reply(200, {
          data: {
            assetByAddress: {
              priceUsd: ethPriceUsd,
              spotPriceEth: 1,
            },
            marketPositions: {
              items: [
                {
                  user: {
                    address: borrower.address,
                  },
                  market: {
                    uniqueKey: marketId,
                    collateralAsset: {
                      address: marketParams.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: collateralPriceUsd,
                      spotPriceEth: collateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: marketParams.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: 1,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "accrueInterest",
        args: [marketParams],
      });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      accrualPosition.accrueInterest(timestamp);

      await client.deal({
        erc20: marketParams.collateralToken,
        account: "0x23228469b3439d81dc64e3523068976201ba08c3",
        amount: 8977038222000000000000n,
      });

      // const seizedCollateral = accruedPosition.seizableCollateral!;
      mockOneInch(encoder, [
        {
          srcAmount: 8795050497547015034211n,
          dstAmount: "9000000000",
        },
      ]);
      mockParaSwap(encoder, [
        { srcAmount: 8795050497547015034211n, dstAmount: "9000000000" },
      ]);

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: loanToken.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        399.997382,
        6,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  spectraTest.sequential(
    `should liquidate on a PT standard market after maturity`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1;
      const ethPriceUsd = 2_644;

      const marketParams = {
        collateralToken:
          "0xD0097149AA4CC0d0e1fC99B8BD73fC17dC32C1E9" as `0x${string}`,
        loanToken:
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
        lltv: 860000000000000000n,
        oracle: "0x1325Eb089Ac14B437E78D5D481e32611F6907eF8" as `0x${string}`,
        irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`,
      };

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "createMarket",
        args: [marketParams],
      });

      const marketId =
        "0x5cf7f105260f7a8b8896c2d33cf765640d722b6dd01fbaae2dcc6a867261aae0" as MarketId;

      const collateralToken = {
        address: marketParams.collateralToken as Address,
        decimals: 18,
      };
      const loanToken = {
        address: marketParams.loanToken as Address,
        decimals: 6,
      };

      const collateral = parseUnits("10000", collateralToken.decimals);
      const borrowed = parseUnits("8600", loanToken.decimals);

      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.deal({
        erc20: marketParams.loanToken,
        account: borrower.address,
        amount: borrowed,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.approve({
        account: borrower,
        address: loanToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supply",
        args: [marketParams, borrowed, 0n, borrower.address, "0x"],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [marketParams, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          marketParams as InputMarketParams,
          borrowed,
          0n,
          borrower.address,
          borrower.address,
        ],
      });
      const maturity = 1740182579n;
      const timestamp = await syncTimestamp(client, maturity + 10n);

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, { data: { markets: { items: [{ uniqueKey: marketId }] } } })
        .post("/graphql")
        .reply(200, {
          data: {
            assetByAddress: {
              priceUsd: ethPriceUsd,
              spotPriceEth: 1,
            },
            marketPositions: {
              items: [
                {
                  user: {
                    address: borrower.address,
                  },
                  market: {
                    uniqueKey: marketId,
                    collateralAsset: {
                      address: marketParams.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: collateralPriceUsd,
                      spotPriceEth: collateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: marketParams.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: 1,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "accrueInterest",
        args: [marketParams],
      });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      accrualPosition.accrueInterest(timestamp);

      await client.deal({
        erc20: marketParams.collateralToken,
        account: "0x23228469b3439d81dc64e3523068976201ba08c3",
        amount: 8977038222000000000000n,
      });

      mockOneInch(encoder, [
        {
          srcAmount: 10000000000000000000794n,
          dstAmount: "10000000000",
        },
      ]);
      mockParaSwap(encoder, [
        { srcAmount: 10000000000000000000794n, dstAmount: "10000000000" },
      ]);

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: loanToken.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        419.999998,
        6,
      );
    },
  );
});
