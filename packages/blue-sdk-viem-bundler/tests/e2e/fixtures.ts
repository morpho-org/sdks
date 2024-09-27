import { Address, ChainId, VaultConfig, addresses } from "@morpho-org/blue-sdk";

export const steakUsdc = new VaultConfig({
  address: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
  decimals: 18,
  decimalsOffset: 12n,
  symbol: "steakUSDC",
  name: "Steakhouse USDC",
  asset: addresses[ChainId.EthMainnet].usdc,
});

export const bbUsdc = new VaultConfig({
  address: "0x186514400e52270cef3D80e1c6F8d10A75d47344",
  decimals: 18,
  decimalsOffset: 12n,
  symbol: "bbUSDC",
  name: "BlockAnalytica USDC",
  asset: addresses[ChainId.EthMainnet].wNative,
});

export const bbETH = new VaultConfig({
  address: "0x38989BBA00BDF8181F4082995b3DEAe96163aC5D",
  decimals: 18,
  decimalsOffset: 0n,
  symbol: "bbETH",
  name: "BlockAnalytica ETH",
  asset: addresses[ChainId.EthMainnet].wNative,
});

export const bbUSDT = new VaultConfig({
  address: "0x2C25f6C25770fFEC5959D34B94Bf898865e5D6b1",
  decimals: 18,
  decimalsOffset: 12n,
  symbol: "bbUSDT",
  name: "BlockAnalytica USDT",
  asset: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
});

export const re7WETH = new VaultConfig({
  address: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
  decimals: 18,
  decimalsOffset: 0n,
  symbol: "re7WETH",
  name: "Re7 WETH",
  asset: addresses[ChainId.EthMainnet].wNative,
});

export const WITH_SIMPLE_PERMIT: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    addresses[ChainId.EthMainnet].wstEth,
    addresses[ChainId.EthMainnet].sDai,
    addresses[ChainId.EthMainnet].osEth,
    addresses[ChainId.EthMainnet].usdc,
    addresses[ChainId.EthMainnet].dai,
  ]),
  [ChainId.BaseMainnet]: new Set([
    addresses[ChainId.BaseMainnet].usdc,
    addresses[ChainId.BaseMainnet].verUsdc,
  ]),
};
