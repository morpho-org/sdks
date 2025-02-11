import nock from "nock";
import "evm-maths";
import fetchMock from "fetch-mock";

import {
  ChainId,
  type InputMarketParams,
  type MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL, Time, format } from "@morpho-org/morpho-ts";

import { blueAbi, fetchMarket, fetchToken } from "@morpho-org/blue-sdk-viem";
import { Flashbots } from "@morpho-org/liquidation-sdk-viem";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import { erc20Abi, maxUint256, parseUnits } from "viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { check } from "../../examples/whitelistedMarkets.js";
import { type LiquidationTestContext, test } from "../midasSetup.js";

fetchMock.config.fallbackToNetwork = true;
fetchMock.config.overwriteRoutes = false;
fetchMock.config.warnOnFallback = false;

const healthyDiffSlot =
  "0x0000000000000000000000000000000000000000000000000000000000000034";

const { morpho } = addresses[ChainId.EthMainnet];

const borrower = testAccount(1);

describe("midas liquidation", () => {
  beforeEach<LiquidationTestContext<typeof mainnet>>(async ({ client }) => {
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

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on the mTBILL/USDC market`,
    async ({ client, encoder }) => {
      const collateralPriceUsd = 1.015852;
      const ethPriceUsd = 2_600;

      const marketId =
        "0xb98ad8501bd97ce0684b30b3645e31713e658e98d1955e8b677fb2585eaa9893" as MarketId; // mTBILL/USDC (96.5%)

      const market = await fetchMarket(marketId, client);

      const [collateralToken, loanToken] = await Promise.all([
        fetchToken(market.params.collateralToken, client),
        fetchToken(market.params.loanToken, client),
      ]);

      const mTokenDataFeed = "0xfCEE9754E8C375e145303b7cE7BEca3201734A2B";
      const tokenOutDataFeed = "0x3aAc6fd73fA4e16Ec683BD4aaF5Ec89bb2C0EdC2";

      // overwrite data feeds healthy diff slot to make the price feed healthy in the future

      await client.setStorageAt({
        address: mTokenDataFeed,
        index: healthyDiffSlot,
        value: maxUint256.toString(16) as `0x${string}`,
      });

      await client.setStorageAt({
        address: tokenOutDataFeed,
        index: healthyDiffSlot,
        value: maxUint256.toString(16) as `0x${string}`,
      });

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

      const borrowed = market.getMaxBorrowAssets(collateral)! - 10n;

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
        args: [
          market.params as InputMarketParams,
          borrowed,
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
          market.params as InputMarketParams,
          borrowed,
          0n,
          borrower.address,
          borrower.address,
        ],
      });

      await syncTimestamp(
        client,
        (await client.timestamp()) + Time.s.from.w(5n),
      );

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

      await client.writeContract({
        account: borrower,
        address: morpho,
        abi: blueAbi,
        functionName: "accrueInterest",
        args: [market.params as InputMarketParams],
      });

      client.transport.tracer.next = true;

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
      ).toBeGreaterThan(12);
    },
  );
});
