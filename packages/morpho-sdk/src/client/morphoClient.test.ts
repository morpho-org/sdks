import { MarketParams } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcMarketV1 } from "../../test/fixtures/marketV1.js";
import { MarketIdMismatchError } from "../types/index.js";
import { MorphoClient } from "./morphoClient.js";

describe("MorphoClient", () => {
  test("marketV1 rejects inconsistent market ids", () => {
    const client = new MorphoClient(
      createPublicClient({
        chain: mainnet,
        transport: http("http://localhost"),
      }),
    );
    const marketParams = new MarketParams(CbbtcUsdcMarketV1);
    Object.defineProperty(marketParams, "id", {
      value: `0x${"00".repeat(32)}`,
    });

    expect(() => client.marketV1(marketParams, mainnet.id)).toThrow(
      MarketIdMismatchError,
    );
  });
});
