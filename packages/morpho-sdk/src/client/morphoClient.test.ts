import { MarketParams } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../test/fixtures/blue.js";
import { MarketIdMismatchError } from "../types/index.js";
import { MorphoClient } from "./morphoClient.js";

describe("MorphoClient", () => {
  test("blue rejects inconsistent market ids", () => {
    const client = new MorphoClient(
      createPublicClient({
        chain: mainnet,
        transport: http("http://localhost"),
      }),
    );
    const marketParams = new MarketParams(CbbtcUsdcBlue);
    Object.defineProperty(marketParams, "id", {
      value: `0x${"00".repeat(32)}`,
    });

    expect(() => client.blue(marketParams, mainnet.id)).toThrow(
      MarketIdMismatchError,
    );
  });
});
