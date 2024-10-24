import {
  ChainId,
  type InputVaultConfig,
  VaultConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";

const { wNative, usdc } = addresses[ChainId.EthMainnet];

export const vaults = {
  [ChainId.EthMainnet]: {
    steakUsdc: new VaultConfig(
      {
        address: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
        decimals: 18,
        decimalsOffset: 12n,
        symbol: "steakUSDC",
        name: "Steakhouse USDC",
        asset: usdc,
      },
      ChainId.EthMainnet,
    ),

    bbUsdc: new VaultConfig(
      {
        address: "0x186514400e52270cef3D80e1c6F8d10A75d47344",
        decimals: 18,
        decimalsOffset: 12n,
        symbol: "bbUSDC",
        name: "BlockAnalytica USDC",
        asset: wNative,
      },
      ChainId.EthMainnet,
    ),

    bbEth: new VaultConfig(
      {
        address: "0x38989BBA00BDF8181F4082995b3DEAe96163aC5D",
        decimals: 18,
        decimalsOffset: 0n,
        symbol: "bbETH",
        name: "BlockAnalytica ETH",
        asset: wNative,
      },
      ChainId.EthMainnet,
    ),

    bbUsdt: new VaultConfig(
      {
        address: "0x2C25f6C25770fFEC5959D34B94Bf898865e5D6b1",
        decimals: 18,
        decimalsOffset: 12n,
        symbol: "bbUSDT",
        name: "BlockAnalytica USDT",
        asset: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      },
      ChainId.EthMainnet,
    ),

    re7Weth: new VaultConfig(
      {
        address: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
        decimals: 18,
        decimalsOffset: 0n,
        symbol: "re7WETH",
        name: "Re7 WETH",
        asset: wNative,
      },
      ChainId.EthMainnet,
    ),
  },
} as const;

export const randomVault = (config: Partial<InputVaultConfig> = {}) =>
  new VaultConfig({
    asset: randomAddress(),
    decimals: 18,
    decimalsOffset: 0n,
    symbol: "TEST",
    name: "Test vault",
    address: randomAddress(),
    ...config,
  });
