import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Chain, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import { ChainIdMismatchError } from "../../../types/index.js";
import { getMidnightRatifyRootRequirement } from "./getMidnightRatifyRootRequirement.js";

const midnightTestChain = {
  id: midnightChainId,
  name: "Midnight Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
} as const satisfies Chain;

const wrongChain = {
  ...midnightTestChain,
  id: midnightChainId + 1,
} as const satisfies Chain;

const root =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("getMidnightRatifyRootRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    const { client } = createMockClient(wrongChain);

    await expect(
      getMidnightRatifyRootRequirement({
        viemClient: client,
        chainId: midnightChainId,
        maker: midnightAddresses.maker,
        root,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when the root is already ratified", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.setterRatifier,
      abi: setterRatifierAbi,
      functionName: "isRootRatified",
      result: true,
    });

    await expect(
      getMidnightRatifyRootRequirement({
        viemClient: handle.client,
        chainId: midnightChainId,
        maker: midnightAddresses.maker,
        root,
      }),
    ).resolves.toBeNull();
  });

  test("builds a ratify-root transaction when the root is not ratified", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.setterRatifier,
      abi: setterRatifierAbi,
      functionName: "isRootRatified",
      result: false,
    });

    const tx = await getMidnightRatifyRootRequirement({
      viemClient: handle.client,
      chainId: midnightChainId,
      maker: midnightAddresses.maker,
      root,
    });

    expect(tx?.to).toBe(midnightAddresses.setterRatifier);
    expect(tx?.action.type).toBe("midnightRatifyRoot");
    expect(tx?.action.args.maker).toBe(midnightAddresses.maker);
    expect(tx?.action.args.root).toBe(root);
  });
});
