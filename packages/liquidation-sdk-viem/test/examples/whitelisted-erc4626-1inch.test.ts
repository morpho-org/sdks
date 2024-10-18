import nock from "nock";
import "evm-maths";
import fetchMock from "fetch-mock";

import {
  type Address,
  ChainId,
  type MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL, ZERO_ADDRESS, format } from "@morpho-org/morpho-ts";
import type { BuildTxInput } from "@paraswap/sdk";

import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import {
  Flashbots,
  LiquidationEncoder,
} from "@morpho-org/liquidation-sdk-viem";
import { curveStableSwapNGAbi } from "@morpho-org/liquidation-sdk-viem/src/abis.js";
import { type AnvilTestClient, testAccount } from "@morpho-org/test-viem";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelisted-erc4626-1inch.js";
import {
  OneInch,
  Paraswap,
  Pendle,
  curvePools,
  mainnetAddresses,
} from "../../src/index.js";
import * as swapMock from "../contracts/SwapMock.js";
import pendleMarketData from "../pendleMockData/pendleMarketData.json";
import pendleTokens from "../pendleMockData/pendleTokens.json";
import { type LiquidationTestContext, test } from "../setup.js";

fetchMock.config.fallbackToNetwork = true;
fetchMock.config.overwriteRoutes = false;
fetchMock.config.warnOnFallback = false;

const oneInchSwapApiMatcher = new RegExp(`${OneInch.getSwapApiUrl(1)}.*`);
const paraSwapPriceApiMatcher = new RegExp(`${Paraswap.API_URL}/prices.*`);
const paraSwapTxApiMatcher = new RegExp(`${Paraswap.API_URL}/transactions.*`);

const pendleSwapApiMatcher = new RegExp(`${Pendle.getSwapApiUrl(1)}.*`);
const pendleRedeemApiMatcher = new RegExp(`${Pendle.getRedeemApiUrl(1)}.*`);

const { morpho } = addresses[ChainId.EthMainnet];

const borrower = testAccount(1);

describe("erc4626-1inch", () => {
  let swapMockAddress: Address;

  beforeEach<LiquidationTestContext<typeof mainnet>>(async ({ client }) => {
    swapMockAddress = (await client.deployContractWait(swapMock))
      .contractAddress;

    vi.spyOn(Flashbots, "sendRawBundle").mockImplementation(async (txs) => {
      for (const serializedTransaction of txs) {
        await client.sendRawTransaction({ serializedTransaction });
      }
    });

    fetchMock.get(new RegExp(`${Pendle.getTokensApiUrl(1)}.*`), pendleTokens);
    fetchMock.get(
      new RegExp(`${Pendle.getMarketsApiUrl(1)}.*`),
      pendleMarketData,
    );
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
    srcAmount: bigint,
    dstAmount: string,
  ) => {
    fetchMock
      .get(
        oneInchSwapApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const dstToken = url.searchParams.get("dst") as Address;

          await encoder.client.deal({
            erc20: dstToken,
            account: swapMockAddress,
            amount:
              (await encoder.client.readContract({
                address: dstToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [swapMockAddress],
              })) + BigInt(dstAmount),
          });

          return {
            dstAmount,
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
                    amount: BigInt(dstAmount), // TODO: simulate positive & negative slippage
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
            amount: srcAmount.toString(),
          },
        },
      )
      .mock(oneInchSwapApiMatcher, 404);
  };

  const mockParaSwap = (
    encoder: LiquidationEncoder<AnvilTestClient>,
    srcAmount: bigint,
    dstAmount: string,
  ) => {
    fetchMock
      .get(
        paraSwapPriceApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const srcToken = url.searchParams.get("srcToken") as Address;
          const destToken = url.searchParams.get("destToken") as Address;

          await encoder.client.deal({
            erc20: destToken,
            account: swapMockAddress,
            amount:
              (await encoder.client.readContract({
                address: destToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [swapMockAddress],
              })) + BigInt(dstAmount),
          });

          return {
            priceRoute: {
              blockNumber: 12345678,
              network: 1,
              srcToken,
              srcDecimals: 18,
              srcAmount: srcAmount,
              destToken,
              destDecimals: 18,
              destAmount: dstAmount,
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
                          srcAmount: srcAmount,
                          destAmount: dstAmount,
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
            amount: srcAmount.toString(),
          },
        },
      )
      .mock(paraSwapPriceApiMatcher, 404);

    fetchMock
      .post(paraSwapTxApiMatcher, async (_uri, body) => {
        const { srcToken, destToken } = body as BuildTxInput;

        await encoder.client.deal({
          erc20: destToken as Address,
          account: swapMockAddress,
          amount:
            (await encoder.client.readContract({
              address: destToken as Address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [swapMockAddress],
            })) + BigInt(dstAmount),
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
                amount: srcAmount,
              },
              {
                token: destToken as Address,
                amount: BigInt(dstAmount), // TODO: simulate positive & negative slippage
              },
            ],
          }),
          gasPrice: "0",
          chainId: 1,
          gas: "0",
        };
      })
      .mock(paraSwapTxApiMatcher, 404);
  };

  const mockPendleOperations = (
    encoder: LiquidationEncoder<AnvilTestClient>,
    srcAmount: bigint,
    dstAmount: string,
    ptToken: Address,
  ) => {
    fetchMock
      .get(
        pendleSwapApiMatcher,
        async (url) => {
          const parsedUrl = new URL(url);
          const marketSegment = url.split("/markets/")[1];
          if (!marketSegment)
            throw new Error("Market segment is undefined in the URL.");
          const market = marketSegment.split("/swap")[0];
          const receiver = parsedUrl.searchParams.get("receiver");
          const tokenIn = parsedUrl.searchParams.get("tokenIn") as Address;
          const tokenOut = parsedUrl.searchParams.get("tokenOut") as Address;
          const amountIn = BigInt(parsedUrl.searchParams.get("amountIn")!);

          await encoder.client.deal({
            erc20: tokenOut,
            account: swapMockAddress,
            amount:
              (await encoder.client.readContract({
                address: tokenOut,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [swapMockAddress],
              })) + srcAmount,
          });

          return {
            method: "swapExactPtForToken",
            contractCallParamsName: [
              "receiver",
              "market",
              "exactPtIn",
              "output",
              "limit",
            ],
            contractCallParams: [
              receiver,
              market,
              amountIn,
              {
                tokenOut: tokenOut,
                minTokenOut: srcAmount,
                tokenRedeemSy: tokenOut,
                pendleSwap: ZERO_ADDRESS,
                swapData: {
                  swapType: "0",
                  extRouter: ZERO_ADDRESS,
                  extCalldata: "",
                  needScale: false,
                },
              },
              {
                limitRouter: ZERO_ADDRESS,
                epsSkipMarket: "0",
                normalFills: [],
                flashFills: [],
                optData: "0x",
              },
            ],
            tx: {
              data: encodeFunctionData({
                abi: swapMock.abi,
                functionName: "swap",
                args: [
                  {
                    token: tokenIn,
                    amount: amountIn,
                  },
                  {
                    token: tokenOut,
                    amount: srcAmount, // TODO: simulate positive & negative slippage
                  },
                ],
              }),
              to: swapMockAddress,
              from: receiver,
            },
            data: {
              amountOut: srcAmount.toString(),
              priceImpact: -0.00008354225381729686,
            },
          };
        },
        {
          query: {
            amountIn: srcAmount.toString(),
          },
        },
      )
      .mock(pendleSwapApiMatcher, 404);

    fetchMock
      .get(
        pendleRedeemApiMatcher,
        async (url) => {
          const parsedUrl = new URL(url);
          const receiver = parsedUrl.searchParams.get("receiver");
          const yt = parsedUrl.searchParams.get("yt") as Address;
          const amountIn = BigInt(parsedUrl.searchParams.get("amountIn")!);
          const tokenOut = parsedUrl.searchParams.get("tokenOut") as Address;

          await encoder.client.deal({
            erc20: tokenOut,
            account: swapMockAddress,
            amount:
              (await encoder.client.readContract({
                address: tokenOut,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [swapMockAddress],
              })) + srcAmount,
          });

          return {
            method: "redeemPyToToken",
            contractCallParamsName: ["receiver", "YT", "netPyIn", "output"],
            contractCallParams: [
              receiver,
              yt,
              amountIn,
              {
                tokenOut: tokenOut,
                minTokenOut: dstAmount,
                tokenRedeemSy: tokenOut,
                pendleSwap: ZERO_ADDRESS,
                swapData: {
                  swapType: "0",
                  extRouter: ZERO_ADDRESS,
                  extCalldata: "",
                  needScale: false,
                },
              },
            ],
            tx: {
              data: encodeFunctionData({
                abi: swapMock.abi,
                functionName: "swap",
                args: [
                  {
                    token: ptToken,
                    amount: BigInt(amountIn!),
                  },
                  {
                    token: tokenOut,
                    amount: BigInt(dstAmount), // TODO: simulate positive & negative slippage
                  },
                ],
              }),
              to: swapMockAddress,
              from: receiver,
            },
            data: {
              amountOut: dstAmount,
              priceImpact: 0,
            },
          };
        },
        {
          query: {
            amountIn: srcAmount.toString(),
          },
        },
      )
      .mock(pendleRedeemApiMatcher, 404);
  };

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on standard market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 63_300;
      const ethPriceUsd = 2_600;

      const marketId =
        "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99" as MarketId; // WBTC/USDT (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = parseUnits("1", collateralToken.decimals);
      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          market.getMaxBorrowAssets(collateral) - 10n,
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: collateralPriceUsd,
                      spotPriceEth: collateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      mockOneInch(encoder, seizedCollateral, "60475733900");
      mockParaSwap(encoder, seizedCollateral, "60475733901");

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        33_317.258,
        3,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on standard market with bad debt`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 3_129;
      const ethPriceUsd = 2_653;

      const marketId =
        "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" as MarketId; // wstETH/WETH (96.5%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = parseUnits("10000", collateralToken.decimals);
      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      const borrowed = market.getMaxBorrowAssets(collateral) - 1n;
      await client.deal({
        erc20: loanToken.address,
        account: borrower.address,
        amount: borrowed - market.liquidity,
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
        args: [
          market.params,
          borrowed - market.liquidity, // 100% utilization after borrow.
          0n,
          borrower.address,
          "0x",
        ],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: collateralPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      mockOneInch(encoder, seizedCollateral, "11669266773005108147659");
      mockParaSwap(encoder, seizedCollateral, "11669266773005108147658");

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        5977.104502,
        6,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on a PT standard market before maturity`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1;
      const ethPriceUsd = 2_644;

      const marketId =
        "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = parseUnits("10000", collateralToken.decimals);
      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          market.getMaxBorrowAssets(collateral) - 1n,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const timestamp = await syncTimestamp(client);

      const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: newCollateralPriceUsd,
                      spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      mockPendleOperations(
        encoder,
        seizedCollateral,
        "60475733901",
        market.params.collateralToken,
      );
      mockOneInch(encoder, seizedCollateral, "11669266773005108147657");
      mockParaSwap(encoder, seizedCollateral, "11669266773005108147656");

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        7369.26594494,
        8,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on a PT standard market after maturity`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1;
      const ethPriceUsd = 2_644;

      const marketId =
        "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = parseUnits("10000", collateralToken.decimals);
      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          market.getMaxBorrowAssets(collateral) - 1n,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const postMaturity = BigInt(
        new Date("2024-10-24T00:00:00.000Z").getTime() / 1000 + 1,
      );
      await syncTimestamp(client, postMaturity);

      const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, {
          data: { markets: { items: [{ uniqueKey: marketId }] } },
        })
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: newCollateralPriceUsd,
                      spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(postMaturity);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      mockPendleOperations(
        encoder,
        seizedCollateral,
        "11669266773005108147657",
        market.params.collateralToken,
      );
      mockOneInch(encoder, seizedCollateral, "11669266773005108147657");
      mockParaSwap(encoder, seizedCollateral, "11669266773005108147656");

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        7325.59189336,
        8,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate a USD0USD0++ market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1.02;
      const ethPriceUsd = 2_644;

      const marketId =
        "0x864c9b82eb066ae2c038ba763dfc0221001e62fc40925530056349633eb0a259" as MarketId; // USD0USD0++ / USDC (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = 100000000000000000000000n;

      // Transfer the USD0 tokens to the borrower to be able to get USD0USD0++ LP tokens
      await client.writeContract({
        account: "0x224762e69169E425239EeEE0012d1B0e041C123D", // USD0 whale
        address: mainnetAddresses.usd0!,
        abi: erc20Abi,
        functionName: "transfer",
        args: [borrower.address, collateral],
      });

      // Approve the USD0USD0++ pool to spend the USD0 tokens
      await client.approve({
        account: borrower,
        address: mainnetAddresses.usd0!,
        args: [curvePools["usd0usd0++"], maxUint256],
      });

      // Deposit coins into the pool as the borrower to get the LP tokens in the cleanest possible way
      await client.writeContract({
        account: borrower,
        address: curvePools["usd0usd0++"],
        abi: curveStableSwapNGAbi,
        functionName: "add_liquidity",
        args: [[collateral, 0n], 1n, borrower.address],
      });

      // Get the new real value of the collateral
      const newCollatValue = await client.readContract({
        address: collateralToken.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [borrower.address],
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, newCollatValue, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          market.getMaxBorrowAssets(newCollatValue) - 1n,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const timestamp = await syncTimestamp(client);

      const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, {
          data: { markets: { items: [{ uniqueKey: marketId }] } },
        })
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: newCollateralPriceUsd,
                      spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      const { morphoBlueLiquidate } = LiquidationEncoder.prototype;
      vi.spyOn(
        LiquidationEncoder.prototype,
        "morphoBlueLiquidate",
      ).mockImplementation(function (...args) {
        if (args[3] !== seizedCollateral) throw Error("cancelled by test");

        return morphoBlueLiquidate.call(
          // @ts-ignore
          this,
          ...args,
        );
      });

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        1890.462,
        3,
      );
    },
  );

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate a USD0++ market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1.02;
      const ethPriceUsd = 2_644;

      const marketId =
        "0xb48bb53f0f2690c71e8813f2dc7ed6fca9ac4b0ace3faa37b4a8e5ece38fa1a2" as MarketId; // USD0USD0++ / USDC (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = 100000000000000000000000n;

      // Transfer the USD0 tokens to the borrower for the liquidation
      await client.writeContract({
        account: "0x2227b6806339906707b43F36a1f07B52FF7Fa776", // USD0++ whale
        address: collateralToken.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [borrower.address, collateral],
      });

      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          market.getMaxBorrowAssets(collateral) - 1n,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const timestamp = await syncTimestamp(client);

      const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, {
          data: { markets: { items: [{ uniqueKey: marketId }] } },
        })
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: newCollateralPriceUsd,
                      spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);
      const seizedCollateral = accruedPosition.seizableCollateral / 2n;

      const { morphoBlueLiquidate } = LiquidationEncoder.prototype;
      vi.spyOn(
        LiquidationEncoder.prototype,
        "morphoBlueLiquidate",
      ).mockImplementation(function (...args) {
        if (args[3] !== seizedCollateral) throw Error("cancelled by test");

        return morphoBlueLiquidate.call(
          // @ts-ignore
          this,
          ...args,
        );
      });

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        1743.95,
        3,
      );
    },
  );

  test.sequential(
    `should liquidate a sUSDS market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1.02;
      const ethPriceUsd = 2_644;

      const marketId =
        "0xbed21964cf290ab95fa458da6c1f302f2278aec5f897c1b1da3054553ef5e90c" as MarketId; // sUSDS / WETH (86%)

      const market = await fetchMarket(marketId, client);
      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const collateral = parseUnits("100000", collateralToken.decimals);
      await client.deal({
        erc20: collateralToken.address,
        account: borrower.address,
        amount: collateral,
      });
      await client.approve({
        account: borrower,
        address: collateralToken.address,
        args: [morpho, maxUint256],
      });
      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [market.params, collateral, borrower.address, "0x"],
      });

      const borrowed = market.getMaxBorrowAssets(collateral) - 1n;
      await client.deal({
        erc20: loanToken.address,
        account: borrower.address,
        amount: borrowed,
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
        args: [market.params, borrowed, 0n, borrower.address, "0x"],
      });

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as Pick<
            typeof market.params,
            "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
          >,
          borrowed,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

      nock(BLUE_API_BASE_URL)
        .post("/graphql")
        .reply(200, {
          data: { markets: { items: [{ uniqueKey: marketId }] } },
        })
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
                      address: market.params.collateralToken,
                      decimals: collateralToken.decimals,
                      priceUsd: newCollateralPriceUsd,
                      spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                    },
                    loanAsset: {
                      address: market.params.loanToken,
                      decimals: loanToken.decimals,
                      priceUsd: null,
                      spotPriceEth: 1 / ethPriceUsd,
                    },
                  },
                },
              ],
            },
          },
        });

      const timestamp = await syncTimestamp(client);

      const accrualPosition = await fetchAccrualPosition(
        borrower.address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(timestamp);

      const usdsWithdrawalAmount = await encoder.previewUSDSWithdrawalAmount(
        accruedPosition.seizableCollateral / 2n,
      );
      mockOneInch(encoder, usdsWithdrawalAmount, "11669266773005108147656");
      mockParaSwap(encoder, usdsWithdrawalAmount, "11669266773005108147657");

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        11652.93471896,
        8,
      );
    },
  );
});
