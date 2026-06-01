import { entries } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { ChainId, ChainUtils } from "./chain.js";

describe("ChainUtils explorer URL helpers", () => {
  test("CHAIN_METADATA keys match their chain id fields", () => {
    for (const [chainId, { id }] of entries(ChainUtils.CHAIN_METADATA)) {
      expect(+chainId).toBe(id);
    }
  });

  test("hasReliableNativeBalance returns configured values and defaults to true", () => {
    expect(ChainUtils.hasReliableNativeBalance(ChainId.EthMainnet)).toBe(true);
    expect(ChainUtils.hasReliableNativeBalance(ChainId.TempoMainnet)).toBe(
      false,
    );
    expect(ChainUtils.hasReliableNativeBalance(999_999_999)).toBe(true);
  });

  test("toHexChainId converts decimal chain ids", () => {
    expect(ChainUtils.toHexChainId(ChainId.BaseMainnet)).toBe("0x2105");
  });

  test("getExplorerUrl returns the chain explorer", () => {
    expect(ChainUtils.getExplorerUrl(ChainId.EthMainnet)).toBe(
      "https://etherscan.io",
    );
  });

  test("getExplorerAddressUrl appends the address path", () => {
    expect(
      ChainUtils.getExplorerAddressUrl(
        ChainId.BaseMainnet,
        "0x0000000000000000000000000000000000000001",
      ),
    ).toBe(
      "https://basescan.org/address/0x0000000000000000000000000000000000000001",
    );
  });

  test("getExplorerTransactionUrl appends the transaction path", () => {
    expect(
      ChainUtils.getExplorerTransactionUrl(ChainId.BaseMainnet, "0xabc"),
    ).toBe("https://basescan.org/tx/0xabc");
  });

  test.each([
    [
      685_689,
      {
        name: "Gensyn",
        explorerUrl: "https://gensyn-mainnet.explorer.alchemy.com",
        identifier: "gensyn",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
    ],
    [
      1_672,
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
      8_217,
      {
        name: "Kaia",
        explorerUrl: "https://kaiascan.io",
        identifier: "kaia",
        nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
      },
    ],
    [
      5_042,
      {
        name: "Arc",
        explorerUrl: "http://explorer.arc.io/",
        identifier: "arc",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      },
    ],
  ])("exposes era-2 metadata for chain %i", (chainId, expectedMetadata) => {
    expect(
      (ChainUtils.CHAIN_METADATA as Record<number, unknown>)[chainId],
    ).toMatchObject({
      id: chainId,
      ...expectedMetadata,
    });
  });
});
