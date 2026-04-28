import { entries } from "@morpho-org/morpho-ts";

import { describe, expect, test } from "vitest";
import { ChainId, ChainUtils } from "../../src/index.js";

describe("ChainUtils", () => {
  test("should have consistent chainIds", () => {
    entries(ChainUtils.CHAIN_METADATA).forEach(([chainId, { id }]) => {
      expect(+chainId).toEqual(id);
    });
  });

  test("should convert correctly a chainId to hexChainId", () => {
    expect(ChainUtils.toHexChainId(ChainId.BaseMainnet)).toEqual("0x2105");
  });

  test("should report unreliable native balance for Tempo", () => {
    expect(ChainUtils.hasReliableNativeBalance(ChainId.TempoMainnet)).toBe(
      false,
    );
  });

  test("should report reliable native balance for Ethereum", () => {
    expect(ChainUtils.hasReliableNativeBalance(ChainId.EthMainnet)).toBe(true);
  });

  test("should default to reliable native balance for unknown chains", () => {
    expect(ChainUtils.hasReliableNativeBalance(99999)).toBe(true);
  });

  test.each([
    [
      685689,
      {
        name: "Gensyn",
        explorerUrl: "https://gensyn-mainnet.explorer.alchemy.com",
        identifier: "gensyn",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
    ],
    [
      1672,
      {
        name: "Pharos",
        explorerUrl: "https://pharosscan.xyz",
        identifier: "pharos",
        nativeCurrency: { name: "PharosCoin", symbol: "PROS", decimals: 18 },
      },
    ],
    [
      714,
      {
        name: "Eden",
        explorerUrl: "https://eden.blockscout.com",
        identifier: "eden",
        nativeCurrency: { name: "TIA", symbol: "TIA", decimals: 18 },
      },
    ],
    [
      14,
      {
        name: "Flare",
        explorerUrl: "https://mainnet.flarescan.com",
        identifier: "flare",
        nativeCurrency: { name: "Flare", symbol: "FLR", decimals: 18 },
      },
    ],
    [
      50,
      {
        name: "XDC",
        explorerUrl: "https://xdcscan.com",
        identifier: "xdc",
        nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
      },
    ],
    [
      8217,
      {
        name: "Kaia",
        explorerUrl: "https://kaiascan.io",
        identifier: "kaia",
        nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
      },
    ],
  ])("should expose metadata for chain %i", (chainId, expectedMetadata) => {
    expect(
      (ChainUtils.CHAIN_METADATA as Record<number, unknown>)[chainId],
    ).toMatchObject({
      id: chainId,
      ...expectedMetadata,
    });
  });
});
