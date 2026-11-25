import {
  addressesRegistry,
  ChainId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { getE2eAsset } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, erc20Abi, parseUnits } from "viem";

/** A real ERC-20, or the existing wrapped-native fallback on chains without one. */
export interface E2eAsset {
  readonly symbol: string;
  readonly address: Address;
}

const exoticAssets: Readonly<Partial<Record<number, readonly E2eAsset[]>>> = {
  [ChainId.EthMainnet]: [
    { symbol: "DAI", address: addressesRegistry[ChainId.EthMainnet].dai },
    { symbol: "wstETH", address: addressesRegistry[ChainId.EthMainnet].wstEth },
    { symbol: "sDAI", address: addressesRegistry[ChainId.EthMainnet].sDai },
    // Wrapped Bitcoin: 8 decimals.
    { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
    // Gemini dollar: 2 decimals.
    { symbol: "GUSD", address: "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd" },
  ],
  [ChainId.BaseMainnet]: [
    // Coinbase Wrapped BTC: 8 decimals.
    { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  ],
  [ChainId.ArbitrumMainnet]: [
    // USDT0 (the upgraded bridged USDT proxy).
    { symbol: "USDT0", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
    // XAUt0: Approval on transferFrom, like Arbitrum wNative.
    { symbol: "XAUt0", address: "0x40461291347e1eCbb09499F3371D3f17f10d7159" },
  ],
  [ChainId.HyperliquidMainnet]: [
    // USDT0: Approval on transferFrom, including zero-value transfers.
    { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb" },
  ],
};

/** The first asset is the push representative; all remaining variants run nightly. */
export const getE2eAssets = (chainId: number): readonly E2eAsset[] => {
  const addresses = getChainAddresses(chainId);
  return [
    {
      symbol: addresses.wNative == null ? "fallback" : "wNative",
      address: getE2eAsset(chainId).address,
    },
    ...(addresses.usdc == null
      ? []
      : [{ symbol: "USDC", address: addresses.usdc }]),
    ...(chainId === ChainId.EthMainnet
      ? [
          {
            symbol: "USDT",
            address: addressesRegistry[ChainId.EthMainnet].usdt,
          },
        ]
      : []),
    ...(exoticAssets[chainId] ?? []),
  ];
};

/** Funds an actor in whole-token units without replacing the token's contract code. */
export const fundE2eAsset = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly token: Address;
    readonly amount: string;
    readonly account?: Address;
  },
) => {
  const decimals = await client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const amount = parseUnits(params.amount, decimals);
  await client.deal({
    erc20: params.token,
    account: params.account ?? client.account.address,
    amount,
  });
  return { decimals, amount };
};
