import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcMarketV1 } from "../../../test/fixtures/marketV1.js";
import { MorphoClient } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";
import { ReallocationData } from "../reallocationData.js";

describe("MorphoMarketV1.getReallocations", () => {
  test("error: ChainIdMismatchError when reallocation data chain differs from market chain", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const morphoClient = new MorphoClient(publicClient);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.getReallocations({
        reallocationData: new ReallocationData({ chainId: mainnet.id + 1 }),
        borrowAmount: 1n,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
