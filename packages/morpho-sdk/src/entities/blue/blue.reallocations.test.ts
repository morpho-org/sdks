import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";
import { VaultV1ReallocationData } from "../vaultV1ReallocationData.js";

describe("MorphoBlue reallocation APIs", () => {
  test("error: ChainIdMismatchError when reallocation data chain differs from market chain", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const morphoClient = publicClient.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.getReallocations({
        reallocationData: new VaultV1ReallocationData({
          chainId: mainnet.id + 1,
        }),
        borrowAmount: 1n,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("deprecated getReallocationData delegates to the Vault V1 fetcher", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const market = publicClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const expected = new VaultV1ReallocationData({ chainId: mainnet.id });
    const canonical = vi
      .spyOn(market, "getVaultV1ReallocationData")
      .mockResolvedValue(expected);
    const params = {
      vaultAddresses: [],
      block: { number: 0n, timestamp: 0n },
    } as const;

    await expect(market.getReallocationData(params)).resolves.toBe(expected);
    expect(canonical).toHaveBeenCalledWith(params);
  });

  test("error: getVaultV2BlueReallocationData validates the client chain", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const market = publicClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id + 1);

    await expect(
      market.getVaultV2BlueReallocationData({
        vaultAddresses: [],
        block: { number: 0n, timestamp: 0n },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});
