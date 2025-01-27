import nock from "nock";
import "evm-maths";
import fetchMock from "fetch-mock";

import {
  type Address,
  ChainId,
  type InputMarketParams,
  type MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL, format } from "@morpho-org/morpho-ts";
import type { BuildTxInput } from "@paraswap/sdk";

import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import {
  Flashbots,
  type LiquidationEncoder,
} from "@morpho-org/liquidation-sdk-viem";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelisted-erc4626-1inch.js";
import { OneInch, Paraswap } from "../../src/index.js";
import { Spectra } from "../../src/tokens/spectra.js";
import * as swapMock from "../contracts/SwapMock.js";
import spectraTokens from "../mockData/spectraTokens.json";
import { type LiquidationTestContext, test } from "../setupSpectra.js";

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
  test.sequential(
    `should liquidate on a PT standard market before maturity`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 0.979131484365566;
      const ethPriceUsd = 2_644;

      const marketCreationParams = {
        collateralToken:
          "0xD0097149AA4CC0d0e1fC99B8BD73fC17dC32C1E9" as `0x${string}`,
        loanToken:
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
        lltv: 0n,
        oracle: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`,
        irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`,
      };

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "createMarket",
        args: [marketCreationParams],
      });

      const marketId =
        "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

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

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market.params as InputMarketParams,
          market.getMaxBorrowAssets(collateral)! - 1n,
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
                      priceUsd: 1,
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
      const seizedCollateral = accruedPosition.seizableCollateral! / 2n;

      mockOneInch(encoder, [
        {
          srcAmount: seizedCollateral,
          dstAmount: "11669266773005108147657",
        },
      ]);
      mockParaSwap(encoder, [
        { srcAmount: seizedCollateral, dstAmount: "11669266773005108147656" },
      ]);

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        7369.265945,
        6,
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
          market.params as InputMarketParams,
          market.getMaxBorrowAssets(collateral)! - 1n,
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
      const seizedCollateral = accruedPosition.seizableCollateral! / 2n;

      mockOneInch(encoder, [
        {
          srcAmount: seizedCollateral,
          dstAmount: "11669266773005108147657",
        },
      ]);
      mockParaSwap(encoder, [
        { srcAmount: seizedCollateral, dstAmount: "11669266773005108147656" },
      ]);

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(format.number.of(decimalBalance, decimals)).toBeCloseTo(
        7325.591893,
        6,
      );
    },
  );
});
