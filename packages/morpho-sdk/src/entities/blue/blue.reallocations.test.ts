import { MarketParams } from "@morpho-org/blue-sdk";
import { vaultV2BluePublicAllocatorAbi as canonicalVaultV2BluePublicAllocatorAbi } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import {
  publicAllocatorAbi,
  vaultV1PublicAllocatorAbi,
  vaultV2BluePublicAllocatorAbi,
} from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";
import { VaultV1ReallocationData } from "../vaultV1ReallocationData.js";
import { VaultV2BlueReallocationData } from "../vaultV2BlueReallocationData.js";

describe("MorphoBlue reallocation APIs", () => {
  test("getVaultV1Reallocations error: ChainIdMismatchError", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const morphoClient = publicClient.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.getVaultV1Reallocations({
        reallocationData: new VaultV1ReallocationData({
          chainId: mainnet.id + 1,
        }),
        borrowAmount: 1n,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("deprecated getReallocations delegates to the Vault V1 planner", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const market = publicClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const expected = [] as const;
    const canonical = vi
      .spyOn(market, "getVaultV1Reallocations")
      .mockReturnValue(expected);
    const params = {
      reallocationData: new VaultV1ReallocationData({ chainId: mainnet.id }),
      borrowAmount: 1n,
    } as const;

    expect(market.getReallocations(params)).toBe(expected);
    expect(canonical).toHaveBeenCalledWith(params);
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

  test("getVaultV2BlueReallocations default: delegates to the Vault V2 planner", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const market = publicClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const reallocationData = new VaultV2BlueReallocationData({
      chainId: mainnet.id,
    });
    const expected = { reallocations: [], data: reallocationData } as const;
    const planner = vi
      .spyOn(reallocationData, "computeVaultV2BlueReallocations")
      .mockReturnValue(expected);
    const options = { enabled: false } as const;

    expect(
      market.getVaultV2BlueReallocations({ reallocationData, options }),
    ).toBe(expected);
    expect(planner).toHaveBeenCalledWith(
      new MarketParams(CbbtcUsdcBlue).id,
      options,
    );
  });

  test("getVaultV2BlueReallocations error: ChainIdMismatchError", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const market = publicClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.getVaultV2BlueReallocations({
        reallocationData: new VaultV2BlueReallocationData({
          chainId: mainnet.id + 1,
        }),
      }),
    ).toThrow(ChainIdMismatchError);
  });
});

describe("Public allocator ABI exports", () => {
  test("re-exports the canonical Vault V2 ABI", () => {
    expect(vaultV2BluePublicAllocatorAbi).toBe(
      canonicalVaultV2BluePublicAllocatorAbi,
    );
  });

  test("keeps the deprecated Vault V1 ABI alias", () => {
    expect(publicAllocatorAbi).toBe(vaultV1PublicAllocatorAbi);
  });
});
