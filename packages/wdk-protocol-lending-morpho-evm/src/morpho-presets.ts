import type { Address, Hex } from "viem";

/**
 * A curated Morpho Vault V2 preset.
 */
export interface Vault {
  /** The vault's address. */
  readonly address: Address;
  /** The vault's display name. */
  readonly name: string;
  /** The identifier of the chain that hosts the vault. */
  readonly chainId: number;
}

/**
 * A map of curated Morpho Vault V2 presets.
 */
export const MORPHO_VAULT_PRESETS = {
  "sky-money-usdt-savings": {
    address: "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11",
    name: "sky.money USDT Savings",
    chainId: 1,
  },
  "steakhouse-prime-instant": {
    address: "0xbeef003C68896c7D2c3c60d363e8d71a49Ab2bf9",
    name: "Steakhouse Prime Instant",
    chainId: 1,
  },
} as const satisfies Record<string, Vault>;

export type VaultPresetKey = keyof typeof MORPHO_VAULT_PRESETS;

/**
 * A curated Morpho Blue market preset.
 */
export interface Market {
  /** The Morpho Blue market identifier. */
  readonly marketId: Hex;
  /** The symbol of the market collateral token. */
  readonly collateralSymbol: string;
  /** The loan-to-value ratio. */
  readonly lltv: string;
  /** The identifier of the chain that hosts the market. */
  readonly chainId: number;
}

/**
 * A map of curated Morpho Blue market presets.
 */
export const MORPHO_MARKET_PRESETS = {
  susds: {
    marketId:
      "0x3274643db77a064abd3bc851de77556a4ad2e2f502f4f0c80845fa8f909ecf0b",
    collateralSymbol: "sUSDS",
    lltv: "96.5%",
    chainId: 1,
  },
  wsteth: {
    marketId:
      "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2",
    collateralSymbol: "wstETH",
    lltv: "86%",
    chainId: 1,
  },
  wbtc: {
    marketId:
      "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99",
    collateralSymbol: "WBTC",
    lltv: "86%",
    chainId: 1,
  },
  xaut: {
    marketId:
      "0xb7843fe78e7e7fd3106a1b939645367967d1f986c2e45edb8932ad1896450877",
    collateralSymbol: "XAUt",
    lltv: "77%",
    chainId: 1,
  },
} as const satisfies Record<string, Market>;

export type MarketPresetKey = keyof typeof MORPHO_MARKET_PRESETS;
