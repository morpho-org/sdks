import { createViemTest } from "@morpho-org/test/vitest";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import { morphoViemExtension } from "../../../src/client/morphoViemExtension.js";

const forkBlockNumber = 48_673_000n;
const marketId =
  "0x05959752fdeff325962b9d263edb421efc6e2186a49360dba6c32e86ebf6c84c";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber,
  stepsTracing: false,
});

describe("MorphoMidnight fetchers on fork", () => {
  test("fetches market and position data from pinned Base state", async ({
    client,
  }) => {
    const midnight = client
      .extend(morphoViemExtension({ supportDeployless: true }))
      .morpho.midnight(base.id);

    const market = await midnight.getMarketData(marketId);
    const position = await midnight.getPositionData({
      marketId,
      accountAddress: client.account.address,
    });

    expect(market.id).toBe(marketId);
    expect(market.params.chainId).toBe(BigInt(base.id));
    expect(market.params.collateralParams).toHaveLength(1);
    expect(position.market.id).toBe(marketId);
    expect(position.collateral).toHaveLength(128);
  });
});
