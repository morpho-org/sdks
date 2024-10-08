import { Provider } from "ethers";
import { MetaMorpho__factory } from "ethers-types";

import {
  Address,
  ChainId,
  ChainUtils,
  UnknownVaultConfigError,
  VaultConfig,
  _try,
} from "@morpho-org/blue-sdk";

export async function fetchVaultConfig(
  address: Address,
  runner: { provider: Provider },
  { chainId }: { chainId?: ChainId } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  let config = _try(
    () => VaultConfig.get(address, chainId),
    UnknownVaultConfigError,
  );

  if (!config) {
    const mm = MetaMorpho__factory.connect(address, runner);

    // always fetch at latest block because config is immutable
    const [asset, symbol, name, decimals, decimalsOffset] = await Promise.all([
      mm.asset(),
      mm.symbol(),
      mm.name(),
      mm.decimals(),
      mm.DECIMALS_OFFSET(),
    ]);

    config = new VaultConfig(
      {
        address,
        asset,
        symbol,
        name,
        decimals: Number(decimals),
        decimalsOffset,
      },
      chainId,
    );
  }

  return config;
}
