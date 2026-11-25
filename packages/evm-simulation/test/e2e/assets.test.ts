import {
  addressesRegistry,
  ChainId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { getE2eAsset } from "@morpho-org/morpho-test";
import { getAddress, isAddress } from "viem";
import { describe, expect, test } from "vitest";
import { getE2eAssets } from "./assets.js";

describe("getE2eAssets", () => {
  test("default: Ethereum includes stablecoins, yield shares and non-standard decimals", () => {
    const { wNative, usdc, usdt, dai, wstEth, sDai } =
      addressesRegistry[ChainId.EthMainnet];
    expect(getE2eAssets(ChainId.EthMainnet)).toEqual([
      { symbol: "wNative", address: wNative },
      { symbol: "USDC", address: usdc },
      { symbol: "USDT", address: usdt },
      { symbol: "DAI", address: dai },
      { symbol: "wstETH", address: wstEth },
      { symbol: "sDAI", address: sDai },
      { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
      { symbol: "GUSD", address: "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd" },
    ]);
  });

  test.each([
    [
      ChainId.BaseMainnet,
      [
        {
          symbol: "cbBTC",
          address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        },
      ],
    ],
    [
      ChainId.ArbitrumMainnet,
      [
        {
          symbol: "USDT0",
          address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        },
        {
          symbol: "XAUt0",
          address: "0x40461291347e1eCbb09499F3371D3f17f10d7159",
        },
      ],
    ],
    [
      ChainId.HyperliquidMainnet,
      [
        {
          symbol: "USDT0",
          address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
        },
      ],
    ],
  ] as const)(
    "behavior: chain %s appends its own exotic assets",
    (chainId, extra) => {
      const { wNative, usdc } = getChainAddresses(chainId);
      expect(getE2eAssets(chainId)).toEqual([
        { symbol: "wNative", address: wNative },
        ...(usdc == null ? [] : [{ symbol: "USDC", address: usdc }]),
        ...extra,
      ]);
    },
  );

  test.each(Object.keys(addressesRegistry).map(Number))(
    "behavior: chain %s keeps its representative first and has unique valid assets",
    (chainId) => {
      const assets = getE2eAssets(chainId);
      expect(assets[0]?.address).toBe(getE2eAsset(chainId).address);
      expect(assets.every(({ address }) => isAddress(address))).toBe(true);
      expect(
        new Set(assets.map(({ address }) => getAddress(address))).size,
      ).toBe(assets.length);
      expect(new Set(assets.map(({ symbol }) => symbol)).size).toBe(
        assets.length,
      );
    },
  );

  test("behavior: no registered stablecoin leaves the native asset", () => {
    expect(getE2eAssets(ChainId.KatanaMainnet)).toEqual([
      {
        symbol: "wNative",
        address: getChainAddresses(ChainId.KatanaMainnet).wNative,
      },
    ]);
  });

  test("behavior: no registered wNative uses the existing fallback", () => {
    expect(getE2eAssets(ChainId.ArcMainnet)).toEqual([
      { symbol: "fallback", address: getE2eAsset(ChainId.ArcMainnet).address },
    ]);
  });
});
