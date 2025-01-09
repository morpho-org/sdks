import "evm-maths";
import fetchMock from "fetch-mock";

import type { Address, MarketId } from "@morpho-org/blue-sdk";

import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Flashbots } from "@morpho-org/liquidation-sdk-viem";
import type { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { check } from "../../examples/whitelisted-erc4626-1inch.js";
import { Pendle } from "../../src/index.js";
import pendleMarketData from "../pendleMockData/pendleMarketData.json";
import pendleTokens from "../pendleMockData/pendleTokens.json";
import { type LiquidationTestContext, test } from "../setup.js";

fetchMock.config.fallbackToNetwork = true;
fetchMock.config.overwriteRoutes = false;
fetchMock.config.warnOnFallback = false;

describe("erc4626-1inch", () => {
  beforeEach<LiquidationTestContext<typeof mainnet>>(async ({ client }) => {
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

  // Cannot run concurrently because `fetch` is mocked globally.
  test.sequential(
    `should liquidate on standard market with bad debt`,
    async ({ client, encoder }) => {
      const marketId =
        "0xab4e2a2b60871cbbe808841b1debc1eea1a8a72a9a7bb03f9143a4fee87749fd" as MarketId; // wstETH/WETH (96.5%)
      const liquidatableBorrower = "0xd0644E17C6Ad2B34932cB6D8Dc6026000DA5FF2e";

      const accrualPosition = await fetchAccrualPosition(
        liquidatableBorrower as Address,
        marketId,
        client,
      );
      const accruedPosition = accrualPosition.accrueInterest(Date.now());
      console.log("seizableCollateral", accruedPosition.seizableCollateral);

      await check(encoder.address, client, client.account, [marketId]);
    },
  );
});
