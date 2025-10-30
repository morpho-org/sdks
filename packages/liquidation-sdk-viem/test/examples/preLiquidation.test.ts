import nock from "nock";
import "evm-maths";
import fetchMock from "fetch-mock";

import {
  type Address,
  ChainId,
  type MarketId,
  PreLiquidationPosition,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { format } from "@morpho-org/morpho-ts";
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
  preLiquidationFactoryAbi,
} from "@morpho-org/liquidation-sdk-viem";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelistedMarkets.js";
import { OneInch, Paraswap } from "../../src/index.js";
import * as swapMock from "../contracts/SwapMock.js";
import { type LiquidationTestContext, preLiquidationTest } from "../setup.js";
import { nockBlueApi } from "./helpers.js";

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

describe("pre liquidation", () => {
  let swapMockAddress: Address;

  beforeEach<LiquidationTestContext<typeof mainnet>>(async ({ client }) => {
    process.env.INDEXER_API_URL = "http://localhost:42069";

    swapMockAddress = (await client.deployContractWait(swapMock))
      .contractAddress;

    vi.spyOn(Flashbots, "sendRawBundle").mockImplementation(async (txs) => {
      for (const serializedTransaction of txs) {
        await client.sendRawTransaction({ serializedTransaction });
      }
    });
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
  preLiquidationTest.sequential(
    `should pre-liquidate on standard market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 63_300;
      const ethPriceUsd = 2_600;

      const marketId =
        "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99" as MarketId; // WBTC/USDT (86%)

      const market = await fetchMarket(marketId, client);

      const preLiquidationParams = {
        preLltv: 832603694978000000n,
        preLCF1: 200000000000000000n,
        preLCF2: 800000000000000000n,
        preLIF1: 1010000000000000000n,
        preLIF2: 1010000000000000000n,
        preLiquidationOracle: market.params.oracle,
      };

      await client.writeContract({
        account: borrower,
        address: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",
        abi: preLiquidationFactoryAbi,
        functionName: "createPreLiquidation",
        args: [marketId, preLiquidationParams],
      });

      const preLiquidationAddress =
        "0x0341B93DCB3b27FD4E2A6890cF06D67f64d9Ac8E";

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
        functionName: "setAuthorization",
        args: [preLiquidationAddress, true],
      });

      const borrowed = market.getMaxBorrowAssets(collateral)! - 10000000n;
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

      const price = await client.readContract({
        address: market.params.oracle,
        abi: [
          {
            type: "function",
            name: "price",
            inputs: [],
            outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
            stateMutability: "view",
          },
        ] as const,
        functionName: "price",
      });

      nock(process.env.INDEXER_API_URL!)
        .post("/chain/1/preliquidations")
        .reply(200, {
          results: [
            {
              marketId,
              address: preLiquidationAddress,
              preLiquidationParams: {
                ...preLiquidationParams,
                preLltv: preLiquidationParams.preLltv.toString(),
                preLCF1: preLiquidationParams.preLCF1.toString(),
                preLCF2: preLiquidationParams.preLCF2.toString(),
                preLIF1: preLiquidationParams.preLIF1.toString(),
                preLIF2: preLiquidationParams.preLIF2.toString(),
              },
              enabledPositions: [borrower.address],
              price: price.toString(),
            },
          ],
        });

      const accrualPosition = await fetchAccrualPosition(
        borrower.address,
        marketId,
        client,
      );

      const accruedPosition = accrualPosition.accrueInterest(timestamp);

      const preLiquidablePosition = new PreLiquidationPosition(
        {
          preLiquidationParams,
          preLiquidation: preLiquidationAddress,
          preLiquidationOraclePrice: price,
          ...accruedPosition,
        },
        accruedPosition.market,
      );

      const preSeizableCollateral = preLiquidablePosition.seizableCollateral!;

      nockBlueApi(
        {
          collateralToken,
          loanToken,
          collateralPriceUsd,
          loanPriceUsd: 1.0,
          ethPriceUsd,
          position: accrualPosition,
        },
        true,
      );
      mockOneInch(encoder, [
        { srcAmount: preSeizableCollateral, dstAmount: "73000000000" },
      ]);
      mockParaSwap(encoder, [
        { srcAmount: preSeizableCollateral, dstAmount: "73000000000" },
      ]);

      await check(encoder.address, client, client.account, [marketId]);

      const decimals = Number(loanToken.decimals);

      const decimalBalance = await client.readContract({
        address: market.params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [encoder.address],
      });

      expect(
        Number(format.number.of(decimalBalance, decimals)),
      ).toBeGreaterThan(1_257.5848);
    },
  );
});
