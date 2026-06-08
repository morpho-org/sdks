import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";
import { ReallocationData } from "../reallocationData.js";

describe("MorphoBlue.getReallocations", () => {
  test("error: ChainIdMismatchError when reallocation data chain differs from market chain", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const morphoClient = publicClient.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.getReallocations({
        reallocationData: new ReallocationData({ chainId: mainnet.id + 1 }),
        borrowAmount: 1n,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
