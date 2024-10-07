import {
  ChainId,
  type InputVaultConfig,
  VaultConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/prool-viemtest";

export const vaults = {
  [ChainId.EthMainnet]: {
    steakUsdc: new VaultConfig(
      {
        address: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
        decimals: 18,
        decimalsOffset: 12n,
        symbol: "steakUSDC",
        name: "Steakhouse USDC",
        asset: addresses[ChainId.EthMainnet].usdc,
      },
      ChainId.EthMainnet,
    ),
  },
};

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
