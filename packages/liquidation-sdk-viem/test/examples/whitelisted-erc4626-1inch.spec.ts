import fetchMock from "fetch-mock";
import nock from "nock";
import simple from "simple-mock";
import "evm-maths";

import {
  type Address,
  ChainId,
  MarketConfig,
  type MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL, ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import type { BuildTxInput } from "@paraswap/sdk";

import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelisted-erc4626-1inch.js";
import { sendRawBundleMockImpl } from "../mocks.js";
import pendleMarketData from "../pendleMockData/pendleMarketData.json";
import pendleTokens from "../pendleMockData/pendleTokens.json";

import { Flashbots } from "@morpho-org/liquidation-sdk-viem";
import { type AnvilTestClient, testAccount } from "@morpho-org/test-viem";
import type { ExecutorEncoder } from "executooor-viem";
import {
  type TestClient,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseUnits,
} from "viem";
import {
  LiquidationEncoder,
  OneInch,
  Paraswap,
  Pendle,
  curvePools,
  mainnetAddresses,
} from "../../src/index.js";
import { abi as swapMockAbi } from "../contracts/SwapMock.js";
import { test } from "../setup.js";

const oneInchSwapApiMatcher = new RegExp(`${OneInch.getSwapApiUrl(1)}.*`);
const paraSwapPriceApiMatcher = new RegExp(`${Paraswap.API_URL}/prices.*`);
const paraSwapTxApiMatcher = new RegExp(`${Paraswap.API_URL}/transactions.*`);

const pendleSwapApiMatcher = new RegExp(`${Pendle.getSwapApiUrl(1)}.*`);
const pendleRedeemApiMatcher = new RegExp(`${Pendle.getRedeemApiUrl(1)}.*`);
const pendleTokensApiMatcher = new RegExp(`${Pendle.getTokensApiUrl(1)}.*`);
const pendleMarketApiMatcher = new RegExp(`${Pendle.getMarketsApiUrl(1)}.*`);

const delay = 7220n;

const testDelta = 100n;

let start = 1727163200n;

const { morpho } = addresses[ChainId.EthMainnet];

const borrower = testAccount(1);

describe("erc4626-1inch", () => {
  let swapMockAddress: Address;

  beforeAll(async () => {
    simple.mock(Flashbots, "sendRawBundle", sendRawBundleMockImpl);
  });

  afterAll(() => {
    simple.restore();
  });

  afterEach(async () => {
    nock.cleanAll();
    fetchMock.reset();
    clock?.restore();
    start += testDelta;
  });

  const setTimestamp = async (
    client: TestClient<"anvil">,
    timestamp: bigint,
  ) => {
    vi.useFakeTimers({
      now: Number(timestamp) * 1000,
      toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
    });

    await client.setNextBlockTimestamp({ timestamp: timestamp - 12n });
    await client.mine({ blocks: 1 });
    await client.setNextBlockTimestamp({ timestamp });
  };

  const mockOneInch = (
    encoder: ExecutorEncoder<AnvilTestClient>,
    srcAmount: bigint,
    dstAmount: string,
  ) => {
    // Nock cannot mock requests from the builtin fetch API.
    fetchMock
      .get(
        oneInchSwapApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const dstToken = url.searchParams.get("dst") as Address;

          await encoder.client.deal({
            erc20: dstToken,
            recipient: swapMockAddress,
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
            tx: encodeFunctionData({
              abi: swapMockAbi,
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
          };
        },
        {
          query: {
            amount: srcAmount.toString(),
          },
        },
      )
      .get(oneInchSwapApiMatcher, 404, { overwriteRoutes: false });
  };

  const mockParaSwap = (
    encoder: ExecutorEncoder<AnvilTestClient>,
    srcAmount: bigint,
    dstAmount: string,
  ) => {
    // Nock cannot mock requests from the builtin fetch API.
    fetchMock
      .get(
        paraSwapPriceApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const srcToken = url.searchParams.get("srcToken") as Address;
          const destToken = url.searchParams.get("destToken") as Address;

          await encoder.client.deal({
            erc20: destToken,
            recipient: swapMockAddress,
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
      .get(paraSwapPriceApiMatcher, 404, { overwriteRoutes: false });

    fetchMock.post(paraSwapTxApiMatcher, async (_uri, opts) => {
      const body = JSON.parse(opts?.body as string) as BuildTxInput;

      await encoder.client.deal({
        erc20: body.destToken as Address,
        recipient: swapMockAddress,
        amount:
          (await encoder.client.readContract({
            address: body.destToken as Address,
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
          abi: swapMockAbi,
          functionName: "swap",
          args: [
            {
              token: body.srcToken as Address,
              amount: srcAmount,
            },
            {
              token: body.destToken as Address,
              amount: BigInt(dstAmount), // TODO: simulate positive & negative slippage
            },
          ],
        }),
        gasPrice: "0",
        chainId: 1,
        gas: "0",
      };
    });
  };

  const mockGetPendleToken = () => {
    fetchMock
      .get(pendleTokensApiMatcher, async () => {
        return pendleTokens;
      })
      .get(pendleTokensApiMatcher, 404, { overwriteRoutes: false });
  };

  const mockGetPendleMarket = () => {
    fetchMock
      .get(pendleMarketApiMatcher, async () => {
        return pendleMarketData;
      })
      .get(pendleMarketApiMatcher, 404, { overwriteRoutes: false });
  };

  const mockPendleOperations = (
    encoder: ExecutorEncoder<AnvilTestClient>,
    srcAmount: bigint,
    dstAmount: string,
    ptToken: Address,
  ) => {
    // Mock for Pendle Swap API
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
            recipient: swapMockAddress,
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
                abi: swapMockAbi,
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
      .get(pendleSwapApiMatcher, 404, { overwriteRoutes: false });
    // Mock for Pendle Redeem API
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
            recipient: swapMockAddress,
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
                abi: swapMockAbi,
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
      .get(pendleRedeemApiMatcher, 404, { overwriteRoutes: false });
  };

  test(`should liquidate on standard market`, async ({ client, encoder }) => {
    const collateralPriceUsd = 63_300;
    const ethPriceUsd = 2_600;

    const marketId =
      "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99" as MarketId; // WBTC/USDT (86%)

    let market = await fetchMarket(marketId, client);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, client),
      fetchToken(market.config.loanToken, client),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("1", collateralToken.decimals);

    await client.deal({
      erc20: collateralToken.address,
      recipient: borrower.address,
      amount: collateral,
    });
    await client.writeContract({
      account: borrower,
      address: collateralToken.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [morpho, maxUint256],
    });
    await client.writeContract({
      account: borrower,
      address: morpho,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [market.config, collateral, borrower.address, "0x"],
    });

    await client.setNextBlockTimestamp({ timestamp: start });
    await client.mine({ blocks: 1 });

    market = await fetchMarket(marketId, client);

    await client.writeContractWait({
      account: borrower,
      address: morpho,
      abi: blueAbi,
      functionName: "borrow",
      args: [
        market.config as Pick<
          typeof market.config,
          "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
        >,
        market.getMaxBorrowAssets(collateral) - 10n,
        0n,
        borrower.address,
        borrower.address,
      ],
    });

    mockGetPendleToken();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                    spotPriceEth: collateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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
      market.config.id,
      client,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);

    mockOneInch(accruedPosition.seizableCollateral / 2n, "60475733900");
    mockParaSwap(accruedPosition.seizableCollateral / 2n, "60475733901");

    await setTimestamp(client, start + delay);
    await client.mine({ blocks: 1 });

    await check(encoder.address, client, client.account, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await client.readContract({
        address: market.config.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      })) / decimals;

    expect(decimalBalance).toBe(33_316_586_406n / decimals);
  });

  test(`should liquidate on standard market with bad debt`, async () => {
    const collateralPriceUsd = 3_129;
    const ethPriceUsd = 2_653;

    const marketId =
      "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" as MarketId; // wstETH/WETH (96.5%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    const collateral = parseUnits("10000", collateralToken.decimals);
    const morpho = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);
    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await morpho.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    const borrowed = market.getMaxBorrowAssets(collateral) - 1n;
    await deal(
      loanToken.address,
      borrower.address,
      borrowed - market.liquidity,
    );
    await ERC20__factory.connect(loanToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );
    await morpho.supply(
      market.config,
      borrowed - market.liquidity, // 100% utilization after borrow.
      0n,
      borrower.address,
      "0x",
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morpho.borrow(
      market.config,
      borrowed,
      0n,
      borrower.address,
      borrower.address,
    );

    mockGetPendleToken();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);

    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147659",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147658",
    );

    await setTimestamp(start + delay);
    await mine(1);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(5976971822403273072470n / decimals);
  });

  test(`should liquidate on a PT standard market before maturity`, async () => {
    const collateralPriceUsd = 1;
    const ethPriceUsd = 2_644;

    const marketId =
      "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("10000", collateralToken.decimals);

    const morphoBorrower = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

    mockGetPendleToken();

    mockGetPendleMarket();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);
    setTimestamp(start + delay);
    mockPendleOperations(
      accruedPosition.seizableCollateral / 2n,
      "60475733901",
      market.config.collateralToken,
    );
    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147656",
    );
    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(7369167071383784310757n / decimals);
  });

  test(`should liquidate on a PT standard market after maturity`, async () => {
    const collateralPriceUsd = 1;
    const ethPriceUsd = 2_644;

    const marketId =
      "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("10000", collateralToken.decimals);

    const morphoBorrower = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

    mockGetPendleToken();

    mockGetPendleMarket();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const postMaturity =
      new Date("2024-10-24T00:00:00.000Z").getTime() / 1000 + 1;
    const accruedPosition = accrualPosition.accrueInterest(postMaturity);
    setTimestamp(postMaturity);
    mockPendleOperations(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
      market.config.collateralToken,
    );
    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147656",
    );

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(7325591893360572899357n / decimals);
  });

  test(`should liquidate a USD0USD0++ market`, async () => {
    const collateralPriceUsd = 1.02;
    const ethPriceUsd = 2_644;

    const marketId =
      "0x864c9b82eb066ae2c038ba763dfc0221001e62fc40925530056349633eb0a259" as MarketId; // USD0USD0++ / USDC (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = 100000000000000000000000n;

    const morphoBorrower = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    ///////////////////////////////////////////////////////////////////////////////////////
    /// Test setup
    ///////////////////////////////////////////////////////////////////////////////////////
    //Address of a USD0 holder with a large balance to transfer to our own account
    const usd0Faucet = "0x224762e69169E425239EeEE0012d1B0e041C123D";

    // Impersonate the USD0 holder
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usd0Faucet],
    });

    const usd0Signer = await ethers.getSigner(usd0Faucet);

    // Transfer the USD0 tokens to the borrower to be able to get USD0USD0++ LP tokens
    await ERC20__factory.connect(mainnetAddresses.usd0!, usd0Signer).transfer(
      borrower.address,
      collateral,
    );

    // Approve the USD0USD0++ pool to spend the USD0 tokens
    await ERC20__factory.connect(mainnetAddresses.usd0!, borrower).approve(
      curvePools["usd0usd0++"],
      MaxUint256,
    );

    const curveUSD0USD0PPPool = CurveStableSwapNG__factory.connect(
      curvePools["usd0usd0++"],
      borrower,
    );

    //Deposit coins into the pool as the borrower to get the LP tokens in the cleanest possible way
    await curveUSD0USD0PPPool["add_liquidity(uint256[],uint256,address)"](
      [collateral, 0n],
      1,
      borrower,
    );

    // Get the new real value of the collateral
    const newCollatValue = await ERC20__factory.connect(
      mainnetAddresses["usd0usd0++"]!,
      borrower,
    ).balanceOf(borrower.address);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      newCollatValue,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(newCollatValue) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

    mockGetPendleToken();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    await setTimestamp(start + delay);
    await mine(1);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);
    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(3777412787n / decimals);
  });

  test(`should liquidate a USD0++ market`, async () => {
    const collateralPriceUsd = 1.02;
    const ethPriceUsd = 2_644;

    const marketId =
      "0xb48bb53f0f2690c71e8813f2dc7ed6fca9ac4b0ace3faa37b4a8e5ece38fa1a2" as MarketId; // USD0USD0++ / USDC (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = 100000000000000000000000n;

    const morphoBorrower = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    ///////////////////////////////////////////////////////////////////////////////////////
    /// Test setup
    ///////////////////////////////////////////////////////////////////////////////////////
    //Address of a USD0++ holder with a large balance to transfer to our own account
    const usd0PPFaucet = "0x2227b6806339906707b43F36a1f07B52FF7Fa776";

    // Impersonate the USD0 holder
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usd0PPFaucet],
    });

    const usd0PPSigner = await ethers.getSigner(usd0PPFaucet);

    // Transfer the USD0 tokens to the borrower for the liquidation
    await ERC20__factory.connect(
      mainnetAddresses["usd0++"]!,
      usd0PPSigner,
    ).transfer(borrower.address, collateral);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

    mockGetPendleToken();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    await setTimestamp(start + delay);
    await mine(1);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(3484025090n / decimals);
  });

  test(`should liquidate a sUSDS market`, async () => {
    const collateralPriceUsd = 1.02;
    const ethPriceUsd = 2_644;

    const marketId =
      "0xbed21964cf290ab95fa458da6c1f302f2278aec5f897c1b1da3054553ef5e90c" as MarketId; // sUSDS / WETH (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("100000", collateralToken.decimals);
    const loan = market.getMaxBorrowAssets(collateral) + 1n;
    const morphoLoaner = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      signer,
    );
    const morpho = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    await deal(loanToken.address, signer.address, loan);
    await deal(collateralToken.address, borrower.address, collateral);
    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );
    await ERC20__factory.connect(loanToken.address, signer).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoLoaner.supply(market.config, loan, 0n, signer.address, "0x");
    await morpho.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morpho.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.9; // 20% price drop

    mockGetPendleToken();

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
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
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

    await setTimestamp(start + delay);
    await mine(1);

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);

    const encoder = new LiquidationEncoder(executorAddress, signer);

    const usdsWithdrawalAmount = await encoder.previewUSDSWithdrawalAmount(
      accruedPosition.seizableCollateral / 2n,
    );
    mockOneInch(usdsWithdrawalAmount, "11669266773005108147656");
    mockParaSwap(usdsWithdrawalAmount, "11669266773005108147657");

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);
    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(11652934372720702068338n / decimals);
  });

  test.skip(`should liquidate on rehypothecated market with limited swap liquidity`, async () => {
    const collateralPriceUsd = 4_000;
    const ethPriceUsd = 3_800;

    const morpho = MorphoBlue__factory.connect(
      mainnetAddresses.morpho,
      borrower,
    );

    const config = new MarketConfig({
      collateralToken: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      oracle: "0xe9eE579684716c7Bb837224F4c7BeEfA4f1F3d7f",
      irm: mainnetAddresses.adaptiveCurveIrm,
      lltv: parseEther("0.86"),
    });

    tracer.nameTags[config.collateralToken] = "Re7WETH";
    tracer.nameTags[config.loanToken] = "USDT";

    await morpho.createMarket(config);

    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(config.collateralToken, signer),
      fetchToken(config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = 487286057724779572742n;
    const borrowed = 1551394115919n;
    const collateralVault = ERC4626__factory.connect(
      collateralToken.address,
      borrower,
    );

    const asset = await collateralVault.asset();
    await deal(
      asset,
      borrower.address,
      parseUnits("500", collateralToken.decimals),
    );
    await ERC20__factory.connect(asset, borrower).approve(
      collateralToken.address,
      MaxUint256,
    );
    await collateralVault.mint(collateral, borrower.address);
    await collateralVault.approve(mainnetAddresses.morpho, MaxUint256);
    await morpho.supplyCollateral(config, collateral, borrower.address, "0x");

    await deal(loanToken.address, borrower.address, borrowed);
    await ERC20__factory.connect(loanToken.address, borrower).approve(
      mainnetAddresses.morpho,
      MaxUint256,
    );
    await morpho.supply(config, borrowed, 0n, borrower.address, "0x");
    await morpho.borrow(
      config,
      borrowed,
      0n,
      borrower.address,
      borrower.address,
    );

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [{ uniqueKey: config.id }] } } })
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
                  oracleAddress: config.oracle,
                  irmAddress: config.irm,
                  lltv: config.lltv,
                  collateralAsset: {
                    address: config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                    spotPriceEth: collateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: config.loanToken,
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

    mockOneInch(14027284293252328894n, "52318714940");

    await setTimestamp(1716558490);

    await check(executorAddress, hardhatSigner, signer, [config.id]);

    expect(
      await ERC20__factory.connect(config.loanToken, signer).balanceOf(
        executorAddress,
      ),
    ).to.eq(18509_333703n);
  });
});
