import { ChainId, VaultConfig, addresses } from "@morpho-org/blue-sdk";

export const steakUsdc = new VaultConfig(
  {
    address: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
    decimals: 18,
    decimalsOffset: 12n,
    symbol: "steakUSDC",
    name: "Steakhouse USDC",
    asset: addresses[ChainId.EthMainnet].usdc,
  },
  ChainId.EthMainnet,
);
